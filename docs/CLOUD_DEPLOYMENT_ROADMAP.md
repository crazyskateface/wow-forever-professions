# Cloud deployment roadmap

Last updated: October 16, 2026

Status: Phase 4 implementation complete locally; live staging and Phase 2 publication gates pending

This roadmap takes Forever Professions from the current local-development and CDK
baseline to a repeatable production deployment in AWS. It is intentionally separate
from the product roadmap: this document tracks infrastructure, data promotion,
application delivery, security, observability, and operations.

## Outcome

The deployment is complete when:

- a pull request cannot merge unless the workspace verifies successfully;
- an approved release can reproducibly deploy infrastructure, database changes,
  imported data, the API, and the web application without developer credentials;
- the public site and `/api/*` use one CloudFront origin and pass smoke tests;
- production has least-privilege access, alarms, a rollback procedure, and a named
  operator runbook;
- the scheduled pricing refresh remains off until its provider and writes have been
  validated with production-like data.

## Current AWS baseline

The repository already defines two CDK stacks under `ops/`.

| Area | Present now | Work still required |
| --- | --- | --- |
| Data | Retained, versioned raw-data S3 bucket; deletion-protected Aurora DSQL; scoped migration/ingestion/runtime roles; checksum-ledger migrations; immutable raw snapshots and audited staging release | Production promotion using the exact staging-proven snapshots |
| Pricing | ARM64 Lambda worker, EventBridge Scheduler, and DLQ | Provider credentials/configuration, production validation, alerts, and a deliberate schedule enablement |
| API | ARM64 Lambda behind HTTP API; DSQL reader access; `/api/*` CloudFront behavior | Deployment pipeline, restricted production CORS, health/smoke checks, alarms, and release rollback procedure |
| Web | Private, retained, versioned S3 bucket and CloudFront distribution with OAC and a frontend-only SPA route rewrite | Build upload, cache headers, invalidation, release manifest, and optional custom domain |
| Delivery | `pnpm verify`; strict stage/delivery synth; pinned validation, deploy, and OIDC-check workflows; deployed OIDC roles; protected GitHub environments; `stage` integration branch; USD 10 budget | Publish the hardened workflows and isolated bootstrap roles, enable required checks on `stage` and `main`, then prove staging OIDC and deployment |

The data stack is deliberately stateful and must remain independently deployable from
the application stack. Never solve an application release problem by replacing or
destroying the data stack.

## Recommended release model

Use GitHub Actions with AWS IAM OIDC as the first delivery path. The code is already
reviewed through GitHub pull requests, and OIDC avoids stored AWS access keys. Keep an
AWS-native CodePipeline/CodeBuild implementation as a later option if centralizing the
pipeline inside AWS becomes valuable; it is not required for the first production
release.

Use two named stages:

- `staging`: proves infrastructure, migrations, imports, API behavior, and the exact
  web artifact before production.
- `production`: receives only a previously verified commit and requires a GitHub
  environment approval before any deployment begins.

If only one AWS account is initially available, the stages may share the account but
must use different stack names, SSM paths, schedules, buckets, roles, and database
clusters. Separate AWS accounts remain the preferred long-term boundary.

```text
Pull request
  -> install -> verify -> CDK synth -> security checks

Approved release commit
  -> deploy data stack
  -> run forward-only DSQL migrations
  -> upload/import immutable source snapshots
  -> audit imported catalog and comparisons
  -> deploy application stack
  -> upload web artifact and cache metadata
  -> invalidate CloudFront
  -> smoke test CloudFront and /api/*
  -> record release manifest
```

## Guardrails that apply to every phase

- Manage AWS resources through CDK. Do not create permanent infrastructure manually.
- Preserve existing construct IDs. Renaming a construct can cause resource replacement.
- Keep termination protection and retention on stateful resources.
- Use short-lived OIDC sessions. Do not store AWS access keys in GitHub secrets.
- Put provider secrets in AWS Secrets Manager or encrypted SSM parameters, never CDK
  source, workflow YAML, or Lambda environment variables in plain text.
- Use immutable source snapshots and record their hashes and source build IDs.
- Apply database migrations forward only. Application rollback must not assume a
  destructive database downgrade.
- Run `pnpm verify`, strict synthesis, and a reviewed CDK diff before deployment.
- Do not enable the auction refresh schedule as part of an unrelated release.

## Phase 0 — Lock deployment decisions

Goal: remove account, region, stage, domain, and ownership ambiguity before resources
are created.

