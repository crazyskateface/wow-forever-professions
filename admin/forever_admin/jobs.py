from __future__ import annotations

import asyncio
import os
import re
import shutil
import signal
import subprocess
import uuid
from datetime import datetime
from pathlib import Path

from forever_admin.models import JobDefinition, JobExecution, JobOutputLine, JobState


class JobValidationError(ValueError):
    pass


class DuplicateJobError(RuntimeError):
    pass


class JobNotRunnableError(RuntimeError):
    pass


_SENSITIVE_NAME = re.compile(r"(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|CREDENTIAL)", re.I)
_SENSITIVE_ASSIGNMENT = re.compile(
    r"(?i)\b(password|passwd|token|secret|api[_-]?key|access[_-]?key)"
    r"(\s*[:=]\s*)([^\s,;]+)"
)
_AWS_ACCESS_KEY = re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")
_BEARER_TOKEN = re.compile(r"(?i)\bBearer\s+[^\s,;]+")
_OUTPUT_READ_BYTES = 16 * 1024
_OUTPUT_RECORD_BYTES = 64 * 1024
_DRAIN_TIMEOUT_SECONDS = 10


class SecretRedactor:
    def __init__(self, values: tuple[str, ...]) -> None:
        self._values = tuple(sorted({value for value in values if len(value) >= 4}, key=len, reverse=True))

    @classmethod
    def from_environment(cls, explicit_names: tuple[str, ...] = ()) -> SecretRedactor:
        names = {name for name in os.environ if _SENSITIVE_NAME.search(name)}
        names.update(explicit_names)
        return cls(tuple(os.environ[name] for name in names if os.environ.get(name)))

    def redact(self, value: str) -> str:
        result = value
        for secret in self._values:
            result = result.replace(secret, "[REDACTED]")
        result = _SENSITIVE_ASSIGNMENT.sub(
            lambda match: f"{match.group(1)}{match.group(2)}[REDACTED]",
            result,
        )
        result = _AWS_ACCESS_KEY.sub("[REDACTED]", result)
        result = _BEARER_TOKEN.sub("Bearer [REDACTED]", result)
        return result


class CommandPolicy:
    def __init__(self, repo_root: Path, allowed_executables: tuple[str, ...]) -> None:
        self.repo_root = repo_root.resolve()
        self.allowed_names = {
            value.casefold()
            for value in allowed_executables
            if Path(value).name == value
        }
        self.allowed_paths = {
            self._normalize_explicit_path(value)
            for value in allowed_executables
            if Path(value).name != value
        }

    def _normalize_explicit_path(self, value: str) -> str:
        path = Path(value)
        if not path.is_absolute():
            path = self.repo_root / path
        return os.path.normcase(os.path.abspath(path))

    def validate_job(self, job: JobDefinition) -> Path:
        if not job.commands:
            raise JobValidationError("A job must contain at least one command.")
        working_directory = (self.repo_root / job.working_directory).resolve()
        if not working_directory.is_relative_to(self.repo_root):
            raise JobValidationError("Job working directory must stay inside the repository.")
        if not working_directory.is_dir():
            raise JobValidationError(f"Job working directory does not exist: {working_directory}")
        for command in job.commands:
            self.validate_command(command)
        if job.timeout_seconds <= 0:
            raise JobValidationError("Job timeout must be greater than zero.")
        return working_directory

    def validate_command(self, command: tuple[str, ...]) -> None:
        if not command:
            raise JobValidationError("Commands cannot be empty.")
        executable = command[0]
        executable_path = Path(executable)
        if executable_path.name == executable:
            if executable.casefold() not in self.allowed_names:
                raise JobValidationError(f"Executable is not allowlisted: {executable_path.name}")
        elif self._normalize_explicit_path(executable) not in self.allowed_paths:
            raise JobValidationError("Executable paths must be explicitly allowlisted.")
        for argument in command:
            if not argument or "\x00" in argument or "\n" in argument or "\r" in argument:
                raise JobValidationError("Command arguments must be non-empty single-line strings.")
            if len(argument) > 4096:
                raise JobValidationError("Command argument exceeds 4096 characters.")

    def resolve_command(self, command: tuple[str, ...]) -> tuple[str, ...]:
        self.validate_command(command)
        executable = command[0]
        if Path(executable).name != executable:
            resolved = os.path.abspath(
                Path(executable) if Path(executable).is_absolute() else self.repo_root / executable
            )
        else:
            located = shutil.which(executable)
            if located is None:
                raise JobValidationError(f"Executable was not found on PATH: {executable}")
            resolved = located
        return (resolved, *command[1:])


