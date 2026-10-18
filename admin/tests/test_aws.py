from __future__ import annotations

from typing import Any

from forever_admin.aws import AwsMonitor, cloudwatch_filter_pattern
from forever_admin.config import AwsEnvironment, AwsSettings


class _Paginator:
    def __init__(self, pages: list[dict[str, Any]]) -> None:
        self.pages = pages

    def paginate(self, **_: Any):
        yield from self.pages


class _CloudFormation:
    def get_paginator(self, operation: str) -> _Paginator:
        assert operation == "list_stack_resources"
        return _Paginator(
            [
                {
                    "StackResourceSummaries": [
                        {
                            "ResourceType": "AWS::Logs::LogGroup",
                            "PhysicalResourceId": "/aws/lambda/forever-api",
                        }
                    ]
                }
            ]
        )


class _Logs:
    def get_paginator(self, operation: str) -> _Paginator:
        assert operation == "filter_log_events"
        return _Paginator(
            [
                {
                    "events": [
                        {
                            "timestamp": 1_781_694_001_000,
                            "message": (
                                '{"status":"200","path":"/api/ready",'
                                '"integrationError":"-"}'
                            ),
                        },
                        {
                            "timestamp": 1_781_694_000_000,
                            "message": '{"level":"ERROR","message":"database unavailable"}',
                        }
                    ]
                }
            ]
        )


def test_cloudwatch_retrieval_uses_mocked_clients() -> None:
    clients = {"cloudformation": _CloudFormation(), "logs": _Logs()}
    settings = AwsSettings(
        enabled=True,
        profile=None,
        region="us-east-1",
        lookback_hours=24,
        environments=(),
    )
    environment = AwsEnvironment(
        stage="staging",
        label="Staging",
        application_stack="App",
        data_stack="Data",
    )
    monitor = AwsMonitor(settings, client_factory=lambda service: clients[service])

    result = monitor.fetch_logs(environment, limit=10, level="ERROR")

    assert result.error is None
    assert len(result.entries) == 1
    assert result.entries[0].message == "database unavailable"


def test_access_log_filter_uses_structured_status_and_integration_fields() -> None:
    pattern = cloudwatch_filter_pattern(
        "ERROR",
        "ForeverProfessions-ApiAccessLogGroupCEA70788-example",
    )

    assert pattern == '{ ($.status = %5[0-9][0-9]%) || ($.integrationError != "-") }'
    assert cloudwatch_filter_pattern("ERROR", "/aws/lambda/forever-api") is not None


def test_reset_discards_cached_clients() -> None:
    created: list[object] = []

    def factory(_: str) -> object:
        client = object()
        created.append(client)
        return client

    monitor = AwsMonitor(
        AwsSettings(
            enabled=True,
            profile="operations",
            region="us-east-1",
            lookback_hours=24,
            environments=(),
        ),
        client_factory=factory,
    )

    first = monitor._client("sts")
    assert monitor._client("sts") is first

    monitor.reset()

    assert monitor._client("sts") is not first
    assert len(created) == 2
