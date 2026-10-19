from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import replace
from datetime import datetime

from forever_admin import config as config_module
from forever_admin.app import DashboardRuntime, _job_render_signature, _source_version_summary
from forever_admin.config import LocalLogSource, load_config
from forever_admin.models import JobExecution, JobOutputLine, JobState


def test_job_render_signature_changes_only_for_visible_job_state() -> None:
    runtime = DashboardRuntime(load_config())
    initial = _job_render_signature(runtime)
    execution = JobExecution(
        execution_id="execution-1",
        job_id="verify-repository",
        job_name="Verify repository",
        status=JobState.RUNNING,
        started_at=datetime.now().astimezone(),
        step_count=1,
    )
    runtime.jobs.history.append(execution)

    running = _job_render_signature(runtime)
    assert running != initial
    assert _job_render_signature(runtime) == running

    execution.output.append(
        JobOutputLine(
            timestamp=datetime.now().astimezone(),
            stream="stdout",
            text="typecheck complete",
        )
    )
    with_output = _job_render_signature(runtime)
    assert with_output != running

    runtime.jobs.history[0] = replace(execution, status=JobState.SUCCEEDED, exit_code=0)
    assert _job_render_signature(runtime) != with_output


def test_source_version_summary_uses_the_explicit_refresh_result() -> None:
    execution = JobExecution(
        execution_id="execution-1",
        job_id="update-latest-local-catalog",
        job_name="Update latest local catalog",
        output=[
            JobOutputLine(
                timestamp=datetime.now().astimezone(),
                stream="stdout",
                text="Source version status: changed — LibItemDB v1.4.1 -> v1.6.0.",
            )
        ],
    )

    assert _source_version_summary(execution) == (
        "changed — LibItemDB v1.4.1 -> v1.6.0."
    )


def test_combined_local_update_job_runs_refresh_before_catalog_sync() -> None:
    config = load_config()
    job = next(
        job for job in config.jobs if job.id == "update-latest-local-catalog"
    )

    assert job.commands[0][1:] == ("-m", "forever_admin.source_refresh", "refresh")
    assert job.commands[1][1:] == ("-m", "forever_admin.local_catalog_sync")


def test_frontend_is_registered_as_a_managed_local_service() -> None:
    config = load_config()
    job = next(job for job in config.jobs if job.id == "serve-frontend")

    assert job.service is True
    assert job.service_url == "http://127.0.0.1:5173"
    assert job.service_link_label == "Open frontend"
    assert job.commands == (("pnpm", "dev:web"),)


def test_local_api_service_uses_the_loopback_postgres_catalog_without_aws() -> None:
    config = load_config()
    job = next(job for job in config.jobs if job.id == "serve-local-api")

    assert job.service is True
    assert job.service_url == "http://127.0.0.1:3001/api/ready"
    assert job.service_link_label == "Check API readiness"
    assert job.environment == {
        "LOCAL_DATABASE_URL": (
            "postgresql://forever_professions:local-only@127.0.0.1:55432/"
            "forever_professions_local"
        ),
        "PORT": "3001",
    }
    assert job.required_environment == ()
    assert job.commands == (("pnpm", "dev:api"),)


def test_recent_error_refresh_accepts_timestamp_less_entries(tmp_path) -> None:
    path = tmp_path / "api.log"
    path.write_text("ERROR database unavailable\n", encoding="utf-8")
    config = load_config()
    config = replace(
        config,
        aws=replace(config.aws, environments=()),
        local_log_sources=(LocalLogSource("api", "Local API", path),),
    )
    runtime = DashboardRuntime(config)

    asyncio.run(runtime.refresh_recent_errors())

    assert len(runtime.recent_errors) == 1
    assert runtime.recent_errors[0].timestamp is None


def test_config_preserves_the_active_python_executable_path(
    tmp_path,
    monkeypatch,
) -> None:
    active_python = tmp_path / "venv" / ("python.exe" if sys.platform == "win32" else "python")
    monkeypatch.delenv("ADMIN_PYTHON", raising=False)
    monkeypatch.setenv("ADMIN_ENV_FILE", str(tmp_path / "missing.env"))
    monkeypatch.setattr(config_module.sys, "executable", str(active_python))

    config = load_config()

    expected = os.path.abspath(active_python)
    assert os.environ["ADMIN_PYTHON"] == expected
    python_commands = [
        command[0]
        for job in config.jobs
        for command in job.commands
        if command[0] == expected
    ]
    assert python_commands