- [x] Record the staging and production AWS account IDs and regions.
- [x] Name the operator who can approve production and respond to alarms.
- [x] Decide whether the first public release uses the CloudFront domain or a custom
  domain. The CloudFront domain is sufficient for the first controlled launch.
- [x] Define resource tags: application, stage, owner, repository, and cost center.
- [x] Define an initial monthly budget and notification recipients.
- [x] Record availability and recovery expectations. At minimum, retain raw imports,
  release manifests, and enough information to replay an import.

Decision record: [`CLOUD_DEPLOYMENT_DECISIONS.md`](CLOUD_DEPLOYMENT_DECISIONS.md)

Exit gate: **complete**. The account/region/stage matrix, production approver, launch
origin, required tags, budget, and recovery targets are recorded. Phase 1 must preserve
the existing staging stack names while giving production distinct stack names and
stage-qualified shared parameters.

## Phase 1 — Make CDK stage-aware and production-safe

Goal: make repeated staging and production synthesis deterministic before the first
cloud deployment.

Status: complete on October 16, 2026.

- [x] Add a typed deployment-stage configuration used by `ops/bin/app.ts`.
- [x] Qualify stack names, SSM paths, scheduler names, and other global or regional
  names with the stage.
- [x] Keep logical construct IDs stable inside each stack.
- [x] Add consistent resource tags from Phase 0.
- [x] Set stage-specific log retention: 7 days in staging and 14 days in production.
- [x] Enable termination protection on the application stack as well as the data
  stack, while retaining the existing stateful-resource removal policies.
- [x] Export only the values the release workflow needs: site bucket, distribution
  ID/domain, API URL, raw-data bucket, ingestion role, and DSQL identity.
- [x] Add CDK entry points for `synth`, `diff`, and stage-specific deploys so operators
  do not have to reconstruct commands.
- [x] Add `cdk-nag` checks and document any narrowly justified suppressions.
- [x] Bootstrap every target account/region with modern CDK bootstrap resources.
- [x] Configure independent `fpstage` and `fpprod` bootstrap qualifiers in code so
  automation cannot inherit the shared delivery toolkit.

Validation:

```powershell
pnpm typecheck
pnpm --filter @forever-professions/ops exec cdk synth --strict
pnpm --filter @forever-professions/ops exec cdk diff
```

Exit gate: **complete**. Staging and production synthesize independently, tests
preserve the existing stateful logical IDs, and the live staging diff showed no
retained-resource replacements. `CDKToolkit` was upgraded from bootstrap version 27
to 32 through the non-root `cdk_admin` identity, and toolkit termination protection is
enabled. No application or data stack changes were deployed during this phase.

## Phase 2 — Create the GitHub delivery identity and validation workflow

Goal: validate every pull request and deploy without long-lived AWS credentials.

Status: implementation complete on October 16, 2026; publication gate pending.

- [x] Add a pull-request workflow that uses the repository's pinned Node/pnpm setup,
  runs `pnpm install --frozen-lockfile`, `pnpm verify`, strict CDK synthesis, and the
  CDK security checks.
- [ ] Configure GitHub branch protection so required validation must pass before merge
  into `stage` or `main`.
- [x] Create one OIDC role per stage, restricted to this repository, its protected
  environment, and the intended branch or release ref.
- [x] Scope each role to its stack-scoped deploy role, stage-qualified asset/lookup
  roles, and the exact site upload, invalidation, migration, and import operations it
  needs. The deploy role can operate only that environment's named stacks and pass
  only its qualifier-specific CloudFormation execution role.
- [x] Add GitHub `staging` and `production` environments. Require human approval for
  production.
- [x] Create the account-level USD 10 monitoring budget with actual-spend alerts at
  50%, 80%, and 100%, plus a forecasted-spend alert at 100%, before the first
  automated staging deployment.
- [x] Use concurrency controls so two deployments cannot mutate the same stage at the
  same time.
- [x] Pin action versions and keep dependency installation locked.
- [x] Publish the freshly built web artifact to the selected stage bucket and
  invalidate only that stage's CloudFront distribution after CDK succeeds.

Implemented state: the termination-protected `ForeverProfessionsDelivery` stack owns
the GitHub provider, immutable-repository/environment trust policies, stage roles, and
the project budget. `stage` is the integration and staging-deployment branch; `main`
is production-only. GitHub `staging` accepts only `stage`, while `production` accepts
only `main` and requires non-bypassable `crazyskateface` approval. Their variables contain only
account metadata and role ARNs. Repository and environment secret inventories contain no AWS access
keys. Current account spend was USD 23.324 when the account-level USD 10 guardrail was
created, so its thresholds begin exceeded; the separate pre-existing USD 25 budget is
intentionally untouched.

