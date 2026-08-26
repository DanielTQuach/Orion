"""
SGP4 orbital propagation service.
Takes a NORAD ID, resolves TLE from cache, and returns
lat/lon/alt at a given UTC datetime (or now).
"""
import logging
from datetime import datetime, timezone
from sgp4.api import Satrec, WGS84
from sgp4.conveniences import sat_epoch_datetime
import math
from services.celestrak import get_tle

logger = logging.getLogger(__name__)


def _ecef_to_geodetic(x_km: float, y_km: float, z_km: float) -> tuple[float, float, float]:
    """
    Convert ECEF (km) to geodetic lat/lon (degrees) + altitude (km).
    Uses WGS84 iterative method.
    """
    a = 6378.137          # WGS84 semi-major axis (km)
    f = 1 / 298.257223563
    b = a * (1 - f)
    e2 = 1 - (b / a) ** 2

    lon = math.degrees(math.atan2(y_km, x_km))
    p = math.sqrt(x_km ** 2 + y_km ** 2)
    lat = math.degrees(math.atan2(z_km, p * (1 - e2)))  # initial estimate

    for _ in range(10):
        lat_r = math.radians(lat)
        N = a / math.sqrt(1 - e2 * math.sin(lat_r) ** 2)
        lat = math.degrees(math.atan2(z_km + e2 * N * math.sin(lat_r), p))

    lat_r = math.radians(lat)
    N = a / math.sqrt(1 - e2 * math.sin(lat_r) ** 2)
    alt = p / math.cos(lat_r) - N if abs(lat) < 89.9 else z_km / math.sin(lat_r) - N * (1 - e2)

    return lat, lon, alt


def propagate(norad_id: int, at: datetime | None = None) -> dict | None:
    """
    Propagate a satellite to a given UTC time (defaults to now).
    Returns {"lat", "lon", "alt_km", "x_km", "y_km", "z_km", "timestamp"} or None.
    """
    tle = get_tle(norad_id)
    if not tle:
        logger.warning("No cached TLE for NORAD %d", norad_id)
        return None

    if not tle.get("tle_line1") or not tle.get("tle_line2"):
        logger.warning("Incomplete TLE for NORAD %d", norad_id)
        return None

    sat = Satrec.twoline2rv(tle["tle_line1"], tle["tle_line2"])

    dt = at or datetime.now(timezone.utc)
    jd, fr = _datetime_to_jd(dt)

    e, r, v = sat.sgp4(jd, fr)
    if e != 0:
        logger.warning("SGP4 error %d for NORAD %d", e, norad_id)
        return None

    # r is TEME (km) — for Phase 2 we treat it as approximate ECEF
    # (proper TEME→ECEF frame rotation added in Phase 4)
    x, y, z = r
    lat, lon, alt = _ecef_to_geodetic(x, y, z)

    return {
        "norad_id": norad_id,
        "name": tle.get("name", ""),
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "alt_km": round(alt, 3),
        "x_km": round(x, 3),
        "y_km": round(y, 3),
        "z_km": round(z, 3),
        "timestamp": dt.isoformat(),
    }


def _datetime_to_jd(dt: datetime) -> tuple[float, float]:
    """Convert a UTC datetime to Julian date split into integer + fraction."""
    # Julian date of J2000.0 = 2451545.0
    from sgp4.api import jday
    return jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)
