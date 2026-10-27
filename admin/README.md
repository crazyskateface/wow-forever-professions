# Forever Professions local admin dashboard

This is a local-only Python 3.12+ and NiceGUI operations console for the existing
Forever Professions repository. It does not add a hosted admin service, database,
login system, or unrestricted terminal. The server refuses to bind anywhere except
`127.0.0.1`.

## Install and start on Windows 11

Run from the repository root:

```powershell
python -m venv .venv-admin
.\.venv-admin\Scripts\python -m pip install -e ".\admin[dev]"
Copy-Item .env.admin.example .env.admin
.\.venv-admin\Scripts\forever-admin
```

Open `http://127.0.0.1:8088`. The browser normally opens automatically. The
dashboard performs read-only health and AWS status checks at startup; it never runs a
maintenance or import job automatically.

The Overview and Health pages include **Sign in to AWS**. It runs `aws login` for
`ADMIN_AWS_PROFILE`, opens the AWS-managed browser flow, and reconnects the dashboard
after the short-lived session is ready. The panel does not receive or store the
credentials. AWS CLI 2.32.0 or later is required. A valid cached session is reused on
startup, so signing in is only necessary when AWS reports that the session is missing
or expired.

The process reads `.env.admin` from the repository root when that ignored file is
present. Existing process environment variables take precedence. Set
`ADMIN_CONFIG` to use a different TOML file, `ADMIN_PORT` to change the loopback
port, and `ADMIN_ENV_FILE` to select another environment file. `ADMIN_HOST` may only
be `127.0.0.1`. Set `ADMIN_SHOW_BROWSER=false` for a headless startup check.

## Pages

- **Overview** summarizes HTTP health, both CloudFormation environments, 24-hour
  CloudWatch request/error metrics, recent job results, and recent errors.
- **Jobs** runs only the predefined argument arrays in `admin/config.toml`. It streams
  stdout and stderr, prevents duplicate runs, applies timeouts, supports cancellation,
  and confirms data-writing or deployment jobs. Managed local services use Start/Stop
  controls, run without an artificial command timeout, and are stopped when the admin
  process shuts down normally. Live updates preserve open output expansions and
  confirmation dialogs.
- **Logs** reads discovered CloudWatch log groups and any explicitly configured local
  files. Empty results and retrieval failures are shown differently.
- **Health** shows local, staging, and production liveness/readiness checks, stack
  status, recent stack events, and AWS usage metrics.

## Register jobs and source refreshes

Each `[[jobs]]` entry contains one or more `commands`, expressed as TOML arrays. The
runner passes every array directly to Python's subprocess API with `shell=False`.
Executables must appear in `[security].allowed_executables`, working directories must
stay inside this repository, and UI users cannot enter arbitrary commands.

The checked-in catalog includes real jobs for the repository's current commands:

- `pnpm verify`;
- managed local API and Vite frontend servers with Start/Stop controls;
- a one-click local catalog update that refreshes compatible source releases and
  imports only when the exact local catalog is missing or outdated;
- granular source-release, local database, import, and smoke-test tools;
- staging and production CDK diffs and guarded deploys;
- staging and production DSQL migration, role setup, import, and release verification.

Set `WOW_CLIENT_ROOT` once in `.env.admin`; the panel uses the installed client for
metadata and icon enrichment. **Update latest local catalog** is the normal local data
workflow. One confirmation runs these guarded steps in order:

1. query the public CurseForge metadata for the latest stable LibProfessionDB and
   LibItemDB releases compatible with both pinned game versions;
2. download and regenerate snapshots only when a pinned source file ID changed;
3. start local PostgreSQL and compare its imported build hashes with both exact files;
4. when either hash or the stored comparison is missing or outdated, recreate the
   persistent local catalog volume and import Classic followed by Forever.

The runner stops immediately when any step fails, so a failed refresh cannot be
followed by a database check or import. When both exact snapshots and their comparison
are already present, it skips the reset and both imports. Classic is loaded again only
when a fresh database is required: the comparison needs its baseline, and imported
build rows are intentionally immutable. Although the Classic game build is fixed, an
upstream source release can still correct the extracted Classic snapshot. The Jobs
page shows the pinned version and file ID for both source libraries, plus whether the
latest source operation found an update, completed an update, or was unchanged.

The separate jobs under **Data tools** and **Local tools** remain available for
diagnostics. Source downloads are cached under ignored
`.local-data/admin-sources`. Generated datasets, audits, and icons stay in an ignored
staging directory until both dataset build IDs match their configured immutable
snapshot filenames, so a failed conversion, audit, or build check leaves checked-in
targets unchanged. Successful regeneration records the source URL, version, and
SHA-256 in `data/imports/source-releases.json` and the normal attribution files.
Staging and production publication remain separate confirmed jobs so the generated
Git diff can be reviewed before deployment.

