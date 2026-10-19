from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum


class HealthState(StrEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class JobState(StrEnum):
    IDLE = "idle"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class HealthTarget:
    id: str
    name: str
    url: str
    expected_status: str | None = None
    timeout_seconds: float = 5.0
    environment: str = "local"


@dataclass(frozen=True)
class HealthResult:
    target_id: str
    name: str
    environment: str
    state: HealthState
    checked_at: datetime
    latency_ms: float | None = None
    http_status: int | None = None
    reported_status: str | None = None
    message: str = ""
    last_success_at: datetime | None = None


@dataclass(frozen=True)
class JobDefinition:
    id: str
    name: str
    description: str
    commands: tuple[tuple[str, ...], ...]
    working_directory: str = "."
    timeout_seconds: float = 900.0
    category: str = "Maintenance"
    confirmation: str | None = None
    required_environment: tuple[str, ...] = ()
    environment: dict[str, str] = field(default_factory=dict)
    service: bool = False
    service_url: str | None = None
    service_link_label: str | None = None


@dataclass(frozen=True)
class JobOutputLine:
    timestamp: datetime
    stream: str
    text: str


@dataclass
class JobExecution:
    execution_id: str
    job_id: str
    job_name: str
    status: JobState = JobState.IDLE
    started_at: datetime | None = None
    finished_at: datetime | None = None
    exit_code: int | None = None
    output: list[JobOutputLine] = field(default_factory=list)
    current_step: int = 0
    step_count: int = 0
    cancel_requested: bool = False
    error: str | None = None

    @property
    def duration_seconds(self) -> float | None:
        if self.started_at is None:
            return None
        end = self.finished_at or datetime.now().astimezone()
        return max(0.0, (end - self.started_at).total_seconds())


@dataclass(frozen=True)
class LogEntry:
    timestamp: datetime | None
    level: str
    source: str
    message: str
    details: str | None = None


@dataclass(frozen=True)
class LogFetchResult:
    source: str
    entries: tuple[LogEntry, ...] = ()
    error: str | None = None


@dataclass(frozen=True)
class StackSummary:
    name: str
    status: str
    updated_at: datetime | None
    outputs: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class StackEvent:
    stack_name: str
    logical_resource_id: str
    resource_type: str
    status: str
    timestamp: datetime | None
    reason: str | None = None


@dataclass(frozen=True)
class AwsEnvironmentSnapshot:
    stage: str
    state: HealthState
    checked_at: datetime
    application_stack: StackSummary | None = None
    data_stack: StackSummary | None = None
    web_url: str | None = None
    metrics: dict[str, float | None] = field(default_factory=dict)
    recent_events: tuple[StackEvent, ...] = ()
    error: str | None = None
