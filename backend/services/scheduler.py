"""
APScheduler background polling.
Runs a TLE refresh job on startup and every TLE_CACHE_TTL_HOURS thereafter.
"""
import logging
import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from database import AsyncSessionLocal
from services.celestrak import refresh_all
from services.horizons import refresh_all_horizons_targets

logger = logging.getLogger(__name__)

TTL_HOURS = float(os.getenv("TLE_CACHE_TTL_HOURS", "6"))

scheduler = AsyncIOScheduler()


async def _run_tle_refresh() -> None:
    logger.info("Scheduler: starting TLE refresh...")
    async with AsyncSessionLocal() as db:
        counts = await refresh_all(db)
    total = sum(counts.values())
    logger.info("Scheduler: TLE refresh complete — %d satellites across %d groups", total, len(counts))


async def _run_horizons_refresh() -> None:
    logger.info("Scheduler: refreshing Horizons targets...")
    results = await refresh_all_horizons_targets()
    logger.info("Scheduler: Horizons refresh results: %s", results)


def start_scheduler() -> None:
    scheduler.add_job(
        _run_tle_refresh,
        trigger=IntervalTrigger(hours=TTL_HOURS),
        id="tle_refresh",
        replace_existing=True,
    )
    scheduler.add_job(
        _run_horizons_refresh,
        trigger=IntervalTrigger(hours=TTL_HOURS),
        id="horizons_refresh",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started (interval: %.1f hrs)", TTL_HOURS)


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")
