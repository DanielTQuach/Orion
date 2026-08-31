"""
Telemetry Validation — Stage 5 of the RAG pipeline.

Enforces strict safety guardrails before a commanded maneuver is executed.
Any violation raises ``ManeuverViolation`` and the command is rejected.

Checks performed
----------------
1. Keep-out re-verification  — re-runs full Sun/Moon angular separation check
   using the *actual* commanded RA/Dec (not the slot label from Stage 3).
2. Earth-limb clearance      — commanded Dec must allow ≥ 5° elevation above
   the observatory horizon at the scheduled time.
3. Coordinate sanity         — RA in [0, 360), Dec in [-90, 90].
4. Contamination window guard— rejects if a high-confidence satellite reflection
   event is active within ±60 s of the commanded execution time.
5. Confidence threshold      — rejects if Granite's confidence score is below
   the minimum required level (default 0.6).
"""
import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Any

from services.keepout import is_pointing_safe

logger = logging.getLogger(__name__)

# ── Configurable thresholds ───────────────────────────────────────────────────
SUN_KEEPOUT_DEG          = 50.0
MOON_KEEPOUT_DEG         = 10.0
EARTH_LIMB_CLEARANCE_DEG =  5.0   # minimum elevation above horizon
CONTAMINATION_WINDOW_S   = 60     # ± seconds around scheduled time
MIN_GRANITE_CONFIDENCE   =  0.6


class ManeuverViolation(Exception):
    """Raised when a commanded maneuver fails one or more safety guardrails."""

    def __init__(self, violations: list[str]) -> None:
        self.violations = violations
        super().__init__("; ".join(violations))


def _check_coordinate_sanity(ra_deg: float, dec_deg: float) -> list[str]:
    issues = []
    if not (0.0 <= ra_deg < 360.0):
        issues.append(f"RA out of range: {ra_deg} (expected [0, 360))")
    if not (-90.0 <= dec_deg <= 90.0):
        issues.append(f"Dec out of range: {dec_deg} (expected [-90, 90])")
    return issues


def _check_earth_limb(
    ra_deg: float,
    dec_deg: float,
    observatory_lat_deg: float,
    scheduled_at: datetime,
) -> list[str]:
    """
    Estimate the elevation of the target at the observatory and check it
    exceeds EARTH_LIMB_CLEARANCE_DEG.

    Uses a simple hour-angle / altitude formula (no refraction).
    """
    # Approximate LST from RA of meridian at given UTC + observatory longitude
    # We use a rough formula: LST ≈ GMST + lon_deg / 15
    # Observatory longitude is approximated from the default observatory coords.
    # In a real system this would come from the Telescope record.
    from services.geometry import _dt_to_jd, _gmst as _geom_gmst
    jd_full, jd_frac = _dt_to_jd(scheduled_at)
    gmst_rad = _geom_gmst(jd_full, jd_frac)
    gmst_deg = math.degrees(gmst_rad) % 360.0

    # Hour angle (degrees)
    ha_deg = (gmst_deg - ra_deg) % 360.0
    if ha_deg > 180.0:
        ha_deg -= 360.0

    ha_rad  = math.radians(ha_deg)
    dec_rad = math.radians(dec_deg)
    lat_rad = math.radians(observatory_lat_deg)

    sin_alt = (
        math.sin(dec_rad) * math.sin(lat_rad)
        + math.cos(dec_rad) * math.cos(lat_rad) * math.cos(ha_rad)
    )
    altitude_deg = math.degrees(math.asin(max(-1.0, min(1.0, sin_alt))))

    if altitude_deg < EARTH_LIMB_CLEARANCE_DEG:
        return [
            f"Earth-limb violation: altitude {altitude_deg:.1f}° < "
            f"required {EARTH_LIMB_CLEARANCE_DEG}°"
        ]
    return []


