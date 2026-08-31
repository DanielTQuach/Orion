"""
RAG Context Builder.

Stage 3 of the RAG pipeline.

Takes the raw MAST observations + Guide Star Catalog entries returned by
Stage 1, the keep-out analysis from Stage 2, and assembles a structured
context document that the Granite LLM (Stage 4) can reason over.

The context captures:
  - The original pointing request (target RA/Dec, science goal, priority)
  - A ranked list of mathematically safe alternative coordinate slots derived
    from the MAST active-observation field and nearby guide-star positions
  - The current keep-out geometry (Sun/Moon separations)
  - Satellite contamination windows pulled from the existing Orion reflection
    event store, so the LLM can factor in fringe-visibility timing
"""
import logging
import math
from datetime import datetime, timezone
from typing import Any

from services.keepout import filter_safe_slots, compute_keepout_vectors

logger = logging.getLogger(__name__)

# Angular grid half-width and step size (degrees) used to propose dither slots
DITHER_RADIUS_DEG = 0.5
DITHER_STEP_DEG   = 0.1


def _generate_dither_grid(
    ra_center: float,
    dec_center: float,
    radius_deg: float = DITHER_RADIUS_DEG,
    step_deg: float   = DITHER_STEP_DEG,
) -> list[dict]:
    """
    Produce a small RA/Dec grid of candidate slots centred on the requested
    pointing.  Steps are corrected for cos(dec) to keep physical spacing
    uniform on the sky.
    """
    cos_dec = math.cos(math.radians(dec_center)) or 1e-9
    slots   = []
    n       = int(radius_deg / step_deg)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            ra  = ra_center  + (i * step_deg) / cos_dec
            dec = dec_center + (j * step_deg)
            slots.append({
                "ra_deg":  round(ra  % 360.0, 6),
                "dec_deg": round(max(-90.0, min(90.0, dec)), 6),
                "origin":  "dither_grid",
            })
    return slots


def _slots_from_mast(observations: list[dict]) -> list[dict]:
    """Extract RA/Dec slots from MAST observation records."""
    slots = []
    for obs in observations:
        ra  = obs.get("s_ra")  or obs.get("ra")
        dec = obs.get("s_dec") or obs.get("dec")
        if ra is None or dec is None:
            continue
        slots.append({
            "ra_deg":     float(ra),
            "dec_deg":    float(dec),
            "origin":     "mast_observation",
            "obs_id":     obs.get("obs_id", ""),
            "target_name": obs.get("target_name", ""),
            "t_exptime":  obs.get("t_exptime"),
        })
    return slots


def _slots_from_guide_stars(stars: list[dict]) -> list[dict]:
    """Extract RA/Dec slots from GSC2 guide-star records."""
    slots = []
    for star in stars:
        ra  = star.get("ra")  or star.get("RAJ2000")
        dec = star.get("dec") or star.get("DEJ2000")
        if ra is None or dec is None:
            continue
        slots.append({
            "ra_deg":        float(ra),
            "dec_deg":       float(dec),
            "origin":        "guide_star_catalog",
            "gsc_id":        star.get("hstID") or star.get("GSC2ID", ""),
            "classification": star.get("classification"),
            "Vmag":          star.get("Vmag"),
        })
    return slots


def _summarise_reflections(reflection_events: list[dict]) -> list[dict]:
    """
    Distil raw ReflectionEvent rows into a compact summary list the LLM can
    parse quickly.  Each entry notes time, satellite, and specular angle.
    """
    return [
        {
            "event_time":  ev.get("event_time"),
            "norad_id":    ev.get("norad_id"),
            "sat_name":    ev.get("name", ""),
            "angle_deg":   ev.get("angle_deg"),
            "duration_s":  ev.get("duration_s"),
        }
        for ev in reflection_events
    ]


def build_rag_context(
    ra_deg: float,
    dec_deg: float,
    science_goal: str,
    priority: int,
    mast_observations: list[dict],
    guide_stars: list[dict],
    reflection_events: list[dict],
    dt: datetime | None = None,
    sun_limit_deg: float  = 50.0,
    moon_limit_deg: float = 10.0,
) -> dict[str, Any]:
    """
    Compile all upstream data into a structured RAG context document.

    Parameters
    ----------
    ra_deg / dec_deg   : Requested target pointing (J2000)
    science_goal       : Free-text description of the observation goal
    priority           : Integer priority (1 = highest)
    mast_observations  : Observations from Stage 1 MAST query
    guide_stars        : Guide stars from Stage 1 GSC2 query
    reflection_events  : Current/upcoming satellite contamination events
    dt                 : Reference epoch (defaults to now)
    sun_limit_deg      : Keep-out radius around the Sun
    moon_limit_deg     : Keep-out radius around the Moon

    Returns
    -------
    A dict structured as the LLM context payload for Stage 4.
    """
    dt = dt or datetime.now(timezone.utc)

    # ── Collect candidate slots ──────────────────────────────────────────────
    dither_slots     = _generate_dither_grid(ra_deg, dec_deg)
    mast_slots       = _slots_from_mast(mast_observations)
    guide_star_slots = _slots_from_guide_stars(guide_stars)

    all_candidates = dither_slots + mast_slots + guide_star_slots

    # De-duplicate by rounding to 4 decimal places
    seen   = set()
    unique = []
    for slot in all_candidates:
        key = (round(slot["ra_deg"], 4), round(slot["dec_deg"], 4))
        if key not in seen:
            seen.add(key)
            unique.append(slot)

    # ── Apply keep-out filter (Stage 2) ─────────────────────────────────────
    safe_slots = filter_safe_slots(
        unique, dt=dt,
        sun_limit_deg=sun_limit_deg,
        moon_limit_deg=moon_limit_deg,
    )

    # Sort by Sun separation descending (most sun-safe first)
    safe_slots.sort(key=lambda s: s["keepout"]["sun_sep_deg"], reverse=True)

    keepout_vectors = compute_keepout_vectors(dt)

    # ── Assemble context document ────────────────────────────────────────────
    context: dict[str, Any] = {
        "meta": {
            "pipeline_stage": "rag_context_builder",
            "computed_at":    dt.isoformat(),
        },
        "request": {
            "ra_deg":       ra_deg,
            "dec_deg":      dec_deg,
            "science_goal": science_goal,
            "priority":     priority,
        },
        "keepout_geometry": {
            "sun":  keepout_vectors["sun"],
            "moon": keepout_vectors["moon"],
            "sun_exclusion_deg":  sun_limit_deg,
            "moon_exclusion_deg": moon_limit_deg,
        },
        "safe_slots": safe_slots[:20],      # cap at 20 for LLM token budget
        "candidate_count": {
            "total_before_filter": len(unique),
            "safe_after_filter":   len(safe_slots),
        },
        "satellite_contamination": {
            "event_count":  len(reflection_events),
            "events":       _summarise_reflections(reflection_events[:10]),
        },
        "mast_context": {
            "observation_count": len(mast_observations),
            "sample":            mast_observations[:5],
        },
        "guide_star_context": {
            "star_count": len(guide_stars),
            "sample":     guide_stars[:5],
        },
    }

    logger.info(
        "RAG context built: %d candidates → %d safe slots, %d reflection events",
        len(unique), len(safe_slots), len(reflection_events),
    )
    return context
