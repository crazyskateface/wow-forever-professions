from __future__ import annotations

from datetime import datetime
from pathlib import Path

from forever_admin.logs import LocalLogReader, parse_log_message


def test_reads_and_filters_local_logs(tmp_path: Path) -> None:
    path = tmp_path / "app.log"
    path.write_text(
        "2026-10-17T10:00:00+00:00 INFO started\n"
        "2026-10-17T10:01:00+00:00 ERROR database unavailable\n",
        encoding="utf-8",
    )

    result = LocalLogReader().read(path, "Local API", limit=10, level="ERROR")

    assert result.error is None
    assert len(result.entries) == 1
    assert result.entries[0].level == "ERROR"
    assert result.entries[0].message == "database unavailable"


def test_empty_log_is_distinct_from_failed_retrieval(tmp_path: Path) -> None:
    empty = tmp_path / "empty.log"
    empty.write_text("", encoding="utf-8")

    empty_result = LocalLogReader().read(empty, "Empty")
    missing_result = LocalLogReader().read(tmp_path / "missing.log", "Missing")

    assert empty_result.error is None
    assert empty_result.entries == ()
    assert missing_result.error is not None
    assert missing_result.entries == ()


def test_parses_cloudwatch_json_and_stack_details() -> None:
    entry = parse_log_message(
        '{"timestamp":"2026-10-17T10:00:00Z","level":"error","message":"Import failed","stack":"line 1\\nline 2"}',
        "AWS staging",
    )

    assert entry.level == "ERROR"
    assert entry.message == "Import failed"
    assert isinstance(entry.timestamp, datetime)
    assert entry.details is not None
    assert "line 2" in entry.details


def test_api_gateway_success_is_not_misclassified_by_integration_error_key() -> None:
    entry = parse_log_message(
        '{"requestId":"abc","status":"200","path":"/api/ready","integrationError":"-"}',
        "AWS staging access logs",
    )

    assert entry.level == "INFO"
    assert entry.message.startswith('{"requestId"')


def test_api_gateway_failure_uses_status_and_meaningful_integration_error() -> None:
    entry = parse_log_message(
        '{"status":"503","path":"/api/auction/prices",'
        '"integrationError":"The Lambda function is being throttled."}',
        "AWS staging access logs",
    )

    assert entry.level == "ERROR"
    assert entry.message == "The Lambda function is being throttled."
    assert entry.details is not None


def test_string_client_error_status_is_a_warning() -> None:
    entry = parse_log_message(
        '{"status":"404","path":"/missing","integrationError":"-"}',
        "AWS staging access logs",
    )

    assert entry.level == "WARN"


def test_structured_error_field_is_an_error_without_keyword_in_value() -> None:
    entry = parse_log_message('{"error":"database unavailable"}', "AWS staging")

    assert entry.level == "ERROR"
    assert entry.message == "database unavailable"


def test_invalid_payload_timestamp_falls_back_to_cloudwatch_event_time() -> None:
    entry = parse_log_message(
        '{"timestamp":"not-a-date","level":"ERROR","message":"failed"}',
        "AWS staging",
        1_781_694_000_000,
    )

    assert entry.timestamp is not None
    assert int(entry.timestamp.timestamp() * 1000) == 1_781_694_000_000


def test_tab_separated_plain_log_parses_timestamp_and_level() -> None:
    entry = parse_log_message(
        "2026-10-17T10:00:00Z\tERROR\tdatabase unavailable",
        "AWS staging",
    )

    assert entry.timestamp is not None
    assert entry.level == "ERROR"
    assert entry.message == "database unavailable"
