"""
In-memory TTL cache for TLE orbital elements.
Keys are NORAD IDs (int), values are raw TLE line pairs.
TTL is configurable via TLE_CACHE_TTL_HOURS in .env (default 6 hrs).
"""
import time
import os
from dataclasses import dataclass, field
from typing import Any

TTL_SECONDS = float(os.getenv("TLE_CACHE_TTL_HOURS", "6")) * 3600


@dataclass
class _Entry:
    value: Any
    expires_at: float


class TTLCache:
    def __init__(self, ttl: float = TTL_SECONDS):
        self._ttl = ttl
        self._store: dict[str, _Entry] = {}

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        if time.monotonic() > entry.expires_at:
            del self._store[key]
            return None
        return entry.value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = _Entry(value=value, expires_at=time.monotonic() + self._ttl)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()

    def size(self) -> int:
        return len(self._store)


# Module-level singleton used across the app
tle_cache = TTLCache()
