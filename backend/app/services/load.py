"""Keeps the heavy planner requests (route, sensitivity) from piling up on the one backend process.

Three light measures, tuned so a person using the app never notices them:

- Cache: the last CACHE_SIZE answers by request. Toggling a profile back, or the route and the
  sensitivity table asking for the same stops, is answered at once and costs nothing.
- Queue: at most SLOTS computations run at a time. Others wait up to WAIT_S; a request whose
  client has gone away while waiting (the app cancels a route when a stop moves) is dropped
  before it is computed.
- Rate limit: PER_MINUTE computations per client address per minute. Cached answers are free.
"""

from __future__ import annotations

import asyncio
import threading
import time
from collections import OrderedDict, deque
from collections.abc import Callable, Hashable
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

SLOTS = 2
WAIT_S = 10.0
PER_MINUTE = 120
CACHE_SIZE = 64

BUSY_DETAIL = "The route service is busy. Retry in a few seconds."
RATE_DETAIL = "Too many route requests in a short time. Wait a few seconds and retry."


class Busy(Exception):
    """Raised by RouteGuard.run when the request did not get a slot; carries the response."""

    def __init__(self, response: Response):
        self.response = response


class RouteGuard:
    def __init__(
        self,
        slots: int = SLOTS,
        wait_s: float = WAIT_S,
        per_minute: int = PER_MINUTE,
        cache_size: int = CACHE_SIZE,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.wait_s = wait_s
        self.per_minute = per_minute
        self.cache_size = cache_size
        self._clock = clock
        self._slots = asyncio.Semaphore(slots)
        self._lock = threading.Lock()
        self._cache: OrderedDict[Hashable, Any] = OrderedDict()
        self._calls: dict[str, deque[float]] = {}

    def cached(self, key: Hashable) -> tuple[bool, Any]:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return True, self._cache[key]
        return False, None

    def store(self, key: Hashable, value: Any) -> None:
        with self._lock:
            self._cache[key] = value
            self._cache.move_to_end(key)
            while len(self._cache) > self.cache_size:
                self._cache.popitem(last=False)

    def allow(self, client: str) -> float:
        """0 when `client` may compute now, otherwise the seconds until it may."""
        now = self._clock()
        with self._lock:
            calls = self._calls.setdefault(client, deque())
            while calls and now - calls[0] >= 60:
                calls.popleft()
            if len(calls) >= self.per_minute:
                return 60 - (now - calls[0])
            calls.append(now)
            # Forget clients that have been quiet, so the table does not grow forever.
            if len(self._calls) > 10_000:
                for key in [k for k, v in self._calls.items() if not v or now - v[-1] >= 60]:
                    del self._calls[key]
            return 0.0

    async def run(self, request: Request, key: Hashable, compute: Callable[[], Any]) -> Any:
        """The cached answer for `key`, or `compute()` run in a worker thread when a slot is free.

        Raises Busy with a 429 or 503 response when the request should not be computed now.
        """
        hit, value = self.cached(key)
        if hit:
            return value
        client = request.client.host if request.client else "unknown"
        retry = self.allow(client)
        if retry > 0:
            raise Busy(too_busy(429, RATE_DETAIL, retry))
        try:
            await asyncio.wait_for(self._slots.acquire(), timeout=self.wait_s)
        except asyncio.TimeoutError:  # noqa: UP041 (not the builtin on Python 3.10)
            raise Busy(too_busy(503, BUSY_DETAIL, 5)) from None
        try:
            # The app cancels a route request when a stop moves: skip work nobody will read.
            if await request.is_disconnected():
                raise Busy(Response(status_code=499))
            value = await run_in_threadpool(compute)
        finally:
            self._slots.release()
        self.store(key, value)
        return value


def too_busy(status: int, detail: str, retry_s: float) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"detail": detail},
        headers={"Retry-After": str(max(1, round(retry_s)))},
    )
