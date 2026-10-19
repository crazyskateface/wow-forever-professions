from __future__ import annotations

import asyncio
import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from datetime import datetime
from typing import Any

from forever_admin.models import HealthResult, HealthState, HealthTarget


def interpret_health_response(
    http_status: int,
    payload: dict[str, Any] | None,
    expected_status: str | None,
) -> tuple[HealthState, str | None, str]:
    reported = payload.get("status") if isinstance(payload, dict) else None
    reported_status = str(reported).lower() if reported is not None else None

    if not 200 <= http_status < 300:
        return HealthState.UNHEALTHY, reported_status, f"HTTP {http_status}"
    if expected_status is None:
        return HealthState.HEALTHY, reported_status, "Endpoint responded successfully."
    if reported_status == expected_status.lower():
        return HealthState.HEALTHY, reported_status, "Expected status reported."
    if reported_status is None:
        return HealthState.DEGRADED, None, "Response did not include a status field."
    return (
        HealthState.DEGRADED,
        reported_status,
        f"Expected {expected_status!r}, received {reported_status!r}.",
    )


def _request(target: HealthTarget) -> tuple[int, dict[str, Any] | None, float]:
    request = urllib.request.Request(
        target.url,
        headers={"Accept": "application/json", "User-Agent": "forever-professions-admin/0.1"},
        method="GET",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=target.timeout_seconds) as response:
            body = response.read(256_000)
            status = response.status
    except urllib.error.HTTPError as error:
        body = error.read(256_000)
        status = error.code
    latency_ms = (time.perf_counter() - started) * 1000
    try:
        payload = json.loads(body.decode("utf-8")) if body else None
    except (UnicodeDecodeError, json.JSONDecodeError):
        payload = None
    return status, payload if isinstance(payload, dict) else None, latency_ms


class HealthChecker:
    def __init__(
        self,
        requester: Callable[[HealthTarget], tuple[int, dict[str, Any] | None, float]] = _request,
    ) -> None:
        self._requester = requester
        self._last_success: dict[str, datetime] = {}

    async def check(self, target: HealthTarget) -> HealthResult:
        checked_at = datetime.now().astimezone()
        try:
            if self._requester is _request:
                http_status, payload, latency_ms = await asyncio.to_thread(self._requester, target)
            else:
                http_status, payload, latency_ms = self._requester(target)
            state, reported_status, message = interpret_health_response(
                http_status,
                payload,
                target.expected_status,
            )
        except Exception as error:
            return HealthResult(
                target_id=target.id,
                name=target.name,
                environment=target.environment,
                state=HealthState.UNHEALTHY,
                checked_at=checked_at,
                message=f"Request failed: {error}",
                last_success_at=self._last_success.get(target.id),
            )

        if state is HealthState.HEALTHY:
            self._last_success[target.id] = checked_at
        return HealthResult(
            target_id=target.id,
            name=target.name,
            environment=target.environment,
            state=state,
            checked_at=checked_at,
            latency_ms=latency_ms,
            http_status=http_status,
            reported_status=reported_status,
            message=message,
            last_success_at=self._last_success.get(target.id),
        )

    async def check_all(self, targets: tuple[HealthTarget, ...]) -> tuple[HealthResult, ...]:
        if not targets:
            return ()
        return tuple(await asyncio.gather(*(self.check(target) for target in targets)))
