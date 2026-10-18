from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zipfile import BadZipFile, ZipFile


REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_LOCK = REPO_ROOT / "data" / "imports" / "source-releases.json"
CACHE_ROOT = REPO_ROOT / ".local-data" / "admin-sources"
USER_AGENT = "forever-professions-admin/0.1"
REQUIRED_GAME_VERSIONS = {"1.15.9", "1.60.1"}


class SourceRefreshError(RuntimeError):
    pass


@dataclass(frozen=True)
class SourceProject:
    key: str
    label: str
    project_id: int
    slug: str

    @property
    def metadata_url(self) -> str:
        return f"https://www.curseforge.com/api/v1/mods/{self.project_id}/files?pageSize=50"


@dataclass(frozen=True)
class SourceRelease:
    projectId: int
    fileId: int
    version: str
    displayName: str
    fileName: str
    pageUrl: str
    sha256: str = ""

    @property
    def download_url(self) -> str:
        return (
            f"https://www.curseforge.com/api/v1/mods/{self.projectId}/"
            f"files/{self.fileId}/download"
        )


PROJECTS = (
    SourceProject("professionDb", "LibProfessionDB", 1558781, "libprofessiondb"),
    SourceProject("itemDb", "LibItemDB", 1558208, "libitemdb"),
)


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SourceRefreshError(f"Could not read {path}: {error}") from error
    if not isinstance(value, dict):
        raise SourceRefreshError(f"Expected a JSON object in {path}.")
    return value


def _request_json(url: str) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urlopen(request, timeout=30) as response:
            value = json.load(response)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise SourceRefreshError(f"Could not retrieve source metadata from {url}: {error}") from error
    if not isinstance(value, dict):
        raise SourceRefreshError(f"Source metadata from {url} was not a JSON object.")
    return value


def select_latest_release(project: SourceProject, payload: dict[str, Any]) -> SourceRelease:
    files = payload.get("data")
    if not isinstance(files, list):
        raise SourceRefreshError(f"{project.label} metadata did not contain a file list.")
    compatible: list[dict[str, Any]] = []
    for item in files:
        if not isinstance(item, dict) or item.get("releaseType") != 1:
            continue
        game_versions = {str(value) for value in item.get("gameVersions", [])}
        if not REQUIRED_GAME_VERSIONS.issubset(game_versions):
            continue
        if not str(item.get("fileName", "")).lower().endswith(".zip"):
            continue
        compatible.append(item)
    if not compatible:
        raise SourceRefreshError(
            f"No release of {project.label} supports both Forever 1.60.1 and Classic Era 1.15.9."
        )
    compatible.sort(key=lambda item: str(item.get("dateCreated", "")), reverse=True)
    selected = compatible[0]
    display_name = str(selected.get("displayName", "")).strip()
    version_match = re.search(r"-(v[0-9][0-9A-Za-z.-]*)$", display_name)
    if version_match is None:
        raise SourceRefreshError(f"Could not determine a version from {display_name!r}.")
    try:
        file_id = int(selected["id"])
    except (KeyError, TypeError, ValueError) as error:
        raise SourceRefreshError(f"{project.label} metadata contained an invalid file ID.") from error
    return SourceRelease(
        projectId=project.project_id,
        fileId=file_id,
        version=version_match.group(1),
        displayName=display_name,
        fileName=str(selected.get("fileName", "")).strip(),
        pageUrl=f"https://www.curseforge.com/wow/addons/{project.slug}/files/{file_id}",
    )


def _latest_releases() -> dict[str, SourceRelease]:
    releases: dict[str, SourceRelease] = {}
    for project in PROJECTS:
        release = select_latest_release(project, _request_json(project.metadata_url))
        releases[project.key] = release
        print(f"Latest {project.label}: {release.displayName} (file {release.fileId})", flush=True)
    return releases


def _download(release: SourceRelease) -> tuple[Path, str]:
    downloads = CACHE_ROOT / "downloads"
    downloads.mkdir(parents=True, exist_ok=True)
    destination = downloads / f"{release.fileId}-{release.fileName}"
    if destination.is_file():
        digest = hashlib.sha256(destination.read_bytes()).hexdigest()
        print(f"Using cached {release.displayName}: {destination}", flush=True)
        return destination, digest
    partial = destination.with_suffix(destination.suffix + ".part")
    request = Request(release.download_url, headers={"User-Agent": USER_AGENT})
    digest = hashlib.sha256()
    print(f"Downloading {release.displayName}...", flush=True)
    try:
        with urlopen(request, timeout=120) as response, partial.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                digest.update(chunk)
    except (HTTPError, URLError, TimeoutError, OSError) as error:
        partial.unlink(missing_ok=True)
        raise SourceRefreshError(f"Could not download {release.displayName}: {error}") from error
    partial.replace(destination)
    return destination, digest.hexdigest()


