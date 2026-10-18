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
  and confirms data-writing or deployment jobs. Live updates preserve open output
  expansions and confirmation dialogs.
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
- source-release checks, automatic downloads, data audit, and snapshot regeneration;
- local PostgreSQL startup, import, and smoke tests;
- staging and production CDK diffs and guarded deploys;
- staging and production DSQL migration, role setup, import, and release verification.

Set `WOW_CLIENT_ROOT` once in `.env.admin`; the panel uses the installed client for
metadata and icon enrichment. **Check for newer source data** is read-only. **Fetch
and generate latest source data** queries the public CurseForge metadata for the
latest stable LibProfessionDB and LibItemDB releases compatible with both pinned game
versions, downloads them to the ignored `.local-data/admin-sources` cache, and does
nothing when the pinned file IDs are already current. When a release changed, it runs
the existing converters and audits and records the source URL, version, and SHA-256 in
`data/imports/source-releases.json` and the normal attribution files. It never imports
or publishes the generated snapshots; those remain separate confirmed jobs so the Git
diff can be reviewed first.

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
- **Health is unhealthy locally:** start `pnpm dev:api`; database readiness also
  requires local PostgreSQL and `LOCAL_DATABASE_URL` as documented in the root README.
- **A deploy requests approval:** this is the existing CDK broadening safeguard. Use
  the console attached to the admin process or stop the job; do not weaken the deploy
  script to suppress an unexpected IAM change.
