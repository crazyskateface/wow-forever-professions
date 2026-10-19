from __future__ import annotations

import os
import re
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from forever_admin.models import HealthTarget, JobDefinition


_ENV_REFERENCE = re.compile(r"\$\{([A-Z][A-Z0-9_]*)\}")
_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")


@dataclass(frozen=True)
class AppSettings:
    name: str
    host: str
    port: int
    auto_refresh_seconds: float
    repo_root: Path
    show_browser: bool


@dataclass(frozen=True)
class AwsEnvironment:
    stage: str
    label: str
    application_stack: str
    data_stack: str


@dataclass(frozen=True)
class AwsSettings:
    enabled: bool
    profile: str | None
    region: str
    lookback_hours: int
    environments: tuple[AwsEnvironment, ...]


@dataclass(frozen=True)
class LocalLogSource:
    id: str
    name: str
    path: Path


@dataclass(frozen=True)
class SecuritySettings:
    allowed_executables: tuple[str, ...]
    redact_environment: tuple[str, ...]


@dataclass(frozen=True)
class DashboardConfig:
    app: AppSettings
    aws: AwsSettings
    health_targets: tuple[HealthTarget, ...]
    local_log_sources: tuple[LocalLogSource, ...]
    jobs: tuple[JobDefinition, ...]
    security: SecuritySettings
    source_path: Path


class ConfigurationError(ValueError):
    pass


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _load_environment(repo_root: Path) -> None:
    requested = os.getenv("ADMIN_ENV_FILE")
    env_path = Path(requested).expanduser() if requested else repo_root / ".env.admin"
    if env_path.exists():
        load_dotenv(env_path, override=False)


def _expand(value: str) -> tuple[str, set[str]]:
    missing: set[str] = set()

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        resolved = os.getenv(name)
        if resolved is None or not resolved.strip():
            missing.add(name)
            return match.group(0)
        return resolved

    return _ENV_REFERENCE.sub(replace, value), missing


