from __future__ import annotations

from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from forever_admin.config import AwsEnvironment, AwsSettings
from forever_admin.logs import parse_log_message
from forever_admin.models import (
    AwsEnvironmentSnapshot,
    HealthState,
    LogFetchResult,
    StackEvent,
    StackSummary,
)


def cloudwatch_filter_pattern(level: str, log_group: str) -> str | None:
    if "ApiAccessLogGroup" in log_group:
        return {
            "CRITICAL": '{ ($.status = %5[0-9][0-9]%) || ($.integrationError != "-") }',
            "ERROR": '{ ($.status = %5[0-9][0-9]%) || ($.integrationError != "-") }',
            "WARN": '{ $.status = %4[0-9][0-9]% }',
            "INFO": '{ $.status = %[123][0-9][0-9]% }',
        }.get(level)
    return {
        "CRITICAL": '?"CRITICAL" ?"FATAL" ?"Fatal"',
        "ERROR": '?"ERROR" ?"Error" ?"error" ?"Exception" ?"Task timed out"',
        "WARN": '?"WARN" ?"Warning" ?"warning"',
    }.get(level)


_CLIENT_CONFIG = Config(
    retries={"total_max_attempts": 2, "mode": "standard"},
    connect_timeout=4,
    read_timeout=10,
    user_agent_appid="forever-professions-admin/0.1",
)


def _stack_state(status: str) -> HealthState:
    if status in {"CREATE_COMPLETE", "UPDATE_COMPLETE", "IMPORT_COMPLETE"}:
        return HealthState.HEALTHY
    if status.endswith("_IN_PROGRESS") or status.endswith("_CLEANUP_IN_PROGRESS"):
        return HealthState.DEGRADED
    if "FAILED" in status or "ROLLBACK" in status:
        return HealthState.UNHEALTHY
    return HealthState.UNKNOWN


def _combine_states(states: tuple[HealthState, ...]) -> HealthState:
    if any(state is HealthState.UNHEALTHY for state in states):
        return HealthState.UNHEALTHY
    if any(state is HealthState.DEGRADED for state in states):
        return HealthState.DEGRADED
    if states and all(state is HealthState.HEALTHY for state in states):
        return HealthState.HEALTHY
    return HealthState.UNKNOWN


