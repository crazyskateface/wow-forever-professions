from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import replace
from datetime import datetime
from typing import Any

from nicegui import ui

from forever_admin.aws import AwsMonitor
from forever_admin.config import DashboardConfig, load_config
from forever_admin.health import HealthChecker
from forever_admin.jobs import (
    CommandPolicy,
    DuplicateJobError,
    JobExecutor,
    JobNotRunnableError,
    SecretRedactor,
)
from forever_admin.logs import LocalLogReader
from forever_admin.models import (
    AwsEnvironmentSnapshot,
    HealthResult,
    HealthState,
    HealthTarget,
    JobExecution,
    JobState,
    LogEntry,
    LogFetchResult,
)


_STATE_COLORS = {
    HealthState.HEALTHY: "positive",
    HealthState.DEGRADED: "warning",
    HealthState.UNHEALTHY: "negative",
    HealthState.UNKNOWN: "grey",
}

_JOB_COLORS = {
    JobState.IDLE: "grey",
    JobState.RUNNING: "primary",
    JobState.SUCCEEDED: "positive",
    JobState.FAILED: "negative",
    JobState.TIMED_OUT: "warning",
    JobState.CANCELLED: "grey",
}

_AWS_LOGIN_JOB_ID = "aws-login"


def _format_time(value: datetime | None) -> str:
    return value.astimezone().strftime("%Y-%m-%d %H:%M:%S %Z") if value else "Never"


def _format_metric(value: float | None, suffix: str = "") -> str:
    if value is None:
        return "No data"
    if suffix == " ms":
        return f"{value:,.1f}{suffix}"
    return f"{value:,.0f}{suffix}"


class DashboardRuntime:
    def __init__(self, config: DashboardConfig) -> None:
        self.config = config
        self.health = HealthChecker()
        self.aws = AwsMonitor(config.aws)
        self.local_logs = LocalLogReader()
        self.redactor = SecretRedactor.from_environment(config.security.redact_environment)
        self.jobs = JobExecutor(
            config.jobs,
            CommandPolicy(config.app.repo_root, config.security.allowed_executables),
            self.redactor,
        )
        self.health_results: tuple[HealthResult, ...] = ()
        self.aws_snapshots: dict[str, AwsEnvironmentSnapshot] = {}
        self.recent_errors: tuple[LogEntry, ...] = ()
        self.log_errors: tuple[str, ...] = ()
        self.aws_identity: str | None = None
        self.aws_identity_error: str | None = None
        self.last_refresh: datetime | None = None
        self._refresh_lock = asyncio.Lock()

    def reconnect_aws(self) -> None:
        self.aws.reset()
        self.aws_identity = None
        self.aws_identity_error = None
        self.aws_snapshots = {}
        self.recent_errors = ()
        self.log_errors = ()

    def _redact_log_result(self, result: LogFetchResult) -> LogFetchResult:
        return replace(
            result,
            entries=tuple(
                replace(
                    entry,
                    message=self.redactor.redact(entry.message),
                    details=self.redactor.redact(entry.details) if entry.details else None,
                )
                for entry in result.entries
            ),
            error=self.redactor.redact(result.error) if result.error else None,
        )

    async def refresh(self, include_logs: bool = True) -> None:
        if self._refresh_lock.locked():
            return
        async with self._refresh_lock:
            static_health = asyncio.create_task(self.health.check_all(self.config.health_targets))
            snapshots = await asyncio.gather(
                *(
                    asyncio.to_thread(self.aws.environment_snapshot, environment)
                    for environment in self.config.aws.environments
                )
            )
            self.aws_snapshots = {snapshot.stage: snapshot for snapshot in snapshots}
            deployed_targets: list[HealthTarget] = []
            for environment in self.config.aws.environments:
                snapshot = self.aws_snapshots.get(environment.stage)
                if snapshot and snapshot.web_url:
                    base = snapshot.web_url.rstrip("/")
                    deployed_targets.extend(
                        (
                            HealthTarget(
                                id=f"{environment.stage}-api-liveness",
                                name=f"{environment.label} API liveness",
                                url=f"{base}/api/health",
                                expected_status="ok",
                                environment=environment.stage,
                            ),
                            HealthTarget(
                                id=f"{environment.stage}-api-readiness",
                                name=f"{environment.label} database readiness",
                                url=f"{base}/api/ready",
                                expected_status="ready",
                                environment=environment.stage,
                            ),
                        )
                    )
            deployed_health = await self.health.check_all(tuple(deployed_targets))
            self.health_results = (*await static_health, *deployed_health)
            if include_logs:
                await self.refresh_recent_errors()
            if self.config.aws.enabled and self.aws_identity is None and self.aws_identity_error is None:
                try:
                    account, arn = await asyncio.to_thread(self.aws.caller_identity)
                    self.aws_identity = f"{account} / {arn}"
                except Exception as error:
                    self.aws_identity_error = str(error)
            self.last_refresh = datetime.now().astimezone()

    async def refresh_recent_errors(self) -> None:
        results = await asyncio.gather(
            *(
                asyncio.to_thread(self.aws.fetch_logs, environment, 8, "ERROR")
                for environment in self.config.aws.environments
            )
        )
        redacted_results = tuple(self._redact_log_result(result) for result in results)
        entries = [entry for result in redacted_results for entry in result.entries]
        errors = [result.error for result in redacted_results if result.error]
        for source in self.config.local_log_sources:
            result = self._redact_log_result(
                await asyncio.to_thread(self.local_logs.read, source.path, source.name, 8, "ERROR")
            )
            entries.extend(result.entries)
            if result.error:
                errors.append(result.error)
        entries.sort(key=lambda entry: entry.timestamp or datetime.min.astimezone(), reverse=True)
        self.recent_errors = tuple(entries[:8])
        self.log_errors = tuple(str(error) for error in errors)

    async def fetch_logs(self, source_id: str, level: str, limit: int) -> tuple[LogFetchResult, ...]:
        tasks = []
        for environment in self.config.aws.environments:
            if source_id in {"all", f"aws:{environment.stage}"}:
                tasks.append(asyncio.to_thread(self.aws.fetch_logs, environment, limit, level))
        for source in self.config.local_log_sources:
            if source_id in {"all", f"local:{source.id}"}:
                tasks.append(asyncio.to_thread(self.local_logs.read, source.path, source.name, limit, level))
        if not tasks:
            return ()
        return tuple(self._redact_log_result(result) for result in await asyncio.gather(*tasks))