Publication gate: publish the validation, deployment, and identity workflows plus the
isolated `fpstage`/`fpprod` bootstrap configuration and stack-scoped deploy roles; let
`Verify repository` pass on both long-lived branches; run
`pnpm infra:protect:branches`; and dispatch `AWS identity check` for `staging`. Branch
protection remains deferred until each branch has a real successful check, which
avoids deadlocking promotion.

This sequence remains a Phase 2 publication gate; it does not need to be moved into a
later phase. The Phase 3 data plane was proven through the approved local operator
identity, but no automated staging deployment may run until this gate has passed.

Exit gate: **pending publication**. A pull request must prove the repository and CDK
templates, the staging identity workflow must assume its role, and then the required
check must be protected on both `stage` and `main`.

## Phase 3 — Prove the data plane

Goal: create the stateful foundation and make data loading repeatable before exposing
the application.

Status: complete on October 16, 2026.

- [x] Deploy only the staging data stack first.
- [x] Revalidate Aurora DSQL migrations 017 through 024 against the live target.
- [x] Add an idempotent migration command that authenticates through IAM, records the
  applied migration set, stops on drift, and can be run by the deployment role.
- [x] Bootstrap and verify the database roles used by ingestion, the application
  reader, and pricing writes.
- [x] Upload exact source snapshots to the retained raw-data bucket under immutable,
  build-qualified keys.
- [x] Run the existing ingestion pipeline with `DSQL_ENDPOINT`, `AWS_REGION`,
  `RAW_DATA_BUCKET`, and `INGESTION_ROLE_ARN` supplied from stack outputs or SSM.
- [x] Import the Classic baseline and Forever target, then generate their comparison.
- [x] Run the import audit and store its machine-readable result beside the release
  manifest.
- [x] Prove rerunning the same migration/import is safe and does not duplicate rows.

Live evidence: `ForeverProfessionsData` was deployed independently with no retained
resource replacement. The checksum ledger records catalog migrations 001–024 and
pricing migrations 001–003; an immediate rerun skipped all 27. The three runtime
database roles were remapped idempotently and verified for 35 ingestion, 19 reader,
and 9 pricing privileges. Exact Classic `1.15.9.69722` and Forever `1.60.1.69977`
snapshots produced 314 and 603 recipe versions plus 603 comparison rows. Replaying the
Forever import reused the raw object and deterministic comparison ID without changing
row counts. The deployed staging GitHub role may assume the staging migration role;
the production GitHub role deliberately has no equivalent permission yet.

The passing machine audit and manifest are immutable objects under
`releases/data/1.15.9.69722--1.60.1.69977/c45372dc8b6264dec83d1275d5691ed0/`.
Both report 630 target client-data rows and 630 target quality rows; rerunning release
recording returned `already-exists` for both objects.

Release publication now independently derives the expected recipe, client-data,
rarity, and `NEW`/`UPDATED`/`REMOVED`/`UNCHANGED` counts from the exact input snapshots.
It compares all of them with persisted DSQL rows before creating immutable release
objects, preventing an interrupted import from being certified.

Exit gate: **complete**. A clean staging data stack can be migrated and populated from
documented snapshots, the audit passes, and the release records source hashes and row
counts.

## Phase 4 — Deploy and verify the API

Goal: serve the production contracts from cloud data before publishing the web build.

Status: implementation complete locally on October 16, 2026; deployment verification
pending publication of the Phase 2 branch-isolation changes.

- [ ] Deploy the staging application stack after the data exit gate passes.
- [x] Confirm in synthesized infrastructure that the Lambda role uses the application
  reader and receives only `dsql:DbConnect` to the exact stage cluster.
- [x] Add a lightweight health/readiness endpoint that verifies process health without
  leaking database or account details.
- [x] Remove wildcard CORS from production. The first launch is same-origin through
  CloudFront, so no cross-origin production allowance is required; staging remains
  wildcard-enabled for direct-origin testing.
- [ ] Exercise the catalog, recipe, change, route optimization, shopping-list, pricing
  market, and pricing response contracts through CloudFront using the data-driven
  `pnpm api:smoke:cloud` command documented in `docs/API_TESTING.md`.
- [x] Verify in API regression tests that optional comparison or pricing dependencies
  return explicit `503` responses instead of fabricated data.

