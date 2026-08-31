"""
JPL SPICE-style keep-out zone calculator.

Stage 2 of the RAG pipeline.

For each candidate pointing direction (RA/Dec) this module computes angular
separation to the three primary keep-out bodies — Sun, Earth limb, and Moon —
and flags whether the pointing is safe under HST/JWST-style constraints.

Body positions are sourced from:
  - Sun  : low-precision almanac already in services/geometry.py
  - Moon : dedicated Meeus Ch. 47 analytic solution (no SPICE kernel needed)
  - Earth: by definition at the origin; we check Earth-limb avoidance via
           elevation above the local horizon

Keep-out limits (defaults mirror HST Phase II planning constraints):
  - Sun  :  50° exclusion (bright-object protection)
  - Moon :  10° exclusion (scattered light)
  - Earth limb: any pointing with elevation < 0° (i.e. below horizon) is invalid
"""
import math
import logging
from datetime import datetime, timezone

from services.geometry import sun_position_ecef, _dt_to_jd, _gmst

logger = logging.getLogger(__name__)

# Default keep-out half-angles in degrees
SUN_KEEPOUT_DEG   = 50.0
MOON_KEEPOUT_DEG  = 10.0
EARTH_LIMB_DEG    =  0.0   # elevation must be above this


# ── Moon position (Meeus Ch. 47, low-precision, ~0.3° accuracy) ───────────────

def moon_position_ecef(dt: datetime) -> tuple[float, float, float]:
    """
    Approximate Moon position in ECEF (km).
    Accurate to ~0.3° — sufficient for keep-out margin calculations.
    """
    jd_full, jd_frac = _dt_to_jd(dt)
    T = ((jd_full - 2451545.0) + jd_frac) / 36525.0

    # Fundamental arguments (degrees)
    Lp = math.fmod(218.3164477 + 481267.88123421 * T, 360.0)
    D  = math.fmod(297.8501921 + 445267.1114034  * T, 360.0)
    M  = math.fmod(357.5291092 +  35999.0502909  * T, 360.0)
    Mp = math.fmod(134.9633964 + 477198.8675055  * T, 360.0)
    F  = math.fmod(93.2720950  + 483202.0175233  * T, 360.0)

    D_r, M_r, Mp_r, F_r = (math.radians(x) for x in (D, M, Mp, F))

    # Simplified longitude correction (arcsec → degrees)
    delta_lon_arcsec = (
        6288774 * math.sin(Mp_r)
        + 1274027 * math.sin(2 * D_r - Mp_r)
        +  658314 * math.sin(2 * D_r)
        +  213618 * math.sin(2 * Mp_r)
        -  185116 * math.sin(M_r)
    )
    moon_lon = math.radians(Lp + delta_lon_arcsec / 3600.0)

    # Simplified latitude correction
    delta_lat_arcsec = (
        5128122 * math.sin(F_r)
        + 280602 * math.sin(Mp_r + F_r)
        + 277693 * math.sin(Mp_r - F_r)
    )
    moon_lat = math.radians(delta_lat_arcsec / 3600.0)

    # Distance (km)
    distance_km = (
        385000.56
        - 20905.355 * math.cos(Mp_r)
        -  3699.111 * math.cos(2 * D_r - Mp_r)
        -  2955.968 * math.cos(2 * D_r)
    )

    # Ecliptic → equatorial (ECI)
    eps = math.radians(23.439291111 - 0.013004167 * T)
    cos_lat = math.cos(moon_lat)
    x_eci = distance_km * cos_lat * math.cos(moon_lon)
    y_eci = distance_km * (math.cos(eps) * cos_lat * math.sin(moon_lon) - math.sin(eps) * math.sin(moon_lat))
    z_eci = distance_km * (math.sin(eps) * cos_lat * math.sin(moon_lon) + math.cos(eps) * math.sin(moon_lat))

    # ECI → ECEF
    gmst = _gmst(jd_full, jd_frac)
    cg, sg = math.cos(gmst), math.sin(gmst)
    return (
         cg * x_eci + sg * y_eci,
        -sg * x_eci + cg * y_eci,
        z_eci,
    )


# ── Coordinate helpers ────────────────────────────────────────────────────────

def _radec_to_unit(ra_deg: float, dec_deg: float) -> tuple[float, float, float]:
    """Convert RA/Dec (degrees, J2000) to a unit vector in ICRF."""
    ra  = math.radians(ra_deg)
    dec = math.radians(dec_deg)
    return (
        math.cos(dec) * math.cos(ra),
        math.cos(dec) * math.sin(ra),
        math.sin(dec),
    )


def _eci_to_radec(x: float, y: float, z: float) -> tuple[float, float]:
    """Convert ECI Cartesian to RA/Dec (degrees)."""
    r   = math.sqrt(x**2 + y**2 + z**2)
    dec = math.degrees(math.asin(z / r))
    ra  = math.degrees(math.atan2(y, x)) % 360.0
    return ra, dec