The PostgreSQL Docker container is the database, not the HTTP backend used by the
browser. Under **Local services**, start **Local API server** to serve the imported
catalog at `http://127.0.0.1:3001`, then start **Frontend development server** to serve
Vite at `http://127.0.0.1:5173`. The cards change to **Stop** while running and expose
links for API readiness and the frontend. The API job supplies the repository's
loopback-only `LOCAL_DATABASE_URL` automatically; it does not use AWS credentials,
tokens, or values from `.env.admin`.

If API readiness fails or recipes are absent, run **Update latest local catalog**
once. It starts PostgreSQL and imports only when the exact catalog is missing or
outdated. After that, ordinary API/frontend starts do not reimport data.

The PostgreSQL catalog is stored in a named Docker volume and survives normal container
and Docker Desktop restarts. The update workflow deletes that volume only after it
detects an exact dataset or migration mismatch. **Test local database** uses a separate
temporary database and cannot replace the application recipes.

To add another trusted operation, copy an existing `[[jobs]]` entry, use a unique
lowercase ID, list literal argument arrays, and add `confirmation` for anything that
writes data or changes AWS. `${ENVIRONMENT_VARIABLE}` references disable the job
until the variable is present. Do not place credentials in `config.toml` or command
arguments.

## Health and logs

Static endpoints are configured with `[[health]]`. The default local checks use the
existing `/api/health` and `/api/ready` contracts. Staging and production URLs are
read from each application stack's `WebUrl` output, then checked through CloudFront.
An unreachable endpoint is unhealthy, never healthy.

CloudWatch log groups are discovered from the application and data stack resources.
The dashboard uses `FilterLogEvents` for a bounded 24-hour window and never creates a
new logging service. API Gateway access records are classified from their HTTP status
and a non-placeholder integration error value; a successful record is not treated as
an error merely because it contains the `integrationError` field name. Add optional
local files with repository-relative paths:

```toml
[[local_logs]]
id = "local-api"
name = "Local API"
path = ".local-data/api.log"
```

## AWS configuration and permissions

Use the normal boto3 credential chain. Prefer a non-root named profile obtained with
short-lived credentials and set `ADMIN_AWS_PROFILE`; do not put access keys in this
repository. Jobs inherit the process AWS environment, including `AWS_PROFILE`. Set
both variables to the same profile when monitoring and operations should use one
identity; the dashboard's sign-in button specifically refreshes `ADMIN_AWS_PROFILE`.

Read-only monitoring needs these actions scoped to the two application/data stacks
and their log groups where resource-level permissions are supported:

```text
sts:GetCallerIdentity
cloudformation:DescribeStacks
cloudformation:DescribeStackEvents
cloudformation:ListStackResources
cloudwatch:GetMetricData
logs:FilterLogEvents
```

Deployment and ingestion jobs still require the permissions already documented in
`ops/README.md` and `packages/ingestion/README.md`. The dashboard does not grant or
assume broader access. Production publication remains subject to the repository's
reviewed `stage -> main` promotion boundary.

The six stage-specific values in `.env.admin.example` come from each data/application
stack's outputs. They are operational configuration, not credentials. Keep them out
of committed files because endpoints and role ARNs are environment-specific.

## Tests and troubleshooting

```powershell
.\.venv-admin\Scripts\python -m pytest admin\tests
```

- **AWS status unavailable:** verify `ADMIN_AWS_PROFILE`, region, credential expiry,
  and the read permissions above. Other pages and local jobs remain available.
- **A job is disabled:** add every environment variable listed on its card, then
  restart the dashboard so configuration placeholders are resolved.
- **`pnpm` not found:** install the repository-pinned pnpm and verify it is on `PATH`
  before starting NiceGUI.
- **Health is unhealthy locally:** start **Local API server**. Database readiness also
  requires local PostgreSQL and an imported catalog; use **Update latest local
  catalog** if the readiness link does not report `ready`.
- **A deploy requests approval:** this is the existing CDK broadening safeguard. Use
  the console attached to the admin process or stop the job; do not weaken the deploy
  script to suppress an unexpected IAM change.

The catalog workflows target the complete `*-professions.json` snapshots. Conversion
requires all ten registered profession source tables. Set `WOW_CLIENT_PRODUCT=wowf`
alongside `WOW_CLIENT_ROOT` for the installed Forever client; the extractor retains
its actual product, resolved build, and locale. Existing item icons remain reusable
only for the same product and build. Source archives and runtime credentials remain
outside Git.