def _overall_state(runtime: DashboardRuntime) -> HealthState:
    states = [result.state for result in runtime.health_results]
    states.extend(snapshot.state for snapshot in runtime.aws_snapshots.values())
    if any(state is HealthState.UNHEALTHY for state in states):
        return HealthState.UNHEALTHY
    if any(state is HealthState.DEGRADED for state in states):
        return HealthState.DEGRADED
    if states and all(state is HealthState.HEALTHY for state in states):
        return HealthState.HEALTHY
    return HealthState.UNKNOWN


def _status_badge(value: HealthState | JobState | str) -> None:
    if isinstance(value, HealthState):
        color = _STATE_COLORS[value]
        label = value.value
    elif isinstance(value, JobState):
        color = _JOB_COLORS[value]
        label = value.value.replace("_", " ")
    else:
        label = value
        color = "grey"
    ui.badge(label.upper(), color=color).classes("font-semibold tracking-wide")


def _metric_tile(label: str, value: str, detail: str = "Last 24 hours") -> None:
    with ui.card().classes("metric-card"):
        ui.label(label).classes("text-xs uppercase tracking-wider text-slate-400")
        ui.label(value).classes("text-2xl font-semibold text-slate-100")
        ui.label(detail).classes("text-xs text-slate-500")


async def _sign_in_to_aws(
    runtime: DashboardRuntime,
    refresh: Callable[[], Awaitable[None]],
) -> None:
    job = runtime.jobs.definitions.get(_AWS_LOGIN_JOB_ID)
    if job is None:
        ui.notify("The AWS sign-in job is not configured.", color="negative")
        return
    profile = runtime.config.aws.profile
    if not profile:
        ui.notify("Set ADMIN_AWS_PROFILE before signing in.", color="negative")
        return
    with ui.dialog() as dialog, ui.card().classes("dialog-card"):
        ui.label("Sign in to AWS").classes("text-xl font-semibold")
        ui.label(
            f"AWS CLI will open its browser sign-in flow for profile {profile}. "
            "The resulting short-lived credentials stay in the AWS CLI cache, not this dashboard."
        ).classes("text-sm text-slate-300")
        ui.label(
            "The dashboard will reconnect and refresh automatically after sign-in completes."
        ).classes("text-xs text-slate-500")
        with ui.row().classes("w-full justify-end"):
            ui.button("Cancel", on_click=lambda: dialog.submit(False)).props("flat")
            ui.button("Continue to AWS", icon="login", on_click=lambda: dialog.submit(True), color="primary")
    if not await dialog:
        return
    try:
        execution = await runtime.jobs.start(_AWS_LOGIN_JOB_ID)
    except (DuplicateJobError, JobNotRunnableError, ValueError) as error:
        ui.notify(str(error), color="negative", multi_line=True)
        return
    ui.notify("AWS sign-in started; complete the browser prompt.", color="primary")
    execution = await runtime.jobs.wait(execution.execution_id)
    if execution.status is not JobState.SUCCEEDED:
        ui.notify(
            execution.error or "AWS sign-in did not complete.",
            color="negative",
            multi_line=True,
        )
        await refresh()
        return
    runtime.reconnect_aws()
    await refresh()
    if runtime.aws_identity:
        ui.notify("AWS sign-in completed and the dashboard reconnected.", color="positive")
    else:
        ui.notify(
            "AWS sign-in completed, but the identity check still failed. Open Health for details.",
            color="warning",
            multi_line=True,
        )