def _table(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ConfigurationError(f"{name} must be a TOML table.")
    return value


def _string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConfigurationError(f"{name} must be a non-empty string.")
    return value.strip()


def _identifier(value: Any, name: str) -> str:
    identifier = _string(value, name)
    if not _ID_PATTERN.fullmatch(identifier):
        raise ConfigurationError(f"{name} must use lowercase letters, digits, and hyphens.")
    return identifier


def _repo_path(repo_root: Path, value: Any, name: str) -> Path:
    candidate = Path(_string(value, name))
    resolved = (repo_root / candidate).resolve() if not candidate.is_absolute() else candidate.resolve()
    if not resolved.is_relative_to(repo_root):
        raise ConfigurationError(f"{name} must stay inside the repository.")
    return resolved


def _environment_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ConfigurationError(f"{name} must be true or false.")


def load_config(path: Path | None = None) -> DashboardConfig:
    repo_root = _repo_root()
    os.environ.setdefault("ADMIN_PYTHON", os.path.abspath(sys.executable))
    _load_environment(repo_root)
    requested = path or Path(os.getenv("ADMIN_CONFIG", repo_root / "admin" / "config.toml"))
    source_path = requested.expanduser().resolve()
    if not source_path.is_file():
        raise ConfigurationError(f"Admin configuration does not exist: {source_path}")

    with source_path.open("rb") as handle:
        raw = tomllib.load(handle)

    app_raw = _table(raw.get("app", {}), "app")
    host = os.getenv("ADMIN_HOST", str(app_raw.get("host", "127.0.0.1"))).strip()
    if host != "127.0.0.1":
        raise ConfigurationError("The admin dashboard must bind to 127.0.0.1.")
    port = int(os.getenv("ADMIN_PORT", str(app_raw.get("port", 8088))))
    if not 1 <= port <= 65535:
        raise ConfigurationError("app.port must be between 1 and 65535.")
    app = AppSettings(
        name=_string(app_raw.get("name", "Forever Professions Admin"), "app.name"),
        host=host,
        port=port,
        auto_refresh_seconds=float(app_raw.get("auto_refresh_seconds", 30)),
        repo_root=repo_root,
        show_browser=_environment_bool("ADMIN_SHOW_BROWSER", True),
    )

    aws_raw = _table(raw.get("aws", {}), "aws")
    environments: list[AwsEnvironment] = []
    for index, item in enumerate(aws_raw.get("environments", [])):
        environment = _table(item, f"aws.environments[{index}]")
        environments.append(
            AwsEnvironment(
                stage=_identifier(environment.get("stage"), f"aws.environments[{index}].stage"),
                label=_string(environment.get("label"), f"aws.environments[{index}].label"),
                application_stack=_string(
                    environment.get("application_stack"),
                    f"aws.environments[{index}].application_stack",
                ),
                data_stack=_string(
                    environment.get("data_stack"),
                    f"aws.environments[{index}].data_stack",
                ),
            )
        )
    profile = os.getenv("ADMIN_AWS_PROFILE") or aws_raw.get("profile") or None
    aws = AwsSettings(
        enabled=bool(aws_raw.get("enabled", True)),
        profile=str(profile).strip() if profile else None,
        region=os.getenv("ADMIN_AWS_REGION", str(aws_raw.get("region", "us-east-1"))).strip(),
        lookback_hours=int(aws_raw.get("lookback_hours", 24)),
        environments=tuple(environments),
    )

    health_targets: list[HealthTarget] = []
    for index, item in enumerate(raw.get("health", [])):
        target = _table(item, f"health[{index}]")
        health_targets.append(
            HealthTarget(
                id=_identifier(target.get("id"), f"health[{index}].id"),
                name=_string(target.get("name"), f"health[{index}].name"),
                url=_string(target.get("url"), f"health[{index}].url"),
                expected_status=str(target["expected_status"]) if target.get("expected_status") else None,
                timeout_seconds=float(target.get("timeout_seconds", 5)),
                environment=str(target.get("environment", "local")),
            )
        )

    local_logs: list[LocalLogSource] = []
    for index, item in enumerate(raw.get("local_logs", [])):
        source = _table(item, f"local_logs[{index}]")
        local_logs.append(
            LocalLogSource(
                id=_identifier(source.get("id"), f"local_logs[{index}].id"),
                name=_string(source.get("name"), f"local_logs[{index}].name"),
                path=_repo_path(repo_root, source.get("path"), f"local_logs[{index}].path"),
            )
        )

    jobs: list[JobDefinition] = []
    seen_job_ids: set[str] = set()
    for index, item in enumerate(raw.get("jobs", [])):
        job = _table(item, f"jobs[{index}]")
        job_id = _identifier(job.get("id"), f"jobs[{index}].id")
        if job_id in seen_job_ids:
            raise ConfigurationError(f"Duplicate job id: {job_id}")
        seen_job_ids.add(job_id)
        commands_raw = job.get("commands")
        if not isinstance(commands_raw, list) or not commands_raw:
            raise ConfigurationError(f"jobs[{index}].commands must contain at least one command.")
        commands: list[tuple[str, ...]] = []
        missing: set[str] = set()
        for command_index, command_raw in enumerate(commands_raw):
            if not isinstance(command_raw, list) or not command_raw:
                raise ConfigurationError(
                    f"jobs[{index}].commands[{command_index}] must be a non-empty string array."
                )
            command: list[str] = []
            for argument in command_raw:
                expanded, absent = _expand(_string(argument, "job command argument"))
                command.append(expanded)
                missing.update(absent)
            commands.append(tuple(command))
        required = {_string(value, "required environment name") for value in job.get("required_environment", [])}
        required.update(missing)
        service = job.get("service", False)
        if not isinstance(service, bool):
            raise ConfigurationError(f"jobs[{index}].service must be true or false.")
        service_url = (
            _string(job["service_url"], f"jobs[{index}].service_url")
            if job.get("service_url")
            else None
        )
        if service_url is not None and not service:
            raise ConfigurationError(f"jobs[{index}].service_url requires service = true.")
        service_link_label = (
            _string(job["service_link_label"], f"jobs[{index}].service_link_label")
            if job.get("service_link_label")
            else None
        )
        if service_link_label is not None and service_url is None:
            raise ConfigurationError(
                f"jobs[{index}].service_link_label requires service_url."
            )
        job_environment: dict[str, str] = {}
        for name, value in _table(job.get("environment", {}), f"jobs[{index}].environment").items():
            environment_name = _string(name, "job environment name")
            if not re.fullmatch(r"[A-Z][A-Z0-9_]*", environment_name):
                raise ConfigurationError(f"Invalid job environment name: {environment_name}")
            expanded, absent = _expand(_string(value, f"jobs[{index}].environment.{environment_name}"))
            job_environment[environment_name] = expanded
            required.update(absent)
        jobs.append(
            JobDefinition(
                id=job_id,
                name=_string(job.get("name"), f"jobs[{index}].name"),
                description=_string(job.get("description"), f"jobs[{index}].description"),
                commands=tuple(commands),
                working_directory=str(job.get("working_directory", ".")),
                timeout_seconds=float(job.get("timeout_seconds", 900)),
                category=str(job.get("category", "Maintenance")),
                confirmation=str(job["confirmation"]).strip() if job.get("confirmation") else None,
                required_environment=tuple(sorted(required)),
                environment=job_environment,
                service=service,
                service_url=service_url,
                service_link_label=service_link_label,
            )
        )

    security_raw = _table(raw.get("security", {}), "security")
    allowed_items: list[str] = []
    for item in security_raw.get("allowed_executables", ["pnpm", "pnpm.cmd"]):
        expanded, missing = _expand(_string(item, "allowed executable"))
        if missing:
            raise ConfigurationError(
                f"Allowed executable references missing environment variables: {', '.join(sorted(missing))}"
            )
        allowed_items.append(expanded)
    allowed = tuple(allowed_items)
    redacted = tuple(_string(item, "redacted environment name") for item in security_raw.get("redact_environment", []))

    return DashboardConfig(
        app=app,
        aws=aws,
        health_targets=tuple(health_targets),
        local_log_sources=tuple(local_logs),
        jobs=tuple(jobs),
        security=SecuritySettings(allowed_executables=allowed, redact_environment=redacted),
        source_path=source_path,
    )
