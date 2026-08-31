"""
RAG Pipeline router — POST /api/rag/schedule

Orchestrates all five stages of the telescope scheduling RAG pipeline:
  1. MAST API        — fetch active targets + Guide Star Catalog
  2. Keep-out engine — compute Sun/Earth/Moon keep-out vectors
  3. Context builder — compile valid, mathematically safe coordinate slots
  4. Granite LLM     — evaluate target priorities and choose best slot
  5. Telemetry guard — strict safety guardrails before command execution

Returns either an approved maneuver command or a detailed rejection response.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.mast                import fetch_mast_targets, fetch_guide_stars
from services.keepout             import compute_keepout_vectors
from services.rag_context         import build_rag_context
from services.granite             import evaluate_with_granite
from services.telemetry_validation import validate_maneuver, ManeuverViolation
from services.fov_scan import DEMO_TELESCOPE_ID
from services.demo import (
    DEMO_LAT,
    DEMO_SCIENCE_GOAL,
    demo_safe_pointing,
    demo_mast_observations,
    demo_guide_stars,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rag", tags=["rag_pipeline"])


class ScheduleRequest(BaseModel):
    ra_deg:  float = Field(..., ge=0.0, lt=360.0, description="Target RA (J2000, degrees)")
    dec_deg: float = Field(..., ge=-90.0, le=90.0, description="Target Dec (J2000, degrees)")
    science_goal: str = Field(
        ...,
        min_length=5,
        description="Free-text description of the science objective",
    )
    priority: int = Field(
        default=3,
        ge=1,
        le=5,
        description="Observation priority (1 = highest, 5 = lowest)",
    )
    mission: str = Field(
        default="HST",
        description="Mission filter for MAST query (HST | JWST | …)",
    )
    # Search radii
    mast_radius_deg: float  = Field(default=0.5, ge=0.01, le=5.0)
    gsc_radius_deg:  float  = Field(default=0.1, ge=0.01, le=1.0)
    # Keep-out limits (override defaults for custom missions)
    sun_limit_deg:   float  = Field(default=50.0, ge=10.0)
    moon_limit_deg:  float  = Field(default=10.0, ge=1.0)
    # Observatory latitude for Earth-limb check
    observatory_lat_deg: float = Field(default=28.76)
    # Scheduled execution time (ISO-8601 UTC); defaults to now
    scheduled_at: datetime | None = Field(default=None)
    telescope_id: str | None = Field(
        default=None,
        description="When DEMO, run a guaranteed-safe walkthrough pointing.",
    )


class PipelineResponse(BaseModel):
    approved:           bool
    stage_reached:      str
    chosen_ra_deg:      float | None = None
    chosen_dec_deg:     float | None = None
    justification:      str  | None = None
    contamination_risk: str  | None = None
    granite_confidence: float| None = None
    violations:         list[str]   = []
    keepout_geometry:   dict        = {}
    candidate_stats:    dict        = {}
    validation_checks:  dict        = {}


@router.post("/schedule", response_model=PipelineResponse)
async def schedule_observation(req: ScheduleRequest) -> PipelineResponse:
    """
    Run the full 5-stage RAG pipeline for a telescope pointing request.

    Returns an approved maneuver or a rejection with full diagnostic detail.
    """
    scheduled_at = req.scheduled_at or datetime.now(timezone.utc)
    is_demo = (req.telescope_id or "").upper() == DEMO_TELESCOPE_ID

    if is_demo:
        req.ra_deg, req.dec_deg = demo_safe_pointing(scheduled_at, DEMO_LAT)
        req.science_goal = req.science_goal or DEMO_SCIENCE_GOAL
        req.observatory_lat_deg = DEMO_LAT
        logger.info(
            "DEMO RAG pointing locked to RA=%.4f Dec=%.4f",
            req.ra_deg, req.dec_deg,
        )

    # ── Stage 1: MAST + Guide Star Catalog ───────────────────────────────────
    logger.info(
        "RAG stage 1 — MAST query RA=%.4f Dec=%.4f mission=%s",
        req.ra_deg, req.dec_deg, req.mission,
    )
    if is_demo:
        mast_obs = demo_mast_observations(req.ra_deg, req.dec_deg)
        guide_stars = demo_guide_stars(req.ra_deg, req.dec_deg)
    else:
        mast_obs, guide_stars = await _gather_mast_data(req)

    # ── Stage 2: Keep-out vectors (pre-computed for response payload) ─────────
    logger.info("RAG stage 2 — computing keep-out vectors")
    keepout_vectors = compute_keepout_vectors(scheduled_at)

    # Fetch reflection events from cache/DB for contamination context.
    # We use an in-process import to avoid circular deps at module load.
    if is_demo:
        reflection_events = []
    else:
        reflection_events = await _get_reflection_events(req)

    # ── Stage 3: RAG context builder ─────────────────────────────────────────
    logger.info("RAG stage 3 — building context document")
    context = build_rag_context(
        ra_deg            = req.ra_deg,
        dec_deg           = req.dec_deg,
        science_goal      = req.science_goal,
        priority          = req.priority,
        mast_observations = mast_obs,
        guide_stars       = guide_stars,
        reflection_events = reflection_events,
        dt                = scheduled_at,
        sun_limit_deg     = req.sun_limit_deg,
        moon_limit_deg    = req.moon_limit_deg,
    )

    if not context["safe_slots"]:
        return PipelineResponse(
            approved       = False,
            stage_reached  = "rag_context",
            violations     = [
                "No safe pointing slots found after keep-out filtering. "
                "Check keep-out geometry or widen search radius."
            ],
            keepout_geometry  = keepout_vectors,
            candidate_stats   = context["candidate_count"],
        )

    # ── Stage 4: IBM Granite evaluation ──────────────────────────────────────
    logger.info("RAG stage 4 — Granite LLM evaluation")
    granite = await evaluate_with_granite(context)
    if not granite.get("chosen_slot"):
        return PipelineResponse(
            approved       = False,
            stage_reached  = "granite",
            justification  = granite.get("justification"),
            violations     = ["Granite did not select a pointing slot."],
            keepout_geometry  = keepout_vectors,
            candidate_stats   = context["candidate_count"],
        )

    chosen = granite["chosen_slot"]

    # ── Stage 5: Telemetry validation ─────────────────────────────────────────
    logger.info(
        "RAG stage 5 — validating maneuver to RA=%.4f Dec=%.4f",
        chosen["ra_deg"], chosen["dec_deg"],
    )
    try:
        validation = validate_maneuver(
            ra_deg               = chosen["ra_deg"],
            dec_deg              = chosen["dec_deg"],
            scheduled_at         = scheduled_at,
            granite_result       = granite,
            reflection_events    = reflection_events,
            observatory_lat_deg  = req.observatory_lat_deg,
            sun_limit_deg        = req.sun_limit_deg,
            moon_limit_deg       = req.moon_limit_deg,
        )
    except ManeuverViolation as mv:
        return PipelineResponse(
            approved            = False,
            stage_reached       = "telemetry_validation",
            chosen_ra_deg       = chosen["ra_deg"],
            chosen_dec_deg      = chosen["dec_deg"],
            justification       = granite["justification"],
            contamination_risk  = granite["contamination_risk"],
            granite_confidence  = granite["confidence"],
            violations          = mv.violations,
            keepout_geometry    = keepout_vectors,
            candidate_stats     = context["candidate_count"],
        )

    return PipelineResponse(
        approved            = True,
        stage_reached       = "complete",
        chosen_ra_deg       = chosen["ra_deg"],
        chosen_dec_deg      = chosen["dec_deg"],
        justification       = granite["justification"],
        contamination_risk  = granite["contamination_risk"],
        granite_confidence  = granite["confidence"],
        violations          = [],
        keepout_geometry    = keepout_vectors,
        candidate_stats     = context["candidate_count"],
        validation_checks   = validation["checks"],
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _gather_mast_data(req: ScheduleRequest) -> tuple[list, list]:
    """Run both MAST queries concurrently."""
    import asyncio
    mast_obs, guide_stars = await asyncio.gather(
        fetch_mast_targets(
            req.ra_deg, req.dec_deg,
            radius_deg=req.mast_radius_deg,
            mission=req.mission,
        ),
        fetch_guide_stars(
            req.ra_deg, req.dec_deg,
            radius_deg=req.gsc_radius_deg,
        ),
    )
    return mast_obs, guide_stars


async def _get_reflection_events(req: ScheduleRequest) -> list[dict]:
    """
    Pull the most recent reflection events from the DB for use in the
    contamination context. Returns empty list gracefully on any error.
    """
    try:
        from database import AsyncSessionLocal
        from sqlalchemy import select, text
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                text(
                    "SELECT re.event_time, re.norad_id, re.angle_deg, re.duration_s, s.name "
                    "FROM reflection_events re "
                    "JOIN satellites s ON s.norad_id = re.norad_id "
                    "ORDER BY re.event_time DESC LIMIT 50"
                )
            )
            return [dict(row._mapping) for row in result.all()]
    except Exception as exc:
        logger.warning("Could not fetch reflection events for RAG context: %s", exc)
        return []
