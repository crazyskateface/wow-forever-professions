from __future__ import annotations

import json
import os
import sys

from forever_admin.source_refresh import CACHE_ROOT, SourceRefreshError, _run


CLASSIC_DATASET = "data/imports/classic-era-1.15.9.69722-professions.json"
FOREVER_DATASET = "data/imports/forever-1.60.1.69977-professions.json"
STATUS_PATH = CACHE_ROOT / "local-catalog-status.json"


def _catalog_is_current(environment: dict[str, str]) -> bool:
    STATUS_PATH.unlink(missing_ok=True)
    _run(
        ["pnpm", "data:status:local", CLASSIC_DATASET, FOREVER_DATASET],
        environment,
    )
    try:
        status = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SourceRefreshError(
            f"Could not read local catalog status from {STATUS_PATH}: {error}"
        ) from error
    if not isinstance(status, dict) or not isinstance(status.get("current"), bool):
        raise SourceRefreshError(f"Invalid local catalog status in {STATUS_PATH}.")
    return bool(status["current"])


def sync_local_catalog() -> int:
    environment = os.environ.copy()
    print("Starting local PostgreSQL and checking the imported dataset hashes...", flush=True)
    _run(["pnpm", "db:local:up"], environment)
    if _catalog_is_current(environment):
        print(
            "Local catalog status: unchanged — exact Classic and Forever snapshots "
            "and their comparison are already imported.",
            flush=True,
        )
        return 0

    print(
        "Local catalog status: update required — resetting the persistent catalog volume.",
        flush=True,
    )
    _run(["pnpm", "db:local:reset"], environment)
    _run(["pnpm", "db:local:up"], environment)
    _run(["pnpm", "data:import:local", CLASSIC_DATASET], environment)
    _run(
        [
            "pnpm",
            "data:import:local",
            FOREVER_DATASET,
            "--compare-against",
            CLASSIC_DATASET,
            "--comparison-type",
            "classic-forever",
        ],
        environment,
    )
    print(
        "Local catalog status: updated — imported the exact Classic baseline, "
        "Forever snapshot, and comparison.",
        flush=True,
    )
    return 0


def main() -> int:
    try:
        return sync_local_catalog()
    except SourceRefreshError as error:
        print(f"Local catalog sync failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