Implemented readiness keeps `/api/health` as dependency-free liveness and adds
`/api/ready` as a minimal application-reader database check. Both success and failure
responses use a shared contract and disclose only `ready` or `unavailable`. The cloud
smoke command selects real catalog identifiers at runtime and validates every Phase 4
response against `packages/contracts`, avoiding the fixture IDs used by `api:smoke`.
The frontend SPA fallback is now a default-behavior viewer-request rewrite instead of
a distribution-wide custom error response, so API errors retain their JSON status and
body through CloudFront.

Do not deploy this uncommitted working tree manually. Publish the Phase 2 workflow and
isolated bootstrap/deploy-role changes through the feature pull request first, then
let the reviewed `stage` commit deploy staging and run the CloudFront smoke command.

Exit gate: all smoke tests pass through the CloudFront `/api/*` behavior, not only the
direct API Gateway URL.

## Phase 5 — Publish the web application

Goal: deploy one traceable web artifact with correct caching and no all-at-once icon
fetch.

- [ ] Build the web app once for the release commit and archive a checksum for the
  artifact.
- [ ] Publish the build from the release workflow rather than embedding the complete
  site in the CDK template.
- [ ] Upload hashed JavaScript, CSS, and item-icon assets with long-lived immutable
  cache headers.
- [ ] Upload `index.html` and other entry metadata with short or no-cache headers so a
  new release is discoverable promptly.
- [ ] Delete stale site objects only after the destination bucket and prefix have been
  resolved and verified for the selected stage.
- [ ] Add a 30-day lifecycle for noncurrent static-site object versions without
  applying it to the raw-data bucket, import audits, or release manifests.
- [ ] Create a CloudFront invalidation for entry documents after the upload succeeds.
- [ ] Confirm item icons remain browser-lazy-loaded and are served through CloudFront.
- [ ] Use CloudFront's USD 0 plan when compatible and reproducible through the release
  process; otherwise retain pay-as-you-go within its free allowance. Do not enable a
  paid plan for the initial launch.
- [ ] Emit a release manifest containing commit SHA, web checksum, stack outputs,
  database migration version, source build IDs, import audit result, and timestamp.

Exit gate: a fresh browser session loads the site, deep links resolve through the SPA
fallback, icons load on demand, and the UI reads its data through the deployed API.

## Phase 6 — Add production observability and security gates

Goal: detect user-visible failure and control cost before public traffic is directed to
the service.

- [ ] Add CloudWatch alarms for API Lambda errors, throttles, duration, and HTTP API
  5xx responses.
- [ ] Add alarms for the pricing worker's errors and DLQ depth while keeping its
  schedule disabled.
- [ ] Monitor CloudFront 5xx rates and add a low-cost external smoke check for the site
  and API readiness endpoint. Defer CloudWatch Synthetics until it is justified.
- [ ] Give alarms an owned notification destination and test delivery.
- [ ] Verify the USD 10 budget notifications and add a cost anomaly notification
  appropriate to the selected account.
- [ ] Verify the 7-day staging and 14-day production log retention settings and confirm
  logs do not contain credentials, signed requests, or sensitive headers.
- [ ] Review IAM policies for least privilege, including OIDC subject restrictions and
  `iam:PassRole` boundaries.
- [ ] Establish the dedicated MFA-protected human operator role and retire routine use
  of the transitional `cdk_admin` access key before production deployment.
- [ ] Run dependency, secret, and infrastructure scans in CI; treat high-severity
  findings as release blockers.
- [ ] Enable and review CloudFormation drift detection on the deployed stacks.

Exit gate: a forced staging failure reaches the operator, the runbook identifies the
responsible component, and the AWS bill has a notification threshold.

## Phase 7 — Rehearse promotion and rollback

Goal: prove the exact production sequence and recovery path in staging.

- [ ] Promote one immutable commit through every deployment step in staging.
- [ ] Confirm approval is required before the production job can start.
- [ ] Rehearse an application rollback to the previous Lambda/web artifact.
- [ ] Verify a site rollback restores the prior version and invalidates affected entry
  documents.
- [ ] Verify CloudFormation rollback does not delete or replace the data bucket or DSQL
  cluster.
- [ ] Document forward-fix handling for database migrations; do not automate destructive
  migration rollback.
- [ ] Test disabling the pricing schedule and invoking the worker manually.
- [ ] Write incident steps for API failure, bad web artifact, failed import, pricing
  provider failure, and unexpectedly high cost.

Exit gate: someone other than the implementation author can deploy and roll back the
staging application using only the runbook and approved access.

## Phase 8 — Production launch

Goal: perform a controlled first production deployment.

- [ ] Deploy the production data stack and confirm deletion protection and retained
  resources before continuing.