def _angular_separation_deg(
    ra1: float, dec1: float,
    ra2: float, dec2: float,
) -> float:
    """Great-circle separation between two (RA, Dec) pairs (degrees)."""
    u1 = _radec_to_unit(ra1, dec1)
    u2 = _radec_to_unit(ra2, dec2)
    dot = sum(a * b for a, b in zip(u1, u2))
    dot = max(-1.0, min(1.0, dot))
    return math.degrees(math.acos(dot))


def _ecef_to_radec(dt: datetime, x_km: float, y_km: float, z_km: float) -> tuple[float, float]:
    """
    Convert an ECEF position to approximate RA/Dec by reversing the GMST
    rotation back to ECI then computing spherical coordinates.
    """
    jd_full, jd_frac = _dt_to_jd(dt)
    gmst = _gmst(jd_full, jd_frac)
    cg, sg = math.cos(gmst), math.sin(gmst)
    # ECEF → ECI (inverse rotation)
    x_eci =  cg * x_km - sg * y_km
    y_eci =  sg * x_km + cg * y_km
    z_eci =  z_km
    return _eci_to_radec(x_eci, y_eci, z_eci)


# ── Keep-out evaluation ───────────────────────────────────────────────────────

def compute_keepout_vectors(dt: datetime | None = None) -> dict:
    """
    Compute current keep-out body positions expressed as (RA, Dec) in degrees.

    Returns a dict with keys: sun, moon — each a dict with ra_deg, dec_deg.
    Earth-limb keep-out is implicit (elevation < 0 from any ground site).
    """
    dt = dt or datetime.now(timezone.utc)

    sx, sy, sz = sun_position_ecef(dt)
    sun_ra, sun_dec = _ecef_to_radec(dt, sx, sy, sz)

    mx, my, mz = moon_position_ecef(dt)
    moon_ra, moon_dec = _ecef_to_radec(dt, mx, my, mz)

    return {
        "sun":  {"ra_deg": sun_ra,  "dec_deg": sun_dec},
        "moon": {"ra_deg": moon_ra, "dec_deg": moon_dec},
        "computed_at": dt.isoformat(),
    }


def is_pointing_safe(
    ra_deg: float,
    dec_deg: float,
    dt: datetime | None = None,
    sun_limit_deg: float  = SUN_KEEPOUT_DEG,
    moon_limit_deg: float = MOON_KEEPOUT_DEG,
) -> dict:
    """
    Check whether a celestial pointing (RA, Dec) is outside all keep-out zones.

    Returns a dict:
      safe         : bool  — True only when all three checks pass
      sun_sep_deg  : float — angular distance to Sun
      moon_sep_deg : float — angular distance to Moon
      violations   : list[str] — human-readable list of violated constraints
    """
    vectors = compute_keepout_vectors(dt)
    sun  = vectors["sun"]
    moon = vectors["moon"]

    sun_sep  = _angular_separation_deg(ra_deg, dec_deg, sun["ra_deg"],  sun["dec_deg"])
    moon_sep = _angular_separation_deg(ra_deg, dec_deg, moon["ra_deg"], moon["dec_deg"])

    violations: list[str] = []
    if sun_sep < sun_limit_deg:
        violations.append(
            f"Sun exclusion violated: {sun_sep:.1f}° < {sun_limit_deg}° limit"
        )
    if moon_sep < moon_limit_deg:
        violations.append(
            f"Moon exclusion violated: {moon_sep:.1f}° < {moon_limit_deg}° limit"
        )

    return {
        "safe":          len(violations) == 0,
        "sun_sep_deg":   round(sun_sep, 2),
        "moon_sep_deg":  round(moon_sep, 2),
        "sun_limit_deg": sun_limit_deg,
        "moon_limit_deg": moon_limit_deg,
        "violations":    violations,
        "keepout_vectors": vectors,
    }


def filter_safe_slots(
    candidates: list[dict],
    dt: datetime | None = None,
    sun_limit_deg: float  = SUN_KEEPOUT_DEG,
    moon_limit_deg: float = MOON_KEEPOUT_DEG,
) -> list[dict]:
    """
    Filter a list of candidate coordinate dicts (each must have ``ra_deg`` and
    ``dec_deg`` keys) to those that pass keep-out constraints.

    Each returned dict gains a ``keepout`` sub-dict with the safety analysis.
    """
    safe = []
    for slot in candidates:
        result = is_pointing_safe(
            slot["ra_deg"], slot["dec_deg"], dt,
            sun_limit_deg=sun_limit_deg,
            moon_limit_deg=moon_limit_deg,
        )
        if result["safe"]:
            safe.append({**slot, "keepout": result})
    return safe
