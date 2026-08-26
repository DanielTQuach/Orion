"""
Reflection geometry engine.

Given a satellite position, a Sun position, and a telescope position
(all in ECEF km), determines whether the satellite is producing a
specular reflection towards the telescope.

The specular condition:
  The satellite's surface reflects sunlight towards the telescope when
  the bisector of (Sun→Sat) and (Telescope→Sat) is near zero length,
  i.e. the angle between the two unit vectors is below a threshold.

  angle = acos( dot(sun_hat, tel_hat) )

  where:
    sun_hat = unit( Sat - Sun )       # direction of incoming sunlight
    tel_hat = unit( Sat - Telescope ) # direction from sat to telescope

  A specular reflection occurs when angle < threshold (default 1.0°).

References:
  Hainaut & Williams (2020) — modelling satellite brightness
  Mallama (2021) — specular reflection geometry
"""
import math
import logging
from datetime import datetime, timezone
from sgp4.api import jday

logger = logging.getLogger(__name__)

# Reflection angle threshold in degrees — satellites with flatter panels
# can produce flares over a wider angle; 1° is conservative.
DEFAULT_THRESHOLD_DEG = 1.0

# Earth shadow threshold — skip geometry if satellite is in Earth's shadow
EARTH_RADIUS_KM = 6371.0


# ── Sun position ─────────────────────────────────────────────────────────────

def sun_position_ecef(dt: datetime) -> tuple[float, float, float]:
    """
    Approximate Sun position in ECEF (km) using a low-precision solar
    almanac (accurate to ~0.01° over ±100 years).

    Based on: Astronomical Algorithms, Meeus (1998), Ch. 25
    """
    jd_full, jd_frac = _dt_to_jd(dt)
    T = ((jd_full - 2451545.0) + jd_frac) / 36525.0  # Julian centuries from J2000

    # Geometric mean longitude and mean anomaly of the Sun (degrees)
    L0 = math.fmod(280.46646 + 36000.76983 * T, 360.0)
    M  = math.radians(math.fmod(357.52911 + 35999.05029 * T - 0.0001537 * T**2, 360.0))

    # Equation of centre
    C = (
        (1.914602 - 0.004817 * T - 0.000014 * T**2) * math.sin(M)
        + (0.019993 - 0.000101 * T) * math.sin(2 * M)
        + 0.000289 * math.sin(3 * M)
    )

    # Sun's true longitude (degrees) and distance (AU)
    sun_lon = math.radians(L0 + C)
    sun_r_au = (1.000001018 * (1 - 0.016708634**2)) / (
        1 + 0.016708634 * math.cos(M + math.radians(C))
    )
    AU_KM = 149_597_870.7

    # Obliquity of the ecliptic
    eps = math.radians(23.439291111 - 0.013004167 * T)

    # Ecliptic → equatorial (ECI J2000)
    x_eci = sun_r_au * AU_KM * math.cos(sun_lon)
    y_eci = sun_r_au * AU_KM * math.cos(eps) * math.sin(sun_lon)
    z_eci = sun_r_au * AU_KM * math.sin(eps) * math.sin(sun_lon)

    # ECI → ECEF via GMST rotation
    gmst = _gmst(jd_full, jd_frac)
    cos_g, sin_g = math.cos(gmst), math.sin(gmst)
    x_ecef =  cos_g * x_eci + sin_g * y_eci
    y_ecef = -sin_g * x_eci + cos_g * y_eci
    z_ecef =  z_eci

    return x_ecef, y_ecef, z_ecef


def _dt_to_jd(dt: datetime) -> tuple[float, float]:
    from sgp4.api import jday as _jday
    return _jday(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                 dt.second + dt.microsecond / 1e6)


