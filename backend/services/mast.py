"""
STScI MAST API client.

Stage 1 of the RAG pipeline:
  - Fetch active HST / JWST target tracking data (currently scheduled observations)
  - Fetch nearby Guide Star Catalog (GSC2) entries within a search radius

MAST Portal API docs: https://mast.stsci.edu/api/v0/
GSC2 cone search:     https://gsss.stsci.edu/webservices/vo/ConeSearch.aspx
"""
import logging
from typing import Any
import httpx

logger = logging.getLogger(__name__)

MAST_API       = "https://mast.stsci.edu/api/v0/invoke"
GSC2_CONE_URL  = "https://gsss.stsci.edu/webservices/vo/ConeSearch.aspx"

# Maximum number of guide stars to return per lookup
GSC2_MAX_ROWS = 50


async def fetch_mast_targets(
    ra_deg: float,
    dec_deg: float,
    radius_deg: float = 0.5,
    mission: str = "HST",
) -> list[dict[str, Any]]:
    """
    Query MAST for active/scheduled observations within ``radius_deg`` of
    (ra_deg, dec_deg).

    Returns a list of observation records (subset of MAST columns).
    Empty list on error or no matches.
    """
    payload = {
        "service": "Mast.Caom.Cone",
        "params": {
            "ra": ra_deg,
            "dec": dec_deg,
            "radius": radius_deg,
        },
        "format": "json",
        "pagesize": 100,
        "page": 1,
        "removenullcolumns": True,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                MAST_API,
                json={"request": payload},
                headers={"Content-type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("MAST targets fetch failed: %s", exc)
        return []

    fields   = [f["name"] for f in data.get("fields", [])]
    rows     = data.get("data", [])
    results  = [dict(zip(fields, row)) for row in rows]

    # Filter to the requested mission if present
    if mission:
        results = [
            r for r in results
            if str(r.get("obs_collection", "")).upper() == mission.upper()
        ]

    logger.info(
        "MAST cone (%.4f, %.4f) r=%.2f deg → %d %s targets",
        ra_deg, dec_deg, radius_deg, len(results), mission,
    )
    return results


async def fetch_guide_stars(
    ra_deg: float,
    dec_deg: float,
    radius_deg: float = 0.1,
) -> list[dict[str, Any]]:
    """
    Query the Guide Star Catalog 2 (GSC2) via VO cone search.

    Returns a list of guide-star records with at least:
      ra, dec, classification, Vmag (if present)
    """
    params = {
        "RA":       ra_deg,
        "DEC":      dec_deg,
        "SR":       radius_deg,
        "FORMAT":   "JSON",
        "MAXOBJ":   GSC2_MAX_ROWS,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(GSC2_CONE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("GSC2 guide-star fetch failed: %s", exc)
        return []

    stars = data.get("Guide Star Catalog 2.4.2", {}).get("data", [])
    logger.info(
        "GSC2 cone (%.4f, %.4f) r=%.2f deg → %d guide stars",
        ra_deg, dec_deg, radius_deg, len(stars),
    )
    return stars
