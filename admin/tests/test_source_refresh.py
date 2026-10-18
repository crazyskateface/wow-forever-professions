from __future__ import annotations

import json
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


def test_version_replacement_is_qualified_by_source_library(tmp_path: Path) -> None:
    path = tmp_path / "README.md"
    path.write_text(
        "LibProfessionDB v1.9.1 and LibItemDB v1.4.1; unrelated v1.9.1.\n",
        encoding="utf-8",
    )
    old = {
        "professionDb": {"version": "v1.9.1"},
        "itemDb": {"version": "v1.4.1"},
    }
    releases = {
        "professionDb": _release(0, 11, "v1.10.0"),
        "itemDb": _release(1, 21, "v1.6.0"),
    }

    source_refresh._replace_versions(path, old, releases)

    assert path.read_text(encoding="utf-8") == (
        "LibProfessionDB v1.10.0 and LibItemDB v1.6.0; unrelated v1.9.1.\n"
    )


def test_publishing_replaces_complete_files_and_directories(tmp_path: Path) -> None:
    staged_file = tmp_path / "staged.json"
    published_file = tmp_path / "published.json"
    staged_file.write_text("new dataset", encoding="utf-8")
    published_file.write_text("old dataset", encoding="utf-8")
    staged_icons = tmp_path / "staged-icons"
    published_icons = tmp_path / "published-icons"
    staged_icons.mkdir()
    published_icons.mkdir()
    (staged_icons / "new.webp").write_text("new icon", encoding="utf-8")
    (published_icons / "old.webp").write_text("old icon", encoding="utf-8")

    source_refresh._publish_file(staged_file, published_file)
    source_refresh._publish_directory(staged_icons, published_icons)

    assert published_file.read_text(encoding="utf-8") == "new dataset"
    assert (published_icons / "new.webp").read_text(encoding="utf-8") == "new icon"
    assert not (published_icons / "old.webp").exists()


def test_refresh_build_mismatch_leaves_published_targets_untouched(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repo"
    imports = repo_root / "data" / "imports"
    icons = repo_root / "apps" / "web" / "public" / "icons" / "items"
    imports.mkdir(parents=True)
    icons.mkdir(parents=True)
    targets = {
        "foreverDataset": "data/imports/forever-1.60.1.69977-leatherworking.json",
        "classicDataset": "data/imports/classic-era-1.15.9.69722-leatherworking.json",
        "foreverQuality": "data/imports/forever-1.60.1.69977-leatherworking.quality.md",
        "classicQuality": "data/imports/classic-era-1.15.9.69722-leatherworking.quality.md",
        "overrides": "data/imports/forever-leatherworking-overrides.json",
        "iconDirectory": "apps/web/public/icons/items",
    }
    target_contents = {
        key: f"original {key}"
        for key in ("foreverDataset", "classicDataset", "foreverQuality", "classicQuality")
    }
    for key, contents in target_contents.items():
        path = repo_root / targets[key]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents, encoding="utf-8")
    (repo_root / targets["overrides"]).write_text("{}\n", encoding="utf-8")
    (icons / "existing.webp").write_text("original icon", encoding="utf-8")

    source_lock = imports / "source-releases.json"
    source_lock_value = {
        "schemaVersion": 1,
        "projects": {
            "professionDb": {"fileId": 10, "version": "v1.9.1"},
            "itemDb": {"fileId": 20, "version": "v1.4.1"},
        },
        "targets": targets,
    }
    original_lock = f"{json.dumps(source_lock_value, indent=2)}\n"
    source_lock.write_text(original_lock, encoding="utf-8")
    releases = {
        "professionDb": _release(0, 11, "v1.10.0"),
        "itemDb": _release(1, 21, "v1.6.0"),
    }

    monkeypatch.setattr(source_refresh, "REPO_ROOT", repo_root)
    monkeypatch.setattr(source_refresh, "SOURCE_LOCK", source_lock)
    monkeypatch.setattr(source_refresh, "CACHE_ROOT", repo_root / ".local-data" / "admin-sources")
    monkeypatch.setattr(source_refresh, "_latest_releases", lambda: releases)
    monkeypatch.setattr(
        source_refresh,
        "_download",
        lambda release: (tmp_path / f"{release.fileId}.zip", "a" * 64),
    )
    monkeypatch.setattr(source_refresh, "safe_extract", lambda archive, destination: None)
    monkeypatch.setattr(source_refresh, "_find_database_root", lambda destination, label: tmp_path)
    monkeypatch.setattr(source_refresh, "resolve_wow_client_root", lambda value: tmp_path)
    notices_updated = False

    def update_notices(*_: object) -> None:
        nonlocal notices_updated
        notices_updated = True

    monkeypatch.setattr(source_refresh, "_update_notices", update_notices)
    monkeypatch.setenv("WOW_CLIENT_ROOT", str(tmp_path))

    def fake_run(arguments: list[str], _: dict[str, str]) -> int:
        if arguments[1] == "data:convert:professiondb":
            output = Path(arguments[4])
            output.parent.mkdir(parents=True, exist_ok=True)
            build = "9.9.9" if arguments[5] == "Forever" else "1.15.9.69722"
            output.write_text(json.dumps({"build": {"id": build}}), encoding="utf-8")
            if arguments[5] == "Forever":
                icon_output = Path(arguments[9])
                icon_output.mkdir(parents=True)
                (icon_output / "new.webp").write_text("new icon", encoding="utf-8")
        else:
            report = Path(arguments[3])
            report.write_text("new quality", encoding="utf-8")
        return 0

    monkeypatch.setattr(source_refresh, "_run", fake_run)

    with pytest.raises(SourceRefreshError, match="immutable snapshot path"):
        source_refresh.refresh_sources(force=True)

    for key, contents in target_contents.items():
        assert (repo_root / targets[key]).read_text(encoding="utf-8") == contents
    assert (icons / "existing.webp").read_text(encoding="utf-8") == "original icon"
    assert not (icons / "new.webp").exists()
    assert source_lock.read_text(encoding="utf-8") == original_lock
    assert not notices_updated