def _gmst(jd: float, fr: float) -> float:
    """Greenwich Mean Sidereal Time (radians), IAU 1982."""
    tut1 = ((jd - 2451545.0) + fr) / 36525.0
    gmst_sec = (
        67310.54841
        + (876600.0 * 3600 + 8640184.812866) * tut1
        + 0.093104 * tut1**2
        - 6.2e-6   * tut1**3
    )
    return math.fmod(math.radians(gmst_sec / 240.0), 2 * math.pi)


# ── Shadow check ─────────────────────────────────────────────────────────────

def in_earth_shadow(sat_ecef: tuple, sun_ecef: tuple) -> bool:
    """
    Returns True if the satellite is inside Earth's geometric shadow cone.
    Uses cylindrical shadow approximation (ignores penumbra).
    """
    sx, sy, sz = sun_ecef
    px, py, pz = sat_ecef

    # Vector from Sun to satellite
    dx, dy, dz = px - sx, py - sy, pz - sz
    # Distance from Earth's axis along Sun→Sat direction
    sun_dist = math.sqrt(sx**2 + sy**2 + sz**2)
    # Project satellite onto Sun direction
    dot = (px * sx + py * sy + pz * sz) / sun_dist
    if dot > 0:
        return False  # Satellite is on the Sun's side — always lit
    # Perpendicular distance from satellite to Sun–Earth line
    perp2 = (px**2 + py**2 + pz**2) - dot**2
    return perp2 < EARTH_RADIUS_KM**2


# ── Specular reflection check ─────────────────────────────────────────────────

def _unit(x: float, y: float, z: float) -> tuple[float, float, float]:
    mag = math.sqrt(x**2 + y**2 + z**2)
    if mag == 0:
        return 0.0, 0.0, 0.0
    return x / mag, y / mag, z / mag


def specular_angle_deg(
    sat_ecef: tuple[float, float, float],
    sun_ecef: tuple[float, float, float],
    tel_ecef: tuple[float, float, float],
) -> float:
    """
    Returns the specular angle (degrees) between the Sun→Sat and Tel→Sat
    directions. A value near 0° means the satellite is reflecting sunlight
    directly towards the telescope.
    """
    sx, sy, sz = sat_ecef
    ux, uy, uz = sun_ecef
    tx, ty, tz = tel_ecef

    # Unit vector from Sun towards satellite (incoming light direction)
    sun_hat = _unit(sx - ux, sy - uy, sz - uz)
    # Unit vector from Telescope towards satellite
    tel_hat = _unit(sx - tx, sy - ty, sz - tz)

    dot = sum(a * b for a, b in zip(sun_hat, tel_hat))
    dot = max(-1.0, min(1.0, dot))  # clamp for numerical safety
    return math.degrees(math.acos(dot))


def is_reflection(
    sat_ecef: tuple[float, float, float],
    sun_ecef: tuple[float, float, float],
    tel_ecef: tuple[float, float, float],
    threshold_deg: float = DEFAULT_THRESHOLD_DEG,
) -> tuple[bool, float]:
    """
    Returns (is_reflecting, angle_deg).
    is_reflecting is True when angle < threshold and satellite is sunlit.
    """
    if in_earth_shadow(sat_ecef, sun_ecef):
        return False, 180.0

    angle = specular_angle_deg(sat_ecef, sun_ecef, tel_ecef)
    return angle < threshold_deg, angle


# ── Telescope ECEF position ───────────────────────────────────────────────────

def geodetic_to_ecef(lat_deg: float, lon_deg: float, alt_m: float) -> tuple[float, float, float]:
    """
    Convert geodetic coordinates to ECEF (km).
    WGS84 ellipsoid.
    """
    a  = 6378.137           # km
    f  = 1 / 298.257223563
    e2 = 2 * f - f**2

    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    alt_km = alt_m / 1000.0

    N = a / math.sqrt(1 - e2 * math.sin(lat)**2)
    x = (N + alt_km) * math.cos(lat) * math.cos(lon)
    y = (N + alt_km) * math.cos(lat) * math.sin(lon)
    z = (N * (1 - e2) + alt_km) * math.sin(lat)
    return x, y, z
