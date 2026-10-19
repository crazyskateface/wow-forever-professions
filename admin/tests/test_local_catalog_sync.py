from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path

import pytest

from forever_admin import local_catalog_sync


def _recording_runner(
    calls: list[tuple[tuple[str, ...], tuple[int, ...]]],
):
    def run(
        arguments: list[str],
        environment: dict[str, str],
        allowed_return_codes: tuple[int, ...] = (0,),
    ) -> int:
        del environment
        calls.append((tuple(arguments), allowed_return_codes))
        return 0

    return run


def test_current_catalog_skips_database_recreation_and_imports(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[tuple[str, ...], tuple[int, ...]]] = []
    monkeypatch.setattr(local_catalog_sync, "_run", _recording_runner(calls))
    monkeypatch.setattr(local_catalog_sync, "_catalog_is_current", lambda environment: True)

    assert local_catalog_sync.sync_local_catalog() == 0
    commands = [command for command, _ in calls]

    assert commands == [
        ("pnpm", "db:local:up"),
    ]


def test_outdated_catalog_recreates_and_imports_both_snapshots_in_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[tuple[str, ...], tuple[int, ...]]] = []
    monkeypatch.setattr(local_catalog_sync, "_run", _recording_runner(calls))
    monkeypatch.setattr(local_catalog_sync, "_catalog_is_current", lambda environment: False)

    assert local_catalog_sync.sync_local_catalog() == 0
    commands: Sequence[tuple[str, ...]] = [command for command, _ in calls]

    assert commands[:4] == [
        ("pnpm", "db:local:up"),
        ("pnpm", "db:local:reset"),
        ("pnpm", "db:local:up"),
        (
            "pnpm",
            "data:import:local",
            local_catalog_sync.CLASSIC_DATASET,
        ),
    ]
    assert commands[4][0:3] == (
        "pnpm",
        "data:import:local",
        local_catalog_sync.FOREVER_DATASET,
    )


def test_catalog_status_reads_the_status_file(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    status_path = tmp_path / "status.json"

    def write_status(
        arguments: list[str],
        environment: dict[str, str],
        allowed_return_codes: tuple[int, ...] = (0,),
    ) -> int:
        del arguments, environment, allowed_return_codes
        status_path.write_text(
            json.dumps({"current": True, "reason": "exact hashes"}),
            encoding="utf-8",
        )
        return 0

    monkeypatch.setattr(local_catalog_sync, "STATUS_PATH", status_path)
    monkeypatch.setattr(local_catalog_sync, "_run", write_status)

    assert local_catalog_sync._catalog_is_current({}) is True
