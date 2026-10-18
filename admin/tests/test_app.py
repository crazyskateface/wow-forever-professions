from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from forever_admin.app import DashboardRuntime, _job_render_signature
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