class JobExecutor:
    def __init__(
        self,
        definitions: tuple[JobDefinition, ...],
        policy: CommandPolicy,
        redactor: SecretRedactor | None = None,
        max_output_lines: int = 5_000,
    ) -> None:
        self.definitions = {definition.id: definition for definition in definitions}
        self.policy = policy
        self.redactor = redactor or SecretRedactor.from_environment()
        self.max_output_lines = max_output_lines
        self.history: list[JobExecution] = []
        self._active: dict[str, JobExecution] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._processes: dict[str, asyncio.subprocess.Process] = {}
        self._lock = asyncio.Lock()

    def missing_environment(self, job: JobDefinition) -> tuple[str, ...]:
        return tuple(name for name in job.required_environment if not os.getenv(name, "").strip())

    async def start(self, job_id: str) -> JobExecution:
        job = self.definitions.get(job_id)
        if job is None:
            raise JobNotRunnableError(f"Unknown job: {job_id}")
        missing = self.missing_environment(job)
        if missing:
            raise JobNotRunnableError(f"Missing required environment: {', '.join(missing)}")
        self.policy.validate_job(job)
        async with self._lock:
            if job_id in self._active:
                raise DuplicateJobError(f"{job.name} is already running.")
            execution = JobExecution(
                execution_id=uuid.uuid4().hex,
                job_id=job.id,
                job_name=job.name,
                status=JobState.RUNNING,
                started_at=datetime.now().astimezone(),
                step_count=len(job.commands),
            )
            self._active[job_id] = execution
            self.history.insert(0, execution)
            self.history = self.history[:50]
            self._tasks[execution.execution_id] = asyncio.create_task(self._run(job, execution))
            return execution

    async def wait(self, execution_id: str) -> JobExecution:
        task = self._tasks.get(execution_id)
        if task is not None:
            await task
        for execution in self.history:
            if execution.execution_id == execution_id:
                return execution
        raise KeyError(execution_id)

    async def cancel(self, job_id: str) -> bool:
        execution = self._active.get(job_id)
        if execution is None:
            return False
        execution.cancel_requested = True
        process = self._processes.get(execution.execution_id)
        if process is not None and process.returncode is None:
            await self._terminate(process)
        return True

    def latest(self, job_id: str) -> JobExecution | None:
        return next((execution for execution in self.history if execution.job_id == job_id), None)

    def _append(self, execution: JobExecution, stream: str, text: str) -> None:
        execution.output.append(
            JobOutputLine(
                timestamp=datetime.now().astimezone(),
                stream=stream,
                text=self.redactor.redact(text.rstrip()),
            )
        )
        if len(execution.output) > self.max_output_lines:
            del execution.output[: len(execution.output) - self.max_output_lines]

    async def _drain(
        self,
        reader: asyncio.StreamReader | None,
        execution: JobExecution,
        stream: str,
    ) -> None:
        if reader is None:
            return
        pending = bytearray()
        while chunk := await reader.read(_OUTPUT_READ_BYTES):
            pending.extend(chunk)
            while pending:
                newline = pending.find(b"\n")
                if 0 <= newline < _OUTPUT_RECORD_BYTES:
                    record_length = newline + 1
                elif len(pending) >= _OUTPUT_RECORD_BYTES:
                    record_length = _OUTPUT_RECORD_BYTES
                else:
                    break
                record = bytes(pending[:record_length])
                del pending[:record_length]
                self._append(execution, stream, record.decode("utf-8", errors="replace"))
        if pending:
            self._append(execution, stream, pending.decode("utf-8", errors="replace"))

    async def _finish_drains(self, drains: tuple[asyncio.Task[None], ...]) -> None:
        _, pending = await asyncio.wait(drains, timeout=_DRAIN_TIMEOUT_SECONDS)
        for task in pending:
            task.cancel()
        await asyncio.gather(*drains, return_exceptions=True)

    async def _run(self, job: JobDefinition, execution: JobExecution) -> None:
        working_directory = self.policy.validate_job(job)
        deadline = asyncio.get_running_loop().time() + job.timeout_seconds
        try:
            for index, raw_command in enumerate(job.commands, start=1):
                if execution.cancel_requested:
                    execution.status = JobState.CANCELLED
                    self._append(execution, "system", "Job cancelled.")
                    break
                execution.current_step = index
                command = self.policy.resolve_command(raw_command)
                safe_command = " ".join(self.redactor.redact(part) for part in raw_command)
                self._append(execution, "system", f"Step {index}/{len(job.commands)}: {safe_command}")
                creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
                process = await asyncio.create_subprocess_exec(
                    *command,
                    cwd=working_directory,
                    env={**os.environ, **job.environment},
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    creationflags=creation_flags,
                    start_new_session=os.name != "nt",
                )
                self._processes[execution.execution_id] = process
                drains = (
                    asyncio.create_task(self._drain(process.stdout, execution, "stdout")),
                    asyncio.create_task(self._drain(process.stderr, execution, "stderr")),
                )
                remaining = deadline - asyncio.get_running_loop().time()
                try:
                    if remaining <= 0:
                        raise TimeoutError
                    execution.exit_code = await asyncio.wait_for(process.wait(), timeout=remaining)
                except TimeoutError:
                    await self._terminate(process)
                    execution.status = JobState.TIMED_OUT
                    execution.error = f"Job exceeded its {job.timeout_seconds:g} second timeout."
                    self._append(execution, "system", execution.error)
                    break
                finally:
                    await self._finish_drains(drains)
                    self._processes.pop(execution.execution_id, None)

                if execution.cancel_requested:
                    execution.status = JobState.CANCELLED
                    self._append(execution, "system", "Job cancelled.")
                    break
                if execution.exit_code != 0:
                    execution.status = JobState.FAILED
                    execution.error = f"Step {index} exited with code {execution.exit_code}."
                    self._append(execution, "system", execution.error)
                    break
            else:
                execution.status = JobState.SUCCEEDED
                self._append(execution, "system", "Job completed successfully.")
        except Exception as error:
            execution.status = JobState.CANCELLED if execution.cancel_requested else JobState.FAILED
            execution.error = self.redactor.redact(str(error))
            self._append(execution, "system", f"Job failed to start: {execution.error}")
        finally:
            execution.finished_at = datetime.now().astimezone()
            async with self._lock:
                self._active.pop(job.id, None)

    async def _terminate(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        try:
            if os.name == "nt":
                process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                os.killpg(process.pid, signal.SIGTERM)
            await asyncio.wait_for(process.wait(), timeout=5)
        except (ProcessLookupError, TimeoutError):
            if process.returncode is None:
                if os.name == "nt":
                    taskkill = shutil.which("taskkill.exe") or shutil.which("taskkill")
                    if taskkill is not None:
                        killer = await asyncio.create_subprocess_exec(
                            taskkill,
                            "/PID",
                            str(process.pid),
                            "/T",
                            "/F",
                            stdout=asyncio.subprocess.DEVNULL,
                            stderr=asyncio.subprocess.DEVNULL,
                        )
                        await killer.wait()
                    if process.returncode is None:
                        process.kill()
                else:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                if process.returncode is None:
                    await asyncio.wait_for(process.wait(), timeout=5)
