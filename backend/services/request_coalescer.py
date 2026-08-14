"""
Coalesces concurrent identical lookups into a single in-flight call, and
caches the result briefly.

Why this exists: the same accident location gets looked up independently by
several frontend components at once (the live-monitoring panel, the emergency
dashboard, the hospital dashboard's refresh hook, the police dashboard's
refresh hook). Each lookup hits the free, rate-limited OSM Overpass / OSRM
APIs. Firing that burst concurrently for the *same* coordinates was causing
some of those calls to get rate-limited or time out — one caller would see a
hospital, another would see "no hospital found within 15 km" for the exact
same accident. Coalescing + a short cache makes every caller share one
real network round-trip per (location, severity).
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Awaitable, Callable, Dict, Tuple

_CACHE: Dict[Tuple, Tuple[float, Any]] = {}
_INFLIGHT: Dict[Tuple, "asyncio.Future[Any]"] = {}
_LOCK = asyncio.Lock()

DEFAULT_TTL_SECONDS = 45.0


def make_key(*parts: Any) -> Tuple:
    """Build a coalescing key, rounding floats so nearby-identical requests
    (e.g. 13.08270001 vs 13.08270002) share the same cache bucket."""
    rounded = tuple(round(p, 4) if isinstance(p, float) else p for p in parts)
    return rounded


async def coalesce(
    key: Tuple,
    compute: Callable[[], Awaitable[Any]],
    ttl_seconds: float = DEFAULT_TTL_SECONDS,
) -> Any:
    """
    Return a cached or already-in-flight result for `key`; otherwise run
    `compute()` exactly once and share that result with every concurrent
    caller for the same key.
    """
    now = time.monotonic()

    cached = _CACHE.get(key)
    if cached and now - cached[0] < ttl_seconds:
        return cached[1]

    async with _LOCK:
        cached = _CACHE.get(key)
        if cached and now - cached[0] < ttl_seconds:
            return cached[1]

        future = _INFLIGHT.get(key)
        if future is None:
            future = asyncio.ensure_future(compute())
            _INFLIGHT[key] = future

    try:
        result = await future
    finally:
        async with _LOCK:
            if _INFLIGHT.get(key) is future:
                del _INFLIGHT[key]

    _CACHE[key] = (now, result)
    return result