def safe_extract(archive: Path, destination: Path) -> None:
    resolved_destination = destination.resolve()
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    try:
        with ZipFile(archive) as source:
            for member in source.infolist():
                target = (destination / member.filename).resolve()
                if not target.is_relative_to(resolved_destination):
                    raise SourceRefreshError(
                        f"Archive {archive.name} contains an unsafe path: {member.filename}"
                    )
            source.extractall(destination)
    except (BadZipFile, OSError) as error:
        raise SourceRefreshError(f"Could not extract {archive}: {error}") from error


def _find_database_root(destination: Path, label: str) -> Path:
    candidates = sorted(
        data.parent
        for data in destination.rglob("Data")
        if (data / "Forever" / "_core").is_dir() and (data / "Vanilla" / "_core").is_dir()
    )
    if len(candidates) != 1:
        raise SourceRefreshError(
            f"Expected one {label} root containing Forever and Vanilla data; found {len(candidates)}."
        )
    return candidates[0]


def resolve_wow_client_root(value: str) -> Path:
    candidate = Path(value).expanduser().resolve()
    for root in (candidate, candidate.parent):
        if (root / ".build.info").is_file():
            if root != candidate:
                print(
                    f"Using WoW installation root {root} instead of product subdirectory {candidate}.",
                    flush=True,
                )
            return root
    raise SourceRefreshError(
        f"WOW_CLIENT_ROOT must point to the WoW installation folder containing .build.info; "
        f"none was found at {candidate} or {candidate.parent}."
    )


def _run(arguments: list[str], environment: dict[str, str]) -> None:
    print(f"Running: {' '.join(arguments)}", flush=True)
    executable = shutil.which(arguments[0], path=environment.get("PATH"))
    if executable is None:
        raise SourceRefreshError(
            f"Could not find {arguments[0]} on PATH. Install the repository-pinned tool "
            "and restart the admin panel."
        )
    resolved_arguments = [executable, *arguments[1:]]
    try:
        result = subprocess.run(resolved_arguments, cwd=REPO_ROOT, env=environment, check=False)
    except OSError as error:
        raise SourceRefreshError(f"Could not start {executable}: {error}") from error
    if result.returncode != 0:
        raise SourceRefreshError(
            f"Command failed with exit code {result.returncode}: {' '.join(arguments)}"
        )


def without_client_enrichment(environment: dict[str, str]) -> dict[str, str]:
    result = environment.copy()
    result.pop("WOW_CLIENT_ROOT", None)
    result.pop("ITEM_ICON_OUTPUT_DIR", None)
    return result


def _replace_versions(path: Path, old: dict[str, Any], new: dict[str, SourceRelease]) -> None:
    contents = path.read_text(encoding="utf-8")
    for key in ("professionDb", "itemDb"):
        old_version = str(old[key]["version"])
        contents = contents.replace(old_version, new[key].version)
    path.write_text(contents, encoding="utf-8")


def _update_notices(
    old: dict[str, Any],
    releases: dict[str, SourceRelease],
    builds: dict[str, str],
) -> None:
    path = REPO_ROOT / "data" / "imports" / "THIRD_PARTY_NOTICES.md"
    contents = path.read_text(encoding="utf-8")
    profession = releases["professionDb"]
    item = releases["itemDb"]
    replacements = {
        r"^- LibProfessionDB .* Forever client build .*$": (
            f"- LibProfessionDB {profession.version}, Forever client build {builds['forever']}: "
            f"<{profession.pageUrl}>"
        ),
        r"^- LibProfessionDB .* Vanilla client build .*$": (
            f"- LibProfessionDB {profession.version}, Vanilla client build {builds['classic']} "
            f"(Classic Era baseline): <{profession.pageUrl}>"
        ),
        r"^- LibItemDB .* Forever English item names.*$": (
            f"- LibItemDB {item.version}, Forever English item names and item classifications: "
            f"<{item.pageUrl}>"
        ),
        r"^- LibItemDB .* Vanilla English item names.*$": (
            f"- LibItemDB {item.version}, Vanilla English item names and item classifications: "
            f"<{item.pageUrl}>"
        ),
        r"^- `ProfessionDB-.*\.zip`: `[0-9a-f]{64}`$": (
            f"- `{profession.fileName}`: `{profession.sha256}`"
        ),
        r"^- `ItemDB-.*\.zip`: `[0-9a-f]{64}`$": (
            f"- `{item.fileName}`: `{item.sha256}`"
        ),
    }
    for pattern, replacement in replacements.items():
        contents, count = re.subn(pattern, replacement, contents, count=1, flags=re.MULTILINE)
        if count != 1:
            raise SourceRefreshError(f"Could not update the notice line matching {pattern!r}.")
    path.write_text(contents, encoding="utf-8")
    _replace_versions(REPO_ROOT / "data" / "imports" / "README.md", old, releases)
    _replace_versions(REPO_ROOT / "README.md", old, releases)