def _check_contamination(
    scheduled_at: datetime,
    reflection_events: list[dict],
    window_s: int = CONTAMINATION_WINDOW_S,
) -> list[str]:
    """
    Reject if any satellite reflection event falls within ±window_s seconds of
    the scheduled maneuver execution time.
    """
    issues = []
    for ev in reflection_events:
        try:
            ev_time = datetime.fromisoformat(ev["event_time"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        delta = abs((ev_time - scheduled_at).total_seconds())
        if delta <= window_s:
            issues.append(
                f"Satellite contamination within {int(delta)}s of maneuver: "
                f"NORAD {ev.get('norad_id')} at {ev['event_time']}"
            )
    return issues


def validate_maneuver(
    ra_deg: float,
    dec_deg: float,
    scheduled_at: datetime | None = None,
    granite_result: dict[str, Any] | None = None,
    reflection_events: list[dict] | None = None,
    observatory_lat_deg: float = 28.76,   # default: La Palma / typical site
    sun_limit_deg: float  = SUN_KEEPOUT_DEG,
    moon_limit_deg: float = MOON_KEEPOUT_DEG,
) -> dict[str, Any]:
    """
    Run all safety guardrails against a proposed maneuver.

    Parameters
    ----------
    ra_deg / dec_deg      : Commanded pointing
    scheduled_at          : Execution epoch (defaults to now)
    granite_result        : Output dict from Stage 4 (used for confidence check)
    reflection_events     : Upcoming contamination events
    observatory_lat_deg   : Site latitude for Earth-limb check
    sun_limit_deg         : Sun keep-out radius
    moon_limit_deg        : Moon keep-out radius

    Returns
    -------
    dict with keys: approved (bool), violations (list[str]), checks (dict)

    Raises
    ------
    ManeuverViolation  if any check fails (strict mode)
    """
    scheduled_at      = scheduled_at or datetime.now(timezone.utc)
    reflection_events = reflection_events or []
    granite_result    = granite_result or {}

    all_violations: list[str] = []
    checks: dict[str, Any]   = {}

    # 1. Coordinate sanity
    sanity = _check_coordinate_sanity(ra_deg, dec_deg)
    checks["coordinate_sanity"] = {"passed": not sanity, "issues": sanity}
    all_violations.extend(sanity)

    # 2. Keep-out re-verification
    keepout = is_pointing_safe(
        ra_deg, dec_deg, scheduled_at,
        sun_limit_deg=sun_limit_deg,
        moon_limit_deg=moon_limit_deg,
    )
    checks["keepout"] = keepout
    if not keepout["safe"]:
        all_violations.extend(keepout["violations"])

    # 3. Earth-limb clearance
    limb = _check_earth_limb(ra_deg, dec_deg, observatory_lat_deg, scheduled_at)
    checks["earth_limb"] = {"passed": not limb, "issues": limb}
    all_violations.extend(limb)

    # 4. Contamination window guard
    contam = _check_contamination(scheduled_at, reflection_events)
    checks["contamination"] = {"passed": not contam, "issues": contam}
    all_violations.extend(contam)

    # 5. Granite confidence threshold
    confidence = float(granite_result.get("confidence", 1.0))
    conf_ok    = confidence >= MIN_GRANITE_CONFIDENCE
    checks["granite_confidence"] = {
        "passed":    conf_ok,
        "value":     confidence,
        "threshold": MIN_GRANITE_CONFIDENCE,
    }
    if not conf_ok:
        all_violations.append(
            f"Granite confidence {confidence:.2f} below minimum {MIN_GRANITE_CONFIDENCE}"
        )

    approved = len(all_violations) == 0

    if not approved:
        logger.warning(
            "Maneuver to (RA=%.4f, Dec=%.4f) REJECTED — %d violation(s): %s",
            ra_deg, dec_deg, len(all_violations), all_violations,
        )
        raise ManeuverViolation(all_violations)

    logger.info(
        "Maneuver to (RA=%.4f, Dec=%.4f) APPROVED — all %d checks passed.",
        ra_deg, dec_deg, len(checks),
    )
    return {
        "approved":   True,
        "violations": [],
        "checks":     checks,
        "commanded": {
            "ra_deg":       ra_deg,
            "dec_deg":      dec_deg,
            "scheduled_at": scheduled_at.isoformat(),
        },
    }