def _render_aws_access(runtime: DashboardRuntime, sign_in: Callable[[], Awaitable[None]]) -> None:
    latest = runtime.jobs.latest(_AWS_LOGIN_JOB_ID)
    profile = runtime.config.aws.profile or "default credential chain"
    with ui.card().classes("section-card w-full"):
        with ui.row().classes("w-full items-center gap-3"):
            with ui.column().classes("gap-1 min-w-0"):
                ui.label("AWS access").classes("section-title")
                ui.label(f"Profile: {profile} · Region: {runtime.config.aws.region}").classes(
                    "text-xs text-slate-500"
                )
            ui.space()
            if latest and latest.status is JobState.RUNNING:
                _status_badge(JobState.RUNNING)
            elif runtime.aws_identity:
                _status_badge(HealthState.HEALTHY)
            else:
                _status_badge(HealthState.UNKNOWN)
        if runtime.aws_identity:
            ui.label(f"Signed in as {runtime.aws_identity}").classes("text-sm text-slate-300 break-all")
        elif runtime.aws_identity_error:
            ui.label(f"AWS sign-in required: {runtime.aws_identity_error}").classes("warning-callout")
        else:
            ui.label("Checking the configured AWS identity...").classes("text-sm text-slate-400")
        with ui.row().classes("w-full items-center"):
            ui.label("Credentials are managed by AWS CLI and are never stored by this panel.").classes(
                "text-xs text-slate-500"
            )
            ui.space()
            button = ui.button("Sign in to AWS", icon="login", on_click=sign_in, color="primary")
            if latest and latest.status is JobState.RUNNING:
                button.disable()


def _shell(runtime: DashboardRuntime, title: str, subtitle: str) -> Any:
    ui.colors(
        primary="#d19a42",
        secondary="#64748b",
        accent="#e8b562",
        positive="#39b980",
        negative="#ef5d67",
        warning="#e8a83e",
        dark="#0b0f14",
    )
    with ui.header().classes("admin-header items-center"):
        ui.button(icon="menu", on_click=lambda: drawer.toggle()).props("flat round color=grey-4")
        with ui.column().classes("gap-0"):
            ui.label(title).classes("text-lg font-semibold")
            ui.label(subtitle).classes("text-xs text-slate-400")
        ui.space()
        _status_badge(_overall_state(runtime))
    with ui.left_drawer(value=True).classes("admin-drawer") as drawer:
        ui.label("FOREVER PROFESSIONS").classes("px-3 pt-4 text-xs font-bold tracking-widest text-amber-400")
        ui.label("Operations console").classes("px-3 pb-4 text-sm text-slate-400")
        for label, icon, target in (
            ("Overview", "dashboard", "/"),
            ("Jobs", "play_circle", "/jobs"),
            ("Logs", "receipt_long", "/logs"),
            ("Health", "monitor_heart", "/health"),
        ):
            ui.link(label, target).props(f"icon={icon}").classes("nav-link")
        ui.separator().classes("my-4")
        ui.label("Local only").classes("px-3 text-xs font-semibold text-emerald-400")
        ui.label(f"{runtime.config.app.host}:{runtime.config.app.port}").classes("px-3 text-xs text-slate-500")
    return drawer