def _build_id(path: Path) -> str:
    dataset = _read_json(path)
    build = dataset.get("build")
    if not isinstance(build, dict) or not isinstance(build.get("id"), str):
        raise SourceRefreshError(f"Generated dataset has no build ID: {path}")
    return str(build["id"])


def refresh_sources(force: bool = False) -> int:
    source_lock = _read_json(SOURCE_LOCK)
    current = source_lock.get("projects")
    targets = source_lock.get("targets")
    if not isinstance(current, dict) or not isinstance(targets, dict):
        raise SourceRefreshError(f"Invalid source release configuration in {SOURCE_LOCK}.")
    releases = _latest_releases()
    changed = [
        key
        for key, release in releases.items()
        if int(current.get(key, {}).get("fileId", 0)) != release.fileId
    ]
    if not changed and not force:
        print("Source snapshots are already pinned to the latest compatible releases; nothing changed.")
        return 0
    print(f"Updating source releases: {', '.join(changed) if changed else 'forced refresh'}", flush=True)
    roots: dict[str, Path] = {}
    completed: dict[str, SourceRelease] = {}
    for project in PROJECTS:
        release = releases[project.key]
        archive, digest = _download(release)
        release = SourceRelease(**{**asdict(release), "sha256": digest})
        completed[project.key] = release
        destination = CACHE_ROOT / "extracted" / f"{project.key}-{release.fileId}"
        safe_extract(archive, destination)
        roots[project.key] = _find_database_root(destination, project.label)

    configured_wow_client_root = os.getenv("WOW_CLIENT_ROOT", "").strip()
    if not configured_wow_client_root:
        raise SourceRefreshError(
            "WOW_CLIENT_ROOT is required for client metadata and icon enrichment. Set it once in .env.admin."
        )
    wow_client_root = str(resolve_wow_client_root(configured_wow_client_root))
    environment = os.environ.copy()
    environment.update(
        {
            "PROFESSION_DB_VERSION": completed["professionDb"].version,
            "ITEM_DB_VERSION": completed["itemDb"].version,
            "PROFESSION_DB_SOURCE_URL": completed["professionDb"].pageUrl,
        }
    )
    forever = str(targets["foreverDataset"])
    classic = str(targets["classicDataset"])
    _run(
        [
            "pnpm",
            "data:convert:professiondb",
            str(roots["professionDb"]),
            str(roots["itemDb"]),
            forever,
            "Forever",
            "-",
            str(targets["overrides"]),
            wow_client_root,
            str(targets["iconDirectory"]),
        ],
        environment,
    )
    classic_environment = without_client_enrichment(environment)
    _run(
        [
            "pnpm",
            "data:convert:professiondb",
            str(roots["professionDb"]),
            str(roots["itemDb"]),
            classic,
            "Vanilla",
            forever,
        ],
        classic_environment,
    )
    _run(["pnpm", "data:audit", forever, str(targets["foreverQuality"])], environment)
    _run(["pnpm", "data:audit", classic, str(targets["classicQuality"])], environment)

    builds = {
        "forever": _build_id(REPO_ROOT / forever),
        "classic": _build_id(REPO_ROOT / classic),
    }
    expected_builds = {
        "forever": re.search(r"forever-([0-9.]+)-", forever),
        "classic": re.search(r"classic-era-([0-9.]+)-", classic),
    }
    for key, match in expected_builds.items():
        if match is None or builds[key] != match.group(1):
            raise SourceRefreshError(
                f"The latest {key} source targets build {builds[key]}, but the configured immutable "
                f"snapshot path targets {match.group(1) if match else 'an unknown build'}. "
                "Add a new versioned snapshot path before publishing it."
            )

    _update_notices(current, completed, builds)
    source_lock["projects"] = {key: asdict(value) for key, value in completed.items()}
    SOURCE_LOCK.write_text(f"{json.dumps(source_lock, indent=2)}\n", encoding="utf-8")
    print("Latest compatible sources were downloaded, converted, audited, and recorded.", flush=True)
    print("Review the Git diff before importing or publishing the regenerated snapshots.", flush=True)
    return 0


def check_sources() -> int:
    source_lock = _read_json(SOURCE_LOCK)
    current = source_lock.get("projects", {})
    releases = _latest_releases()
    for key, release in releases.items():
        pinned = current.get(key, {}) if isinstance(current, dict) else {}
        state = "current" if pinned.get("fileId") == release.fileId else "update available"
        print(f"{release.displayName}: {state}", flush=True)
    return 0


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refresh the checked-in profession sources.")
    parser.add_argument("command", choices=("check", "refresh"), nargs="?", default="refresh")
    parser.add_argument("--force", action="store_true", help="Regenerate even when file IDs are unchanged.")
    options = parser.parse_args(arguments)
    try:
        return check_sources() if options.command == "check" else refresh_sources(options.force)
    except SourceRefreshError as error:
        print(f"Source refresh failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
