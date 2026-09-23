"""
Streamlit front end for the AI Resume Screener & Recruiter Agent.

This module is intentionally "dumb": it owns presentation only. All
business logic (prompting, calling the model, validating output) lives in
`backend.analyzer` and `backend.schema`, keeping a strict separation of
concerns between UI and domain logic.
"""

import streamlit as st

from backend.analyzer import AnalyzerError, analyze_resume
from backend.resume_parser import (
    SUPPORTED_EXTENSIONS,
    ResumeParseError,
    extract_resume_text,
)
from backend.schema import HiringRecommendation, ScreeningReport

PAGE_TITLE = "AI Resume Screener"
PAGE_ICON = "🧠"

# Color tokens per hiring recommendation, used for the badge and gauge.
_RECOMMENDATION_STYLE: dict[HiringRecommendation, dict[str, str]] = {
    HiringRecommendation.STRONG_PASS: {"color": "#15803d", "bg": "#dcfce7"},
    HiringRecommendation.PROCEED_TO_INTERVIEW: {"color": "#1d4ed8", "bg": "#dbeafe"},
    HiringRecommendation.HOLD: {"color": "#b45309", "bg": "#fef3c7"},
    HiringRecommendation.REJECT: {"color": "#b91c1c", "bg": "#fee2e2"},
}


def _inject_global_styles() -> None:
    """Inject shared CSS used across the report layout."""
    st.markdown(
        """
        <style>
            .block-container {
                padding-top: 2.5rem;
                padding-bottom: 3rem;
                max-width: 1100px;
            }
            .recommendation-badge {
                display: inline-block;
                font-weight: 700;
                font-size: 0.95rem;
                padding: 0.4rem 1rem;
                border-radius: 999px;
                letter-spacing: 0.02em;
            }
            .gauge-wrap {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0.35rem;
            }
            .gauge-ring {
                width: 160px;
                height: 160px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .gauge-inner {
                width: 128px;
                height: 128px;
                border-radius: 50%;
                background: var(--background-color, #ffffff);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
            }
            .gauge-score {
                font-size: 2rem;
                font-weight: 800;
                line-height: 1;
            }
            .gauge-label {
                font-size: 0.75rem;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                opacity: 0.65;
                margin-top: 0.15rem;
            }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _score_color(match_percentage: int) -> str:
    """Map a match percentage to a semantic color.

    Args:
        match_percentage: Integer score from 0-100.

    Returns:
        A hex color string: red for weak fits, amber for moderate fits,
        green for strong fits.
    """
    if match_percentage >= 75:
        return "#16a34a"
    if match_percentage >= 50:
        return "#d97706"
    return "#dc2626"


def _render_gauge(match_percentage: int) -> None:
    """Render a circular percentage gauge using CSS conic-gradient.

    Args:
        match_percentage: Integer score from 0-100 to visualize.
    """
    color = _score_color(match_percentage)
    angle = max(0, min(100, match_percentage)) * 3.6
    st.markdown(
        f"""
        <div class="gauge-wrap">
            <div class="gauge-ring" style="background: conic-gradient(
                {color} {angle}deg, rgba(128,128,128,0.15) {angle}deg);">
                <div class="gauge-inner">
                    <div class="gauge-score" style="color:{color};">
                        {match_percentage}%
                    </div>
                    <div class="gauge-label">Match Score</div>
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_recommendation_badge(recommendation: HiringRecommendation) -> None:
    """Render a color-coded pill badge for the hiring recommendation.

    Args:
        recommendation: The hiring recommendation to display.
    """
    style = _RECOMMENDATION_STYLE[recommendation]
    st.markdown(
        f"""
        <div class="recommendation-badge"
             style="color:{style['color']}; background:{style['bg']};">
            {recommendation.value}
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_bullet_card(title: str, icon: str, items: list[str]) -> None:
    """Render a titled card containing a bulleted list.

    Args:
        title: Card heading text.
        icon: A leading emoji/icon for the heading.
        items: The bullet point strings to render inside the card.
    """
    bullets = "\n".join(f"- {item}" for item in items) or "_None identified._"
    with st.container(border=True):
        st.markdown(f"#### {icon} {title}")
        st.markdown(bullets)


def _render_report(report: ScreeningReport) -> None:
    """Render a full `ScreeningReport` as a polished results section.

    Args:
        report: The validated screening report returned by the analyzer.
    """
    st.divider()
    st.subheader("Screening Report")

    top_left, top_right = st.columns([1, 2], gap="large")
    with top_left:
        _render_gauge(report.match_percentage)
    with top_right:
        st.markdown("##### Hiring Recommendation")
        _render_recommendation_badge(report.hiring_recommendation)
        st.write("")
        st.progress(report.match_percentage / 100)

    st.write("")
    strengths_col, gaps_col = st.columns(2, gap="large")
    with strengths_col:
        _render_bullet_card("Key Strengths", "✅", report.key_strengths)
    with gaps_col:
        _render_bullet_card("Critical Gaps", "⚠️", report.critical_gaps)

    st.write("")
    with st.expander("🎯 Suggested Interview Questions", expanded=True):
        for idx, question in enumerate(report.target_interview_questions, start=1):
            st.markdown(f"**{idx}.** {question}")


def _render_input_form() -> tuple[str, str, bool]:
    """Render the job description / resume input form.

    Returns:
        A tuple of `(job_description, resume_text, submitted)`.
    """
    jd_col, resume_col = st.columns(2, gap="large")

    with jd_col:
        st.markdown("##### 📋 Job Description")
        job_description = st.text_area(
            "Paste the job description",
            height=320,
            placeholder="Paste the full job description here...",
            label_visibility="collapsed",
        )

    with resume_col:
        st.markdown("##### 👤 Candidate Resume")
        uploaded_file = st.file_uploader(
            "Upload a resume: PDF, Word, or plain text (optional)",
            type=SUPPORTED_EXTENSIONS,
        )
        default_resume = ""
        if uploaded_file is not None:
            try:
                default_resume = extract_resume_text(
                    uploaded_file.name, uploaded_file.getvalue()
                )
            except ResumeParseError as exc:
                st.error(str(exc))

        resume_text = st.text_area(
            "Paste the candidate resume",
            value=default_resume,
            height=280,
            placeholder="Paste the candidate's resume here, or upload a file above...",
            label_visibility="collapsed",
        )

    submitted = st.button("🚀 Analyze Candidate", type="primary", use_container_width=True)
    return job_description, resume_text, submitted


def main() -> None:
    """Application entry point."""
    st.set_page_config(page_title=PAGE_TITLE, page_icon=PAGE_ICON, layout="wide")
    _inject_global_styles()

    st.title(f"{PAGE_ICON} AI Resume Screener & Recruiter Agent")
    st.caption(
        "Enterprise-grade candidate screening powered by LLM structured "
        "output. Paste a job description and a resume to generate an "
        "objective, structured hiring assessment."
    )

    job_description, resume_text, submitted = _render_input_form()

    if not submitted:
        return

    if not job_description.strip() or not resume_text.strip():
        st.warning("Please provide both a job description and a resume before analyzing.")
        return

    with st.spinner("Analyzing candidate fit against job requirements..."):
        try:
            report = analyze_resume(resume_text, job_description)
        except AnalyzerError as exc:
            st.error(f"Analysis failed: {exc}")
            return

    _render_report(report)


if __name__ == "__main__":
    main()
