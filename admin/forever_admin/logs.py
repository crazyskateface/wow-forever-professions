from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from forever_admin.models import LogEntry, LogFetchResult


_LINE_PATTERN = re.compile(
    r"^(?:(?P<timestamp>\d{4}-\d{2}-\d{2}[T ][^ ]+)\s+)?"
    r"(?:\[(?P<bracket_level>[A-Za-z]+)\]|(?P<level>DEBUG|INFO|WARN(?:ING)?|ERROR|CRITICAL))?\s*"
    r"(?P<message>.*)$",
    re.IGNORECASE,
)
_ERROR_FIELDS = (
    "error",
    "errorMessage",
    "integrationError",
    "integrationErrorMessage",
    "exception",
)
_EMPTY_ERROR_VALUES = {"", "-", "none", "null"}


def normalize_level(value: str | None, message: str = "") -> str:
    if value:
        normalized = value.upper()
        if normalized == "WARNING":
            return "WARN"
        if normalized in {"DEBUG", "INFO", "WARN", "ERROR", "CRITICAL"}:
            return normalized
    lowered = message.lower()
    if "critical" in lowered or "fatal" in lowered:
        return "CRITICAL"
    if "exception" in lowered or "error" in lowered or "task timed out" in lowered:
        return "ERROR"
    if "warning" in lowered or "warn" in lowered:
        return "WARN"
    return "INFO"


def _parse_timestamp(value: object) -> datetime | None:
    if isinstance(value, (int, float)):
        seconds = float(value) / 1000 if value > 10_000_000_000 else float(value)
        return datetime.fromtimestamp(seconds).astimezone()
    if isinstance(value, str):
        candidate = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(candidate).astimezone()
        except ValueError:
            return None
    return None


def _parse_status_code(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and float(value).is_integer():
        status = int(value)
    elif isinstance(value, str) and value.strip().isdigit():
        status = int(value.strip())
    else:
        return None
    return status if 100 <= status <= 599 else None


def _meaningful_error(payload: dict[object, object]) -> str | None:
    for field in _ERROR_FIELDS:
        value = payload.get(field)
        if value is None:
            continue
        text = str(value).strip()
        if text.lower() not in _EMPTY_ERROR_VALUES:
            return text
    return None


def parse_log_message(message: str, source: str, timestamp: object = None) -> LogEntry:
    stripped = message.strip()
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        payload = None
    if isinstance(payload, dict):
        level_value = payload.get("level") or payload.get("severity") or payload.get("levelName")
        status = _parse_status_code(
            payload.get("status") or payload.get("statusCode") or payload.get("status_code")
        )
        error_message = _meaningful_error(payload)
        if level_value is None:
            if error_message is not None:
                level_value = "ERROR"
            elif status is not None:
                level_value = "ERROR" if status >= 500 else "WARN" if status >= 400 else "INFO"
        primary = payload.get("message") or error_message or stripped
        signal = str(primary) if str(primary) != stripped else ""
        return LogEntry(
            timestamp=_parse_timestamp(payload.get("timestamp") or payload.get("time") or timestamp),
            level=normalize_level(str(level_value) if level_value else None, signal),
            source=source,
            message=str(primary),
            details=json.dumps(payload, indent=2, default=str) if str(primary) != stripped else None,
        )

    match = _LINE_PATTERN.match(stripped)
    if match is None:
        return LogEntry(_parse_timestamp(timestamp), normalize_level(None, stripped), source, stripped)
    groups = match.groupdict()
    return LogEntry(
        timestamp=_parse_timestamp(groups.get("timestamp") or timestamp),
        level=normalize_level(groups.get("bracket_level") or groups.get("level"), stripped),
        source=source,
        message=groups.get("message") or stripped,
    )


class LocalLogReader:
    def __init__(self, max_read_bytes: int = 2_000_000) -> None:
        self.max_read_bytes = max_read_bytes

    def read(self, path: Path, source: str, limit: int = 100, level: str = "ALL") -> LogFetchResult:
        if not path.exists():
            return LogFetchResult(source=source, error=f"Log file does not exist: {path}")
        if not path.is_file():
            return LogFetchResult(source=source, error=f"Log source is not a file: {path}")
        try:
            with path.open("rb") as handle:
                size = handle.seek(0, 2)
                handle.seek(max(0, size - self.max_read_bytes))
                data = handle.read()
        except OSError as error:
            return LogFetchResult(source=source, error=f"Could not read log file: {error}")

        lines = data.decode("utf-8", errors="replace").splitlines()
        entries = [parse_log_message(line, source) for line in lines if line.strip()]
        if level != "ALL":
            entries = [entry for entry in entries if entry.level == level]
        return LogFetchResult(source=source, entries=tuple(entries[-limit:][::-1]))
