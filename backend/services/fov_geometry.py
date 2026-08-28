"""
Field-of-view geometry for ground-based telescopes.

Given an observer on Earth and a target position (satellite), computes
topocentric azimuth/elevation and whether the target lies inside a
circular FOV cone defined by a boresight direction and angular radius.
"""
import math

from services.geometry import geodetic_to_ecef


def ecef_to_enu(
    dx: float, dy: float, dz: float,
    lat_deg: float, lon_deg: float,
) -> tuple[float, float, float]:
    """Rotate an ECEF delta vector into local East-North-Up (km)."""
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    sl, cl = math.sin(lat), math.cos(lat)
    so, co = math.sin(lon), math.cos(lon)

    e = -so * dx + co * dy
    n = -sl * co * dx - sl * so * dy + cl * dz
    u =  cl * co * dx + cl * so * dy + sl * dz
    return e, n, u


def enu_to_az_el_deg(e: float, n: float, u: float) -> tuple[float, float]:
    """Azimuth (0–360° clockwise from north) and elevation (-90–90°)."""
    az = math.degrees(math.atan2(e, n)) % 360.0
    horiz = math.sqrt(e * e + n * n)
    el = math.degrees(math.atan2(u, horiz))
    return az, el


def ecef_to_az_el_deg(
    observer_ecef: tuple[float, float, float],
    target_ecef: tuple[float, float, float],
    lat_deg: float,
    lon_deg: float,
) -> tuple[float, float]:
    """Topocentric az/el (degrees) of target as seen from observer."""
    ox, oy, oz = observer_ecef
    tx, ty, tz = target_ecef
    return enu_to_az_el_deg(*ecef_to_enu(tx - ox, ty - oy, tz - oz, lat_deg, lon_deg))


def angular_separation_deg(
    az1_deg: float, el1_deg: float,
    az2_deg: float, el2_deg: float,
) -> float:
    """Great-circle angular separation between two alt-az directions."""
    az1, el1 = math.radians(az1_deg), math.radians(el1_deg)
    az2, el2 = math.radians(az2_deg), math.radians(el2_deg)

    cos_d = (
        math.sin(el1) * math.sin(el2)
        + math.cos(el1) * math.cos(el2) * math.cos(az1 - az2)
    )
    cos_d = max(-1.0, min(1.0, cos_d))
    return math.degrees(math.acos(cos_d))


def is_in_fov(
    sat_az_deg: float,
    sat_el_deg: float,
    boresight_az_deg: float,
    boresight_el_deg: float,
    fov_deg: float,
) -> tuple[bool, float]:
    """
    Returns (inside_fov, separation_deg).
    A circular FOV uses fov_deg as the full diameter.
    """
    sep = angular_separation_deg(sat_az_deg, sat_el_deg, boresight_az_deg, boresight_el_deg)
    return sep <= fov_deg / 2.0, sep


def zenith_boresight(lat_deg: float, lon_deg: float) -> tuple[float, float]:
    """Boresight pointing at local zenith."""
    return 0.0, 90.0
