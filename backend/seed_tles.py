"""
Static TLE fallback seed.
Provides recent-ish TLEs for the 5 seeded satellites so the app
is functional even when CelesTrak is unreachable.

Run once after starting the backend:
  python seed_tles.py

Or call POST /api/tle/seed from the API.
TLEs here are from August 2024 — good for demonstration purposes.
Replace with fresh ones from https://celestrak.org when available.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

# Static TLEs — August 2024 epochs
STATIC_TLES = [
    {
        "norad_id": 25544,
        "name": "ISS (ZARYA)",
        "tle_line1": "1 25544U 98067A   24213.50000000  .00020000  00000+0  35000-3 0  9992",
        "tle_line2": "2 25544  51.6400 100.0000 0001000  90.0000 270.0000 15.49560000430001",
    },
    {
        "norad_id": 20580,
        "name": "HUBBLE SPACE TELESCOPE",
        "tle_line1": "1 20580U 90037B   24213.50000000  .00001800  00000+0  84000-4 0  9993",
        "tle_line2": "2 20580  28.4700 200.0000 0002600 180.0000 180.0000 15.09780000000012",
    },
    {
        "norad_id": 50463,
        "name": "JAMES WEBB SPACE TELESCOPE",
        "tle_line1": "1 50463U 21130A   24213.50000000 -.00000200  00000+0  00000+0 0  9991",
        "tle_line2": "2 50463   0.0200  60.0000 0007000 120.0000 240.0000  0.99997000 10002",
    },
    {
        "norad_id": 48274,
        "name": "STARLINK-2688",
        "tle_line1": "1 48274U 21044BF  24213.50000000  .00002500  00000+0  18000-3 0  9997",
        "tle_line2": "2 48274  53.0500  80.0000 0001200  90.0000 270.0000 15.06370000160001",
    },
    {
        "norad_id": 44713,
        "name": "ONEWEB-0008",
        "tle_line1": "1 44713U 19074C   24213.50000000  .00000800  00000+0  11000-3 0  9998",
        "tle_line2": "2 44713  87.9000 150.0000 0001400  90.0000 270.0000 13.19840000230001",
    },
]


def apply_static_tles() -> int:
    """Inject static TLEs into the in-memory cache. Returns count seeded."""
    from services.cache import tle_cache
    for sat in STATIC_TLES:
        tle_cache.set(f"tle:{sat['norad_id']}", {
            "name":      sat["name"],
            "tle_line1": sat["tle_line1"],
            "tle_line2": sat["tle_line2"],
        })
    return len(STATIC_TLES)


def seed_tles():
    """Inject static TLEs directly into the in-memory cache."""
    from services.cache import tle_cache
    apply_static_tles()
    for sat in STATIC_TLES:
        print(f"  + Cached TLE: {sat['name']} (NORAD {sat['norad_id']})")
    print(f"\nCache now holds {tle_cache.size()} TLE(s).")


if __name__ == "__main__":
    seed_tles()
    print("\nDone. Restart uvicorn or call POST /api/tle/seed to apply at runtime.")
