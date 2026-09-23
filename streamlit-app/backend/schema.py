"""
Structured data contracts for the AI Resume Screener.

This module defines the strict schema that the language model is
constrained to return via structured output (JSON schema-constrained
generation). Centralizing the contract here guarantees that every
downstream consumer -- the analyzer, the Streamlit UI, and any future
integration -- shares a single source of truth for what a "screening
report" looks like, regardless of which model provider generated it.
"""

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class HiringRecommendation(str, Enum):
    """Enumerated hiring verdicts the model is allowed to return.

    Constraining this to an enum (rather than a free-text string) removes
    an entire class of bugs where the UI has to fuzzy-match on strings
    like "strong pass" vs "Strong Pass" vs "STRONG_PASS".
    """

    STRONG_PASS = "Strong Pass"
    PROCEED_TO_INTERVIEW = "Proceed to Interview"
    HOLD = "Hold"
    REJECT = "Reject"


class ScreeningReport(BaseModel):
    """The canonical output contract for a single resume screening.

    This model's JSON schema is passed directly to the model provider as
    a structured-output constraint, forcing the response to conform to
    this shape at generation time. `extra="forbid"` ensures the emitted
    JSON schema sets `additionalProperties: false`, which strict
    structured-output modes (e.g. OpenAI-compatible `json_schema` mode)
    require.
    """

    model_config = ConfigDict(extra="forbid")

    match_percentage: int = Field(
        ...,
        ge=0,
        le=100,
        description=(
            "Overall percentage fit of the candidate's resume against the "
            "job description, from 0 (no fit) to 100 (perfect fit)."
        ),
    )
    key_strengths: list[str] = Field(
        ...,
        description=(
            "Concise bullet points highlighting the candidate's strongest "
            "qualifications that directly align with the job description."
        ),
    )
    critical_gaps: list[str] = Field(
        ...,
        description=(
            "Concise bullet points identifying missing skills, experience, "
            "or qualifications the job description requires but the "
            "resume does not demonstrate."
        ),
    )
    target_interview_questions: list[str] = Field(
        ...,
        description=(
            "Tailored interview questions a recruiter should ask to probe "
            "the candidate's critical gaps and validate their claimed "
            "strengths."
        ),
    )
    hiring_recommendation: HiringRecommendation = Field(
        ...,
        description=(
            "The overall hiring recommendation, chosen from a fixed set of "
            "outcomes."
        ),
    )