def _render_environment(snapshot: AwsEnvironmentSnapshot) -> None:
    with ui.card().classes("section-card w-full"):
        with ui.row().classes("w-full items-center gap-3"):
            ui.label(snapshot.stage.title()).classes("section-title")
            _status_badge(snapshot.state)
            ui.space()
            ui.label(_format_time(snapshot.checked_at)).classes("text-xs text-slate-500")
        if snapshot.error:
            ui.label(snapshot.error).classes("error-callout")
            return
        with ui.grid(columns=2).classes("w-full gap-3 max-sm:grid-cols-1"):
            for label, stack in (("Application", snapshot.application_stack), ("Data", snapshot.data_stack)):
                with ui.element("div").classes("stack-row"):
                    ui.label(label).classes("text-xs uppercase tracking-wide text-slate-500")
                    ui.label(stack.name if stack else "Unavailable").classes("font-medium")
                    ui.label(stack.status if stack else "UNKNOWN").classes("text-sm text-slate-400")
                    ui.label(_format_time(stack.updated_at if stack else None)).classes("text-xs text-slate-500")
        with ui.grid(columns=3).classes("w-full gap-3 max-md:grid-cols-2 max-sm:grid-cols-1"):
            _metric_tile("API requests", _format_metric(snapshot.metrics.get("api_requests")))
            _metric_tile("API 5xx", _format_metric(snapshot.metrics.get("api_5xx")))
            _metric_tile("Lambda invocations", _format_metric(snapshot.metrics.get("lambda_invocations")))
            _metric_tile("Lambda errors", _format_metric(snapshot.metrics.get("lambda_errors")))
            _metric_tile(
                "Lambda p95 duration",
                _format_metric(snapshot.metrics.get("lambda_duration_p95_ms"), " ms"),
            )
            _metric_tile("CloudFront requests", _format_metric(snapshot.metrics.get("cloudfront_requests")))
        if snapshot.web_url:
            ui.link("Open deployed application", snapshot.web_url, new_tab=True).classes("text-amber-400 text-sm")


def _render_job_history(history: list[JobExecution], limit: int = 6) -> None:
    if not history:
        ui.label("No jobs have run in this dashboard session.").classes("empty-state")
        return
    for execution in history[:limit]:
        with ui.row().classes("history-row"):
            with ui.column().classes("gap-0 min-w-0"):
                ui.label(execution.job_name).classes("font-medium truncate")
                ui.label(
                    f"{_format_time(execution.started_at)} · "
                    f"{execution.duration_seconds:.1f}s" if execution.duration_seconds is not None else "Not started"
                ).classes("text-xs text-slate-500")
            ui.space()
            if execution.exit_code is not None:
                ui.label(f"exit {execution.exit_code}").classes("text-xs text-slate-500")
            _status_badge(execution.status)


def _render_log_entry(entry: LogEntry) -> None:
    color = {"CRITICAL": "negative", "ERROR": "negative", "WARN": "warning"}.get(entry.level, "grey")
    summary = entry.message.splitlines()[0][:180]
    caption = f"{entry.level} · {_format_time(entry.timestamp)} · {entry.source}"
    with ui.expansion(summary, caption=caption, icon="error_outline").classes("log-entry w-full"):
        ui.badge(entry.level, color=color)
        ui.code(entry.details or entry.message).classes("log-code w-full")


