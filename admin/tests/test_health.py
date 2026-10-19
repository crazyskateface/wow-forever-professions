from __future__ import annotations

import asyncio

from forever_admin.health import HealthChecker, interpret_health_response
from forever_admin.models import HealthState, HealthTarget


def test_interprets_expected_health_status() -> None:
    state, reported, message = interpret_health_response(200, {"status": "ready"}, "ready")

    assert state is HealthState.HEALTHY
    assert reported == "ready"
    assert "Expected" in message


def test_non_success_is_unhealthy() -> None:
    state, reported, message = interpret_health_response(503, {"status": "unavailable"}, "ready")

    assert state is HealthState.UNHEALTHY
    assert reported == "unavailable"
    assert message == "HTTP 503"


def test_success_with_wrong_application_status_is_degraded() -> None:
    state, _, _ = interpret_health_response(200, {"status": "warming"}, "ready")

    assert state is HealthState.DEGRADED


def test_unreachable_service_is_never_healthy() -> None:
    def fail(_: HealthTarget) -> tuple[int, dict[str, str], float]:
        raise OSError("connection refused")

    result = asyncio.run(
        HealthChecker(fail).check(
            HealthTarget(id="api", name="API", url="http://127.0.0.1:1", expected_status="ok")
        )
    )

    assert result.state is HealthState.UNHEALTHY
    assert "connection refused" in result.message
