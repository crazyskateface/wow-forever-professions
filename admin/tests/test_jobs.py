from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import replace
from pathlib import Path

import pytest

from forever_admin.jobs import (
    CommandPolicy,
    DuplicateJobError,
    JobExecutor,
    JobValidationError,
    SecretRedactor,
)
from forever_admin.models import JobDefinition, JobExecution, JobState


def _policy(repo_root: Path) -> CommandPolicy:
    return CommandPolicy(repo_root, (str(Path(sys.executable).resolve()),))


def _job(job_id: str, code: str, timeout: float = 5) -> JobDefinition:
    return JobDefinition(
        id=job_id,
        name=job_id,
        description="test job",
        commands=((str(Path(sys.executable).resolve()), "-c", code),),
        timeout_seconds=timeout,
    )


def test_rejects_non_allowlisted_commands(tmp_path: Path) -> None:
    policy = _policy(tmp_path)
    job = JobDefinition(
        id="bad",
        name="Bad",
        description="bad",
        commands=(("cmd.exe", "/c", "echo unsafe"),),
    )

    with pytest.raises(JobValidationError, match="not allowlisted"):
        policy.validate_job(job)


def test_rejects_working_directory_outside_repository(tmp_path: Path) -> None:
    job = _job("outside", "print('no')")
    job = JobDefinition(**{**job.__dict__, "working_directory": ".."})

    with pytest.raises(JobValidationError, match="inside the repository"):
        _policy(tmp_path).validate_job(job)


def test_relative_executable_paths_are_normalized_from_repository_root(tmp_path: Path) -> None:
    executable = tmp_path / "tools" / "python.exe"
    executable.parent.mkdir()
    executable.write_text("placeholder", encoding="utf-8")
    policy = CommandPolicy(tmp_path, ("tools/python.exe",))

    resolved = policy.resolve_command(("tools/python.exe", "--version"))

    assert resolved == (os.path.abspath(executable), "--version")


def test_redacts_secrets_from_output() -> None:
    redactor = SecretRedactor(("top-secret-value",))

    assert redactor.redact("token=top-secret-value") == "token=[REDACTED]"
    assert redactor.redact("Authorization: Bearer abc123") == "Authorization: Bearer [REDACTED]"
    assert redactor.redact("password=hunter2") == "password=[REDACTED]"


def test_successful_and_failed_execution(tmp_path: Path) -> None:
    async def scenario() -> None:
        success = _job("success", "print('completed')")
        failure = _job("failure", "import sys; print('failed', file=sys.stderr); sys.exit(7)")
        executor = JobExecutor((success, failure), _policy(tmp_path))

        first = await executor.start("success")
        first = await executor.wait(first.execution_id)
        second = await executor.start("failure")
        second = await executor.wait(second.execution_id)

        assert first.status is JobState.SUCCEEDED
        assert any(line.text == "completed" for line in first.output)
        assert second.status is JobState.FAILED
        assert second.exit_code == 7
        assert any(line.stream == "stderr" and line.text == "failed" for line in second.output)

    asyncio.run(scenario())


def test_failed_step_prevents_later_commands_from_running(tmp_path: Path) -> None:
    async def scenario() -> None:
        job = JobDefinition(
            id="chain",
            name="chain",
            description="test chain",
            commands=(
                (str(Path(sys.executable).resolve()), "-c", "import sys; sys.exit(9)"),
                (
                    str(Path(sys.executable).resolve()),
                    "-c",
                    "from pathlib import Path; Path('later-ran').write_text('bad')",
                ),
            ),
        )
        executor = JobExecutor((job,), _policy(tmp_path))

        execution = await executor.start(job.id)
        execution = await executor.wait(execution.execution_id)

        assert execution.status is JobState.FAILED
        assert execution.current_step == 1
        assert not (tmp_path / "later-ran").exists()

    asyncio.run(scenario())


def test_job_timeout(tmp_path: Path) -> None:
    async def scenario() -> None:
        job = _job("slow", "import time; time.sleep(5)", timeout=0.1)
        executor = JobExecutor((job,), _policy(tmp_path))

        execution = await executor.start(job.id)
        execution = await executor.wait(execution.execution_id)

        assert execution.status is JobState.TIMED_OUT
        assert "timeout" in (execution.error or "")

    asyncio.run(scenario())


def test_service_ignores_command_timeout_and_stops_on_shutdown(tmp_path: Path) -> None:
    async def scenario() -> None:
        service = replace(
            _job("frontend", "import time; time.sleep(30)", timeout=0.05),
            service=True,
        )
        executor = JobExecutor((service,), _policy(tmp_path))

        execution = await executor.start(service.id)
        await asyncio.sleep(0.2)

        assert execution.status is JobState.RUNNING
        await executor.shutdown()
        execution = await asyncio.wait_for(executor.wait(execution.execution_id), timeout=15)
        assert execution.status is JobState.CANCELLED

    asyncio.run(scenario())


def test_drain_splits_output_that_exceeds_stream_reader_line_limit(tmp_path: Path) -> None:
    async def scenario() -> None:
        executor = JobExecutor((), _policy(tmp_path))
        execution = JobExecution(execution_id="long-output", job_id="test", job_name="test")
        reader = asyncio.StreamReader(limit=64)
        payload = b"x" * 150_000
        reader.feed_data(payload)
        reader.feed_eof()

        await executor._drain(reader, execution, "stdout")

        assert b"".join(line.text.encode() for line in execution.output) == payload
        assert all(len(line.text.encode()) <= 64 * 1024 for line in execution.output)

    asyncio.run(scenario())


def test_timeout_terminates_children_that_inherit_output_pipes(tmp_path: Path) -> None:
    async def scenario() -> None:
        code = (
            "import subprocess, sys, time; "
            "subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)']); "
            "time.sleep(30)"
        )
        job = _job("process-tree", code, timeout=0.1)
        executor = JobExecutor((job,), _policy(tmp_path))

        execution = await executor.start(job.id)
        execution = await asyncio.wait_for(executor.wait(execution.execution_id), timeout=15)

        assert execution.status is JobState.TIMED_OUT

    asyncio.run(scenario())


def test_duplicate_job_is_prevented(tmp_path: Path) -> None:
    async def scenario() -> None:
        job = _job("one-at-a-time", "import time; time.sleep(5)", timeout=10)
        executor = JobExecutor((job,), _policy(tmp_path))
        execution = await executor.start(job.id)

        with pytest.raises(DuplicateJobError):
            await executor.start(job.id)

        assert await executor.cancel(job.id)
        execution = await executor.wait(execution.execution_id)
        assert execution.status is JobState.CANCELLED

    asyncio.run(scenario())
