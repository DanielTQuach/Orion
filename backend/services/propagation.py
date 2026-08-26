"""
SGP4 orbital propagation service.
Takes a NORAD ID, resolves TLE from cache, and returns
lat/lon/alt at a given UTC datetime (or now).

TEME→ECEF conversion uses the GMST rotation (IAU 1982 sidereal time),
which is accurate to ~1 km for LEO satellites.
"""
import logging
import math
from datetime import datetime, timezone, timedelta
from sgp4.api import Satrec, jday
from services.celestrak import get_tle

logger = logging.getLogger(__name__)


def _datetime_to_jd(dt: datetime) -> tuple[float, float]:
    """Convert a UTC datetime to Julian date (integer + fraction)."""
    return jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)


def _gmst(jd_ut1: float, jd_frac: float) -> float:
    """
    Greenwich Mean Sidereal Time (radians) via IAU 1982 formula.
    Accurate to ~0.1 arcsec over a century — sufficient for satellite display.
    """
    tut1 = ((jd_ut1 - 2451545.0) + jd_frac) / 36525.0
    gmst_sec = (
        67310.54841
        + (876600.0 * 3600.0 + 8640184.812866) * tut1
        + 0.093104 * tut1 ** 2
        - 6.2e-6 * tut1 ** 3
    )
    return math.fmod(math.radians(gmst_sec / 240.0), 2 * math.pi)


def _teme_to_ecef(x_teme: float, y_teme: float, z_teme: float, theta: float) -> tuple[float, float, float]:
    """Rotate TEME position vector to ECEF using GMST angle theta (radians)."""
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    x_ecef =  cos_t * x_teme + sin_t * y_teme
    y_ecef = -sin_t * x_teme + cos_t * y_teme
    z_ecef =  z_teme
    return x_ecef, y_ecef, z_ecef


def _ecef_to_geodetic(x_km: float, y_km: float, z_km: float) -> tuple[float, float, float]:
    """
    Convert ECEF (km) to geodetic lat/lon (degrees) + altitude (km).
    Bowring iterative method, WGS84.
    """
    a  = 6378.137
    f  = 1 / 298.257223563
    b  = a * (1 - f)
    e2 = 1 - (b / a) ** 2

    lon = math.degrees(math.atan2(y_km, x_km))
    p   = math.sqrt(x_km ** 2 + y_km ** 2)
    lat = math.degrees(math.atan2(z_km, p * (1 - e2)))

    for _ in range(10):
        lat_r = math.radians(lat)
        N     = a / math.sqrt(1 - e2 * math.sin(lat_r) ** 2)
        lat   = math.degrees(math.atan2(z_km + e2 * N * math.sin(lat_r), p))

    lat_r = math.radians(lat)
    N     = a / math.sqrt(1 - e2 * math.sin(lat_r) ** 2)
    alt   = p / math.cos(lat_r) - N if abs(lat) < 89.9 else z_km / math.sin(lat_r) - N * (1 - e2)

    return lat, lon, alt


def _velocity_km_s(vx: float, vy: float, vz: float) -> float:
    return math.sqrt(vx ** 2 + vy ** 2 + vz ** 2)


def propagate(norad_id: int, at: datetime | None = None) -> dict | None:
    """
    Propagate a satellite to a given UTC time (defaults to now).
    Returns position dict or None on cache miss / SGP4 error.
    """
    tle = get_tle(norad_id)
    if not tle or not tle.get("tle_line1") or not tle.get("tle_line2"):
        logger.warning("No cached TLE for NORAD %d", norad_id)
        return None

    sat = Satrec.twoline2rv(tle["tle_line1"], tle["tle_line2"])
    dt  = at or datetime.now(timezone.utc)
    jd, fr = _datetime_to_jd(dt)

    e, r, v = sat.sgp4(jd, fr)
    if e != 0:
        logger.warning("SGP4 error %d for NORAD %d", e, norad_id)
        return None

    # TEME → ECEF via GMST rotation
    theta            = _gmst(jd, fr)
    x_ecef, y_ecef, z_ecef = _teme_to_ecef(r[0], r[1], r[2], theta)
    lat, lon, alt    = _ecef_to_geodetic(x_ecef, y_ecef, z_ecef)
    speed_km_s       = _velocity_km_s(*v)

    return {
        "norad_id":   norad_id,
        "name":       tle.get("name", ""),
        "lat":        round(lat, 6),
        "lon":        round(lon, 6),
        "alt_km":     round(alt, 3),
        "speed_km_s": round(speed_km_s, 4),
        "x_km":       round(x_ecef, 3),
        "y_km":       round(y_ecef, 3),
        "z_km":       round(z_ecef, 3),
        "timestamp":  dt.isoformat(),
    }


def ground_track(
    norad_id: int,
    steps: int = 90,
    step_seconds: int = 60,
    start: datetime | None = None,
) -> list[dict] | None:
    """
    Compute a ground track: `steps` positions at `step_seconds` intervals
    starting from `start` (defaults to now). Returns a list of {lat, lon, alt_km}
    or None if no TLE is cached.
    """
    tle = get_tle(norad_id)
    if not tle or not tle.get("tle_line1") or not tle.get("tle_line2"):
        return None

    sat   = Satrec.twoline2rv(tle["tle_line1"], tle["tle_line2"])
    t0    = start or datetime.now(timezone.utc)
    track = []

    for i in range(steps):
        dt       = t0 + timedelta(seconds=i * step_seconds)
        jd, fr   = _datetime_to_jd(dt)
        e, r, v  = sat.sgp4(jd, fr)
        if e != 0:
            continue
        theta            = _gmst(jd, fr)
        x, y, z          = _teme_to_ecef(r[0], r[1], r[2], theta)
        lat, lon, alt    = _ecef_to_geodetic(x, y, z)
        track.append({
            "lat":       round(lat, 5),
            "lon":       round(lon, 5),
            "alt_km":    round(alt, 2),
            "timestamp": dt.isoformat(),
        })

    return track
