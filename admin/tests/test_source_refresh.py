from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from zipfile import ZipFile

import pytest

from forever_admin import source_refresh
from forever_admin.source_refresh import (
    PROJECTS,
    SourceRelease,
    SourceRefreshError,
    describe_current_versions,
    describe_version_changes,
    resolve_wow_client_root,
    safe_extract,
    select_latest_release,
    without_client_enrichment,
)


def _release(project_index: int, file_id: int, version: str) -> SourceRelease:
    project = PROJECTS[project_index]
    return SourceRelease(
        projectId=project.project_id,
        fileId=file_id,
        version=version,
        displayName=f"release-{version}",
        fileName=f"release-{version}.zip",
        pageUrl=f"https://example.test/{file_id}",
    )


def test_select_latest_release_uses_newest_stable_compatible_archive() -> None:
    payload = {
        "data": [
            {
                "id": 30,
                "releaseType": 2,
                "gameVersions": ["1.15.9", "1.60.1"],
                "fileName": "ProfessionDB-beta.zip",
                "displayName": "ProfessionDB-v2.0.0",
                "dateCreated": "2026-10-20T00:00:00Z",
            },
            {
                "id": 20,
                "releaseType": 1,
                "gameVersions": ["1.60.1"],
                "fileName": "ProfessionDB-newer.zip",
                "displayName": "ProfessionDB-v1.10.0",
                "dateCreated": "2026-10-19T00:00:00Z",
            },
            {
                "id": 10,
                "releaseType": 1,
                "gameVersions": ["1.15.9", "1.60.1"],
                "fileName": "ProfessionDB-current.zip",
                "displayName": "ProfessionDB-v1.9.1",
                "dateCreated": "2026-10-18T00:00:00Z",
            },
        ]
    }

    release = select_latest_release(PROJECTS[0], payload)

    assert release.fileId == 10
    assert release.version == "v1.9.1"
    assert release.pageUrl.endswith("/files/10")


def test_version_change_summary_reports_only_changed_source_files() -> None:
    current = {
        "professionDb": {"fileId": 10, "version": "v1.9.1"},
        "itemDb": {"fileId": 20, "version": "v1.4.1"},
    }
    releases = {
        "professionDb": _release(0, 10, "v1.9.1"),
        "itemDb": _release(1, 30, "v1.6.0"),
    }

    assert describe_version_changes(current, releases) == (
        "LibItemDB v1.4.1 -> v1.6.0",
    )
    assert describe_current_versions(releases) == (
        "LibProfessionDB v1.9.1; LibItemDB v1.6.0"
    )


def test_safe_extract_replaces_destination(tmp_path: Path) -> None:
    archive = tmp_path / "source.zip"
    destination = tmp_path / "extracted"
    destination.mkdir()
    (destination / "old.txt").write_text("old", encoding="utf-8")
    with ZipFile(archive, "w") as output:
        output.writestr("Database/Data/Forever/_core/data.lua", "new")

    safe_extract(archive, destination)

    assert not (destination / "old.txt").exists()
    assert (destination / "Database/Data/Forever/_core/data.lua").read_text() == "new"


def test_safe_extract_rejects_path_traversal(tmp_path: Path) -> None:
    archive = tmp_path / "unsafe.zip"
    with ZipFile(archive, "w") as output:
        output.writestr("../outside.txt", "unsafe")

    with pytest.raises(SourceRefreshError, match="unsafe path"):
        safe_extract(archive, tmp_path / "extracted")

    assert not (tmp_path / "outside.txt").exists()


def test_run_resolves_command_shims_before_starting(monkeypatch: pytest.MonkeyPatch) -> None:
    invocation: dict[str, object] = {}

    monkeypatch.setattr(
        source_refresh.shutil,
        "which",
        lambda executable, path=None: "C:\\nvm4w\\nodejs\\pnpm.CMD",
    )

    def fake_run(arguments: list[str], **options: object) -> SimpleNamespace:
        invocation["arguments"] = arguments
        invocation["options"] = options
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(source_refresh.subprocess, "run", fake_run)

    source_refresh._run(["pnpm", "--version"], {"PATH": "C:\\nvm4w\\nodejs"})

    assert invocation["arguments"] == ["C:\\nvm4w\\nodejs\\pnpm.CMD", "--version"]
    assert invocation["options"] == {
        "cwd": source_refresh.REPO_ROOT,
        "env": {"PATH": "C:\\nvm4w\\nodejs"},
        "check": False,
    }


def test_wow_client_root_accepts_installation_or_product_subdirectory(tmp_path: Path) -> None:
    installation = tmp_path / "World of Warcraft"
    product = installation / "_classic_beta_"
    product.mkdir(parents=True)
    (installation / ".build.info").write_text("build metadata", encoding="utf-8")

    assert resolve_wow_client_root(str(installation)) == installation.resolve()
    assert resolve_wow_client_root(str(product)) == installation.resolve()


def test_wow_client_root_requires_build_metadata(tmp_path: Path) -> None:
    product = tmp_path / "World of Warcraft" / "_classic_beta_"
    product.mkdir(parents=True)

    with pytest.raises(SourceRefreshError, match=r"containing \.build\.info"):
        resolve_wow_client_root(str(product))


def test_classic_conversion_environment_disables_client_enrichment() -> None:
    original = {
        "PATH": "C:\\tools",
        "WOW_CLIENT_ROOT": "C:\\World of Warcraft",
        "ITEM_ICON_OUTPUT_DIR": "apps/web/public/icons/items",
        "ITEM_DB_VERSION": "v1.6.0",
    }

    classic = without_client_enrichment(original)

    assert "WOW_CLIENT_ROOT" not in classic
    assert "ITEM_ICON_OUTPUT_DIR" not in classic
    assert classic["ITEM_DB_VERSION"] == "v1.6.0"
    assert original["WOW_CLIENT_ROOT"] == "C:\\World of Warcraft"