- [ ] Run migrations, imports, and the audit using the exact staging-proven snapshots.
- [ ] Deploy the application stack and execute API smoke tests.
- [ ] Publish the staging-proven web artifact, invalidate entry documents, and execute
  browser/deep-link checks.
- [ ] Verify alarms, logs, budget notifications, and the release manifest.
- [ ] Announce the release only after the CloudFront and `/api/*` checks pass.
- [ ] Keep the pricing schedule disabled for the initial launch unless Phase 10 has
  independently passed.

Exit gate: the release is observable, reversible at the application layer, and fully
identified by its manifest.

## Phase 9 — Custom domain and edge hardening

This phase can follow the first CloudFront-domain launch.

- [ ] Create or delegate the Route 53 hosted zone.
- [ ] Request and validate the CloudFront ACM certificate in `us-east-1`.
- [ ] Add the domain aliases and DNS records through CDK.
- [ ] Update CORS and smoke-test configuration to the canonical origin.
- [ ] Decide whether AWS WAF, rate-based rules, response security headers, and access
  logging are justified by the traffic and threat model.
- [ ] Redirect or document the noncanonical CloudFront URL as appropriate.

Exit gate: TLS, DNS, SPA routes, API calls, and canonical-origin security behavior all
pass from an uncached browser session.

## Phase 10 — Enable scheduled pricing refresh

This is a separate operational launch, not an automatic part of application deploys.

- [ ] Store and rotate any provider credential using Secrets Manager or encrypted SSM.
- [ ] Validate provider rate limits, request size, market identifiers, and item scope.
- [ ] Invoke the worker manually in staging and production and verify idempotent writes.
- [ ] Confirm timeout, reserved concurrency, retry, DLQ, and alarm behavior.
- [ ] Review forecasted request and database cost.
- [ ] Keep the staging schedule disabled outside deliberate provider tests.
- [ ] Enable the production EventBridge schedule through the explicit deployment
  parameter at `rate(4 hours)`. Any shorter interval requires recorded cost and product
  evidence.
- [ ] Observe at least one complete scheduled cycle before considering the feature
  operational.

Exit gate: fresh prices are visible through the API, a failed refresh alerts the owner,
and disabling the schedule is documented as the first containment action.

## Required release workflow order

The automated workflow must preserve this order:

1. Verify the repository and synthesize strictly.
2. Assume the stage-specific OIDC role.
3. Show and archive the CDK diff.
4. Obtain the stage's required approval.
5. Deploy the data stack.
6. Run and audit migrations/imports only when a new data release is selected.
7. Deploy the application stack.
8. Upload the already-built web artifact with deliberate cache metadata.
9. Invalidate CloudFront entry documents.
10. Run API and browser smoke tests through CloudFront.
11. Write the release manifest and deployment summary.

A failed step stops the workflow. The pricing schedule is never enabled implicitly.

## Rollback boundaries

| Failure | First response | Recovery boundary |
| --- | --- | --- |
| Web regression | Restore the prior web artifact and invalidate entry documents | S3 object versions/release artifact; no infrastructure change |
| API regression | Redeploy the last known-good application commit | Application stack/Lambda code; database schema remains forward-compatible |
| Infrastructure update failure | Allow CloudFormation rollback and inspect stack events | Never delete or recreate the data stack as a shortcut |
| Bad import | Stop promotion, preserve the raw snapshot and audit output, then run a reviewed corrective import | Prefer correction/forward repair; do not edit production rows by hand |
| Pricing refresh failure | Disable the schedule, inspect worker logs and DLQ, then replay after correction | Pricing subsystem only; catalog and site remain available |
| Credential exposure | Disable/revoke the affected identity or secret, rotate it, and audit recent use | OIDC roles and managed secrets limit blast radius |

## Initial implementation slice

This foundation slice is implemented locally and in the staging AWS account:

1. Add typed `staging`/`production` CDK configuration and qualified names.
2. Add stage-aware synth/diff/deploy scripts without changing stable construct IDs.
3. Add `cdk-nag` and a strict PR validation workflow.
4. Add a staging GitHub environment and narrowly scoped AWS OIDC deployment role.
5. Document bootstrap and first data-stack deployment commands.

The DSQL migration/import gate has passed in staging, and Phase 4 application changes
are implemented and tested locally. Their live CloudFront exit gate remains blocked by
the explicit Phase 2 publication sequence above. Production still waits for the later
promotion, security, and rollback phases; Phase 3 completion does not authorize a
production deployment or grant the production GitHub role permission to assume a
production migration role.