def _job_render_signature(runtime: DashboardRuntime) -> tuple[object, ...]:
    signature: list[object] = []
    for job in runtime.config.jobs:
        latest = runtime.jobs.latest(job.id)
        signature.append((job.id, runtime.jobs.missing_environment(job)))
        if latest is not None:
            signature.append(
                (
                    latest.execution_id,
                    latest.status,
                    latest.current_step,
                    latest.exit_code,
                    latest.error,
                    latest.cancel_requested,
                    len(latest.output),
                )
            )
    return tuple(signature)


def register_pages(runtime: DashboardRuntime) -> None:
    @ui.page("/")
    async def overview_page() -> None:
        _shell(runtime, "Operations overview", "Health, deployments, usage, and recent activity")
        container = ui.column().classes("page-shell")

        async def sign_in() -> None:
            await _sign_in_to_aws(runtime, refresh)

        async def refresh() -> None:
            await runtime.refresh(include_logs=True)
            container.clear()
            with container:
                with ui.row().classes("w-full items-end"):
                    with ui.column().classes("gap-1"):
                        ui.label("Current operating picture").classes("page-title")
                        ui.label("Live checks are read-only. No maintenance task runs automatically.").classes("page-subtitle")
                    ui.space()
                    ui.button("Refresh", icon="refresh", on_click=refresh).props("outline")
                state = _overall_state(runtime)
                with ui.card().classes("hero-status w-full"):
                    with ui.row().classes("w-full items-center gap-4"):
                        with ui.column().classes("gap-1"):
                            ui.label("OVERALL STATUS").classes("text-xs font-bold tracking-widest text-slate-500")
                            ui.label(state.value.title()).classes("text-3xl font-semibold")
                            ui.label(f"Last refreshed {_format_time(runtime.last_refresh)}").classes("text-xs text-slate-500")
                        ui.space()
                        _status_badge(state)
                _render_aws_access(runtime, sign_in)
                ui.label("AWS environments").classes("section-heading")
                with ui.grid(columns=2).classes("w-full gap-4 max-lg:grid-cols-1"):
                    for environment in runtime.config.aws.environments:
                        snapshot = runtime.aws_snapshots.get(environment.stage)
                        if snapshot:
                            _render_environment(snapshot)
                with ui.grid(columns=2).classes("w-full gap-4 max-lg:grid-cols-1"):
                    with ui.card().classes("section-card w-full"):
                        ui.label("Recent job results").classes("section-title")
                        _render_job_history(runtime.jobs.history)
                        ui.link("Open jobs", "/jobs").classes("text-amber-400 text-sm")
                    with ui.card().classes("section-card w-full"):
                        ui.label("Recent errors").classes("section-title")
                        if runtime.recent_errors:
                            for entry in runtime.recent_errors[:5]:
                                _render_log_entry(entry)
                        elif runtime.log_errors:
                            ui.label("Error logs could not be retrieved.").classes("error-callout")
                            for error in runtime.log_errors:
                                ui.label(error).classes("text-xs text-slate-500 break-all")
                        else:
                            ui.label("No matching errors were returned.").classes("empty-state")
                        ui.link("Open logs", "/logs").classes("text-amber-400 text-sm")

        ui.timer(0.1, refresh, once=True)
        ui.timer(runtime.config.app.auto_refresh_seconds, refresh)

    @ui.page("/jobs")
    async def jobs_page() -> None:
        _shell(runtime, "Jobs", "Controlled imports, validation, and deployments")
        container = ui.column().classes("page-shell")
        expanded_outputs: dict[str, bool] = {}
        last_render_signature: tuple[object, ...] | None = None

        with ui.dialog() as confirmation_dialog, ui.card().classes("dialog-card"):
            confirmation_title = ui.label().classes("text-xl font-semibold")
            confirmation_text = ui.label().classes("text-sm text-slate-300")
            ui.label("The live output below will record the exact result.").classes(
                "text-xs text-slate-500"
            )
            with ui.row().classes("w-full justify-end"):
                ui.button("Cancel", on_click=lambda: confirmation_dialog.submit(False)).props("flat")
                ui.button(
                    "Run job",
                    on_click=lambda: confirmation_dialog.submit(True),
                    color="negative",
                )

        async def ask_to_run(job_id: str) -> None:
            job = runtime.jobs.definitions[job_id]
            if job.confirmation:
                confirmation_title.set_text(f"Confirm: {job.name}")
                confirmation_text.set_text(job.confirmation)
                if not await confirmation_dialog:
                    return
            try:
                await runtime.jobs.start(job_id)
                ui.notify(f"Started {job.name}", color="positive")
            except (DuplicateJobError, JobNotRunnableError, ValueError) as error:
                ui.notify(str(error), color="negative", multi_line=True)
            render()

        async def cancel(job_id: str) -> None:
            if await runtime.jobs.cancel(job_id):
                ui.notify("Cancellation requested", color="warning")
            render()

        def render(force: bool = False) -> None:
            nonlocal last_render_signature
            signature = _job_render_signature(runtime)
            if not force and signature == last_render_signature:
                return
            last_render_signature = signature
            container.clear()
            with container:
                with ui.row().classes("w-full items-end"):
                    with ui.column().classes("gap-1"):
                        ui.label("Run trusted operations").classes("page-title")
                        ui.label("Commands are predefined in admin/config.toml and execute without a shell.").classes("page-subtitle")
                    ui.space()
                    ui.label(f"{len(runtime.config.jobs)} registered jobs").classes("text-sm text-slate-500")
                grouped: dict[str, list[Any]] = defaultdict(list)
                for job in runtime.config.jobs:
                    grouped[job.category].append(job)
                for category, jobs in grouped.items():
                    ui.label(category).classes("section-heading")
                    with ui.grid(columns=2).classes("w-full gap-4 max-lg:grid-cols-1"):
                        for job in jobs:
                            latest = runtime.jobs.latest(job.id)
                            missing = runtime.jobs.missing_environment(job)
                            with ui.card().classes("section-card job-card w-full"):
                                with ui.row().classes("w-full items-start gap-3"):
                                    with ui.column().classes("gap-1 min-w-0"):
                                        ui.label(job.name).classes("section-title")
                                        ui.label(job.description).classes("text-sm text-slate-400")
                                    ui.space()
                                    _status_badge(latest.status if latest else JobState.IDLE)
                                if missing:
                                    ui.label(f"Missing environment: {', '.join(missing)}").classes("warning-callout")
                                with ui.row().classes("w-full items-center"):
                                    ui.label(f"{len(job.commands)} step{'s' if len(job.commands) != 1 else ''}").classes("text-xs text-slate-500")
                                    ui.label(f"timeout {job.timeout_seconds:g}s").classes("text-xs text-slate-500")
                                    ui.space()
                                    if latest and latest.status is JobState.RUNNING:
                                        ui.button("Cancel", icon="stop", on_click=lambda job_id=job.id: cancel(job_id), color="warning").props("outline")
                                    else:
                                        run_button = ui.button(
                                            "Run",
                                            icon="play_arrow",
                                            on_click=lambda job_id=job.id: ask_to_run(job_id),
                                            color="primary",
                                        )
                                        if missing:
                                            run_button.disable()
                                if latest:
                                    ui.label(
                                        f"Step {latest.current_step}/{latest.step_count} · "
                                        f"duration {latest.duration_seconds:.1f}s"
                                        if latest.duration_seconds is not None
                                        else "Waiting to start"
                                    ).classes("text-xs text-slate-500")
                                    if latest.error:
                                        ui.label(latest.error).classes("error-callout")
                                    if latest.output:
                                        output = "\n".join(
                                            f"[{line.timestamp.strftime('%H:%M:%S')}] {line.stream}: {line.text}"
                                            for line in latest.output[-250:]
                                        )
                                        with ui.expansion(
                                            "Live output",
                                            icon="terminal",
                                            value=expanded_outputs.get(
                                                job.id,
                                                latest.status is JobState.RUNNING,
                                            ),
                                            on_value_change=lambda event, job_id=job.id: expanded_outputs.__setitem__(
                                                job_id,
                                                bool(event.value),
                                            ),
                                        ).classes("w-full"):
                                            ui.code(output).classes("log-code w-full")

        render(force=True)
        ui.timer(1.0, render)

    @ui.page("/logs")
    async def logs_page() -> None:
        _shell(runtime, "Logs", "CloudWatch and configured local application errors")
        source_options = {"all": "All configured sources"}
        source_options.update(
            {f"aws:{environment.stage}": f"AWS {environment.label}" for environment in runtime.config.aws.environments}
        )
        source_options.update(
            {f"local:{source.id}": source.name for source in runtime.config.local_log_sources}
        )
        with ui.column().classes("page-shell"):
            with ui.row().classes("filter-bar w-full items-end"):
                source = ui.select(source_options, value="all", label="Source").classes("min-w-64")
                level = ui.select(["ALL", "CRITICAL", "ERROR", "WARN", "INFO"], value="ERROR", label="Level").classes("w-40")
                limit = ui.number(label="Recent entries", value=100, min=10, max=500, step=10).classes("w-40")
                refresh_button = ui.button("Refresh logs", icon="refresh")
            results_container = ui.column().classes("w-full gap-3")

            async def refresh_logs() -> None:
                refresh_button.disable()
                results_container.clear()
                with results_container:
                    ui.spinner(size="lg")
                    ui.label("Retrieving logs...").classes("text-sm text-slate-400")
                results = await runtime.fetch_logs(str(source.value), str(level.value), int(limit.value or 100))
                results_container.clear()
                with results_container:
                    if not results:
                        ui.label("No log sources are configured for this selection.").classes("empty-state")
                    for result in results:
                        with ui.card().classes("section-card w-full"):
                            with ui.row().classes("w-full items-center"):
                                ui.label(result.source).classes("section-title")
                                ui.space()
                                ui.label(f"{len(result.entries)} entries").classes("text-xs text-slate-500")
                            if result.error:
                                ui.label(result.error).classes("error-callout")
                            elif not result.entries:
                                ui.label("The source was read successfully and returned no matching entries.").classes("empty-state")
                            else:
                                for entry in result.entries:
                                    _render_log_entry(entry)
                refresh_button.enable()

            refresh_button.on_click(refresh_logs)
            ui.timer(0.1, refresh_logs, once=True)

    @ui.page("/health")
    async def health_page() -> None:
        _shell(runtime, "Health", "Endpoint diagnostics and AWS deployment detail")
        container = ui.column().classes("page-shell")

        async def sign_in() -> None:
            await _sign_in_to_aws(runtime, refresh)

        async def refresh() -> None:
            await runtime.refresh(include_logs=False)
            container.clear()
            with container:
                with ui.row().classes("w-full items-end"):
                    with ui.column().classes("gap-1"):
                        ui.label("Service and dependency health").classes("page-title")
                        if runtime.aws_identity:
                            ui.label(f"AWS identity: {runtime.aws_identity}").classes("page-subtitle break-all")
                        elif runtime.aws_identity_error:
                            ui.label(f"AWS identity unavailable: {runtime.aws_identity_error}").classes("page-subtitle break-all")
                    ui.space()
                    ui.button("Refresh", icon="refresh", on_click=refresh).props("outline")
                _render_aws_access(runtime, sign_in)
                ui.label("HTTP checks").classes("section-heading")
                with ui.grid(columns=2).classes("w-full gap-4 max-lg:grid-cols-1"):
                    for result in runtime.health_results:
                        with ui.card().classes("section-card w-full"):
                            with ui.row().classes("w-full items-center"):
                                with ui.column().classes("gap-0 min-w-0"):
                                    ui.label(result.name).classes("section-title")
                                    ui.label(result.environment.title()).classes("text-xs uppercase tracking-wide text-slate-500")
                                ui.space()
                                _status_badge(result.state)
                            ui.label(result.message).classes("text-sm text-slate-300")
                            with ui.row().classes("w-full gap-6 text-xs text-slate-500"):
                                ui.label(f"HTTP: {result.http_status if result.http_status is not None else 'unreachable'}")
                                ui.label(
                                    f"Latency: {result.latency_ms:.1f} ms" if result.latency_ms is not None else "Latency: unavailable"
                                )
                                ui.label(f"Last success: {_format_time(result.last_success_at)}")
                ui.label("AWS deployment state and usage").classes("section-heading")
                for environment in runtime.config.aws.environments:
                    snapshot = runtime.aws_snapshots.get(environment.stage)
                    if not snapshot:
                        continue
                    _render_environment(snapshot)
                    if snapshot.recent_events:
                        with ui.card().classes("section-card w-full"):
                            ui.label(f"Recent {environment.label} stack events").classes("section-title")
                            for event in snapshot.recent_events:
                                with ui.row().classes("history-row"):
                                    with ui.column().classes("gap-0 min-w-0"):
                                        ui.label(f"{event.logical_resource_id} · {event.resource_type}").classes("text-sm font-medium")
                                        ui.label(event.reason or event.stack_name).classes("text-xs text-slate-500 break-all")
                                    ui.space()
                                    ui.label(event.status).classes("text-xs text-slate-400")
                                    ui.label(_format_time(event.timestamp)).classes("text-xs text-slate-500")

        ui.timer(0.1, refresh, once=True)
        ui.timer(runtime.config.app.auto_refresh_seconds, refresh)