class AwsMonitor:
    def __init__(
        self,
        settings: AwsSettings,
        client_factory: Callable[[str], Any] | None = None,
    ) -> None:
        self.settings = settings
        self._factory = client_factory
        self._clients: dict[str, Any] = {}
        self._session: boto3.Session | None = None

    def reset(self) -> None:
        """Discard clients so a newly authenticated profile is used immediately."""
        self._clients.clear()
        self._session = None

    def _client(self, service: str) -> Any:
        if service in self._clients:
            return self._clients[service]
        if self._factory is not None:
            client = self._factory(service)
        else:
            if self._session is None:
                self._session = boto3.Session(
                    profile_name=self.settings.profile,
                    region_name=self.settings.region,
                )
            client = self._session.client(service, config=_CLIENT_CONFIG)
        self._clients[service] = client
        return client

    def caller_identity(self) -> tuple[str, str]:
        response = self._client("sts").get_caller_identity()
        return str(response["Account"]), str(response["Arn"])

    def environment_snapshot(self, environment: AwsEnvironment) -> AwsEnvironmentSnapshot:
        checked_at = datetime.now().astimezone()
        if not self.settings.enabled:
            return AwsEnvironmentSnapshot(
                stage=environment.stage,
                state=HealthState.UNKNOWN,
                checked_at=checked_at,
                error="AWS monitoring is disabled in admin/config.toml.",
            )
        try:
            application = self._describe_stack(environment.application_stack)
            data = self._describe_stack(environment.data_stack)
            resources = {
                environment.application_stack: self._list_stack_resources(environment.application_stack),
                environment.data_stack: self._list_stack_resources(environment.data_stack),
            }
            metrics = self._usage_metrics(resources)
            events = self._recent_events(
                (environment.application_stack, environment.data_stack),
                limit_per_stack=4,
            )
            state = _combine_states((_stack_state(application.status), _stack_state(data.status)))
            return AwsEnvironmentSnapshot(
                stage=environment.stage,
                state=state,
                checked_at=checked_at,
                application_stack=application,
                data_stack=data,
                web_url=application.outputs.get("WebUrl"),
                metrics=metrics,
                recent_events=events,
            )
        except (BotoCoreError, ClientError, KeyError, ValueError) as error:
            return AwsEnvironmentSnapshot(
                stage=environment.stage,
                state=HealthState.UNKNOWN,
                checked_at=checked_at,
                error=f"AWS status unavailable: {error}",
            )

    def _describe_stack(self, stack_name: str) -> StackSummary:
        response = self._client("cloudformation").describe_stacks(StackName=stack_name)
        stack = response["Stacks"][0]
        outputs = {
            str(item["OutputKey"]): str(item["OutputValue"])
            for item in stack.get("Outputs", [])
            if item.get("OutputKey") and item.get("OutputValue")
        }
        return StackSummary(
            name=stack_name,
            status=str(stack["StackStatus"]),
            updated_at=stack.get("LastUpdatedTime") or stack.get("CreationTime"),
            outputs=outputs,
        )

    def _list_stack_resources(self, stack_name: str) -> tuple[dict[str, Any], ...]:
        client = self._client("cloudformation")
        paginator = client.get_paginator("list_stack_resources")
        resources: list[dict[str, Any]] = []
        for page in paginator.paginate(StackName=stack_name):
            resources.extend(page.get("StackResourceSummaries", []))
        return tuple(resources)

    def _recent_events(self, stack_names: tuple[str, ...], limit_per_stack: int) -> tuple[StackEvent, ...]:
        client = self._client("cloudformation")
        events: list[StackEvent] = []
        for stack_name in stack_names:
            response = client.describe_stack_events(StackName=stack_name)
            for event in response.get("StackEvents", [])[:limit_per_stack]:
                events.append(
                    StackEvent(
                        stack_name=stack_name,
                        logical_resource_id=str(event.get("LogicalResourceId", "unknown")),
                        resource_type=str(event.get("ResourceType", "unknown")),
                        status=str(event.get("ResourceStatus", "UNKNOWN")),
                        timestamp=event.get("Timestamp"),
                        reason=str(event["ResourceStatusReason"]) if event.get("ResourceStatusReason") else None,
                    )
                )
        events.sort(key=lambda event: event.timestamp or datetime.min.replace(tzinfo=UTC), reverse=True)
        return tuple(events)

    def _usage_metrics(
        self,
        resources_by_stack: dict[str, tuple[dict[str, Any], ...]],
    ) -> dict[str, float | None]:
        resources = tuple(resource for group in resources_by_stack.values() for resource in group)
        functions = [
            str(resource["PhysicalResourceId"])
            for resource in resources
            if resource.get("ResourceType") == "AWS::Lambda::Function" and resource.get("PhysicalResourceId")
        ]
        apis = [
            str(resource["PhysicalResourceId"])
            for resource in resources
            if resource.get("ResourceType") == "AWS::ApiGatewayV2::Api" and resource.get("PhysicalResourceId")
        ]
        distributions = [
            str(resource["PhysicalResourceId"])
            for resource in resources
            if resource.get("ResourceType") == "AWS::CloudFront::Distribution" and resource.get("PhysicalResourceId")
        ]
        queries: list[dict[str, Any]] = []
        reducers: dict[str, tuple[str, str]] = {}

        def add_query(
            query_id: str,
            key: str,
            namespace: str,
            metric: str,
            dimensions: list[dict[str, str]],
            stat: str,
            reducer: str = "sum",
        ) -> None:
            queries.append(
                {
                    "Id": query_id,
                    "MetricStat": {
                        "Metric": {"Namespace": namespace, "MetricName": metric, "Dimensions": dimensions},
                        "Period": 3600,
                        "Stat": stat,
                    },
                    "ReturnData": True,
                }
            )
            reducers[query_id] = (key, reducer)

        for index, function_name in enumerate(functions):
            dimensions = [{"Name": "FunctionName", "Value": function_name}]
            add_query(f"li{index}", "lambda_invocations", "AWS/Lambda", "Invocations", dimensions, "Sum")
            add_query(f"le{index}", "lambda_errors", "AWS/Lambda", "Errors", dimensions, "Sum")
            add_query(
                f"ld{index}",
                "lambda_duration_p95_ms",
                "AWS/Lambda",
                "Duration",
                dimensions,
                "p95",
                "max",
            )
        for index, api_id in enumerate(apis):
            dimensions = [{"Name": "ApiId", "Value": api_id}]
            add_query(f"ar{index}", "api_requests", "AWS/ApiGateway", "Count", dimensions, "Sum")
            add_query(f"ae{index}", "api_5xx", "AWS/ApiGateway", "5xx", dimensions, "Sum")
        for index, distribution_id in enumerate(distributions):
            dimensions = [
                {"Name": "DistributionId", "Value": distribution_id},
                {"Name": "Region", "Value": "Global"},
            ]
            add_query(f"cr{index}", "cloudfront_requests", "AWS/CloudFront", "Requests", dimensions, "Sum")

        metrics = {
            "lambda_invocations": None,
            "lambda_errors": None,
            "lambda_duration_p95_ms": None,
            "api_requests": None,
            "api_5xx": None,
            "cloudfront_requests": None,
        }
        if not queries:
            return metrics
        end = datetime.now(UTC)
        paginator = self._client("cloudwatch").get_paginator("get_metric_data")
        collected: dict[str, list[float]] = {key: [] for key in metrics}
        for page in paginator.paginate(
            MetricDataQueries=queries,
            StartTime=end - timedelta(hours=self.settings.lookback_hours),
            EndTime=end,
            ScanBy="TimestampDescending",
        ):
            for result in page.get("MetricDataResults", []):
                mapping = reducers.get(str(result.get("Id")))
                if mapping is None:
                    continue
                key, reducer = mapping
                values = [float(value) for value in result.get("Values", [])]
                if not values:
                    continue
                collected[key].append(max(values) if reducer == "max" else sum(values))
        for key, values in collected.items():
            if not values:
                continue
            metrics[key] = max(values) if key == "lambda_duration_p95_ms" else sum(values)
        return metrics

    def log_groups(self, environment: AwsEnvironment) -> tuple[str, ...]:
        groups: list[str] = []
        for stack_name in (environment.application_stack, environment.data_stack):
            for resource in self._list_stack_resources(stack_name):
                if resource.get("ResourceType") == "AWS::Logs::LogGroup" and resource.get("PhysicalResourceId"):
                    groups.append(str(resource["PhysicalResourceId"]))
        return tuple(sorted(set(groups)))

    def fetch_logs(
        self,
        environment: AwsEnvironment,
        limit: int = 100,
        level: str = "ERROR",
    ) -> LogFetchResult:
        source = f"AWS {environment.label}"
        if not self.settings.enabled:
            return LogFetchResult(source=source, error="AWS monitoring is disabled.")
        try:
            groups = self.log_groups(environment)
            if not groups:
                return LogFetchResult(source=source, error="No CloudWatch log groups were found in the stacks.")
            client = self._client("logs")
            start_time = int(
                (datetime.now(UTC) - timedelta(hours=self.settings.lookback_hours)).timestamp() * 1000
            )
            entries = []
            for group in groups:
                group_entries = deque(maxlen=limit)
                kwargs: dict[str, Any] = {
                    "logGroupName": group,
                    "startTime": start_time,
                    "interleaved": True,
                    "PaginationConfig": {"MaxItems": 5_000},
                }
                filter_pattern = cloudwatch_filter_pattern(level, group)
                if filter_pattern:
                    kwargs["filterPattern"] = filter_pattern
                paginator = client.get_paginator("filter_log_events")
                for page in paginator.paginate(**kwargs):
                    for event in page.get("events", []):
                        entry = parse_log_message(
                            str(event.get("message", "")),
                            f"{environment.stage}: {group}",
                            event.get("timestamp"),
                        )
                        if level == "ALL" or entry.level == level:
                            group_entries.append(entry)
                entries.extend(group_entries)
            entries.sort(
                key=lambda entry: entry.timestamp or datetime.min.replace(tzinfo=UTC),
                reverse=True,
            )
            return LogFetchResult(source=source, entries=tuple(entries[:limit]))
        except (BotoCoreError, ClientError, KeyError, ValueError) as error:
            return LogFetchResult(source=source, error=f"CloudWatch log retrieval failed: {error}")
