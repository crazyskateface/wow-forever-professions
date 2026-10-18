from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from forever_admin.app import DashboardRuntime, _job_render_signature, _source_version_summary
from forever_admin.config import load_config
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