def configure_ui() -> None:
    ui.add_css(
        """
        :root { --panel: #111821; --panel-2: #161f2a; --line: #263241; --muted: #8b9aab; }
        body { background: #090d12; color: #e7edf4; }
        .admin-header { background: #0d131b; border-bottom: 1px solid var(--line); box-shadow: none; }
        .admin-drawer { background: #0b1118; border-right: 1px solid var(--line); }
        .nav-link { display: flex; width: 100%; padding: 10px 12px; border-radius: 7px; color: #cbd5e1; text-decoration: none; }
        .nav-link:hover { background: #18212d; color: #f4c16d; }
        .page-shell { width: min(1440px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0 48px; gap: 18px; }
        .page-title { font-size: clamp(1.5rem, 3vw, 2.1rem); font-weight: 650; line-height: 1.1; }
        .page-subtitle { color: var(--muted); font-size: 0.875rem; }
        .section-heading { margin-top: 8px; font-size: 0.75rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #8b9aab; }
        .section-title { font-size: 1.05rem; font-weight: 650; }
        .section-card, .metric-card, .hero-status { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: none; }
        .hero-status { border-left: 3px solid #d19a42; padding: 22px; }
        .section-card { padding: 18px; gap: 14px; }
        .metric-card { padding: 13px; gap: 2px; background: var(--panel-2); }
        .stack-row { padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-2); }
        .history-row { width: 100%; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); gap: 12px; }
        .history-row:last-child { border-bottom: 0; }
        .filter-bar { position: sticky; top: 50px; z-index: 5; padding: 14px; background: rgba(11, 17, 24, .96); border: 1px solid var(--line); border-radius: 10px; }
        .log-entry { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; }
        .log-code { max-height: 360px; overflow: auto; background: #080c11 !important; border: 1px solid #202a36; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
        .empty-state { padding: 16px; border: 1px dashed #334155; border-radius: 8px; color: #8290a0; font-size: .875rem; }
        .error-callout { padding: 10px 12px; border-left: 3px solid #ef5d67; background: rgba(239, 93, 103, .08); color: #fca5a5; font-size: .875rem; overflow-wrap: anywhere; }
        .warning-callout { padding: 10px 12px; border-left: 3px solid #e8a83e; background: rgba(232, 168, 62, .08); color: #f4c16d; font-size: .8rem; overflow-wrap: anywhere; }
        .dialog-card { width: min(560px, calc(100vw - 32px)); background: var(--panel); border: 1px solid var(--line); padding: 22px; gap: 14px; }
        @media (max-width: 700px) { .page-shell { width: calc(100vw - 20px); padding-top: 18px; } .filter-bar { position: static; } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; } }
        """,
        shared=True,
    )


def main() -> None:
    config = load_config()
    configure_ui()
    runtime = DashboardRuntime(config)
    register_pages(runtime)
    ui.run(
        host=config.app.host,
        port=config.app.port,
        title=config.app.name,
        dark=True,
        reload=False,
        show=config.app.show_browser,
    )
