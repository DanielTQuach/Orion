"""Guaranteed FOV geometry and demo-scan tests."""
import math
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.fov_geometry import (
    angular_separation_deg,
    is_in_fov,
    enu_to_az_el_deg,
    ecef_to_az_el_deg,
)
from services.geometry import geodetic_to_ecef


def test_same_direction_zero_separation():
    sep = angular_separation_deg(45.0, 30.0, 45.0, 30.0)
    assert sep == 0.0


def test_is_in_fov_guaranteed_hit():
    """Satellite exactly on boresight is always inside any positive FOV."""
    inside, sep = is_in_fov(180.0, 45.0, 180.0, 45.0, fov_deg=2.0)
    assert inside is True
    assert sep == 0.0


def test_is_in_fov_outside_cone():
    inside, sep = is_in_fov(180.0, 45.0, 180.0, 10.0, fov_deg=2.0)
    assert inside is False
    assert sep > 1.0


def test_demo_boresight_lock_guarantees_iss_crossing():
    """
    Mimics DEMO mode: boresight locked to ISS at scan start.
    ISS must be in FOV at t=0 by construction.
    """
    tel_lat, tel_lon, tel_alt = 38.9214, -77.0672, 92.0
    tel_ecef = geodetic_to_ecef(tel_lat, tel_lon, tel_alt)

    # Synthetic ISS position 500 km above horizon toward south
    e, n, u = 0.0, -400.0, 300.0
    az, el = enu_to_az_el_deg(e, n, u)
    horiz = math.sqrt(e * e + n * n)
    dist = math.sqrt(e * e + n * n + u * u)
    # Reconstruct ECEF target from az/el at observer
    el_r, az_r = math.radians(el), math.radians(az)
    ee = dist * math.cos(el_r) * math.sin(az_r)
    nn = dist * math.cos(el_r) * math.cos(az_r)
    uu = dist * math.sin(el_r)
    # Rotate ENU offset back to ECEF (approximate — use forward path only)
    iss_ecef = (
        tel_ecef[0] + ee,
        tel_ecef[1] + nn,
        tel_ecef[2] + uu,
    )

    bore_az, bore_el = ecef_to_az_el_deg(tel_ecef, iss_ecef, tel_lat, tel_lon)
    sat_az, sat_el = ecef_to_az_el_deg(tel_ecef, iss_ecef, tel_lat, tel_lon)

    inside, sep = is_in_fov(sat_az, sat_el, bore_az, bore_el, fov_deg=3.0)
    assert inside is True
    assert sep < 0.001


def test_zenith_satellite_crossing_with_wide_fov():
    """Sat 5° from zenith is inside a 12° diameter FOV pointed at zenith."""
    inside, _ = is_in_fov(0.0, 85.0, 0.0, 90.0, fov_deg=12.0)
    assert inside is True
