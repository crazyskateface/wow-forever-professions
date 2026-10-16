# Forever Professions AWS infrastructure

The CDK v2 applications deploy the retained data foundation, the replaceable web/API
application, and a shared delivery stack. Read [`docs/CLOUD_DEPLOYMENT_DECISIONS.md`](../docs/CLOUD_DEPLOYMENT_DECISIONS.md)
and [`docs/CLOUD_DEPLOYMENT_ROADMAP.md`](../docs/CLOUD_DEPLOYMENT_ROADMAP.md) before
changing or deploying these stacks.

## Environments

`staging` is the default stage so the normal workspace `pnpm synth` gate remains
compatible with the existing deployment.

| Stage | Data stack | Application stack | DSQL parameter prefix | Log retention |
| --- | --- | --- | --- | --- |
| Staging | `ForeverProfessionsData` | `ForeverProfessions` | `/forever-professions/data/` | 7 days |
| Production | `ForeverProfessionsData-production` | `ForeverProfessions-production` | `/forever-professions/production/data/` | 14 days |

The account-level `ForeverProfessionsDelivery` stack is shared by both stages. It owns
the GitHub OIDC provider, one environment-specific GitHub role per stage, and the
monitoring-only monthly budget. It is independently deployable and must never be added
to a stage application's `--all` deployment.

The staging stack and stateful resource construct IDs are compatibility boundaries.
Do not rename them. Regression tests lock the existing logical IDs for the raw-data
bucket, DSQL cluster, site bucket, and CloudFront distribution.

Both stacks use termination protection. Retained buckets and the DSQL cluster keep
their explicit retention/deletion-protection policies.

## Commands

Run these from the repository root:

```text
pnpm infra:synth:staging
pnpm infra:synth:production
pnpm infra:synth:delivery
pnpm infra:diff:staging
pnpm infra:diff:data:staging
pnpm infra:diff:production
pnpm infra:diff:data:production
pnpm infra:diff:delivery
pnpm infra:deploy:data:staging
pnpm infra:deploy:data:production
pnpm infra:deploy:staging
pnpm infra:deploy:production
```

The data-only commands target the stateful stack without deploying the application;
use them for migration/import phases. The full deploy commands synthesize strictly,
require approval for IAM broadening, deploy the data and application stacks in
dependency order, and write ignored stage-specific output files under `ops/`.

Every deployment requires a reviewed diff. Stop if a retained resource is marked for
replacement.

Deploy the delivery stack separately, supplying the primary operator's email as a
CloudFormation parameter. The email is operational configuration, not a repository
secret:

```text
pnpm infra:deploy:delivery -- --parameters ForeverProfessionsDelivery:BudgetNotificationEmail=<operator-email> --profile <non-root-profile>
```

The deployed stack is termination-protected. Its USD 10 account-level budget sends
actual-spend notices at 50%, 80%, and 100%, plus a forecasted notice at 100%. It has
no automatic shutdown action. A separate pre-existing account budget is not owned or
modified by this stack.

## Bootstrap

The accepted target is AWS account `370979476195` in `us-east-1`. Bootstrap it once
through a non-root administrator identity:

```text
pnpm infra:bootstrap
```

The bootstrap command enables termination protection on `CDKToolkit`. Never use the
root login for bootstrap or deployment, and never delete the toolkit stack. GitHub
OIDC replaces local deployment credentials in roadmap Phase 2.

Phase 1 upgraded the target to bootstrap version 32 and enabled toolkit termination
protection on October 16, 2026. The same validation ran a live staging diff and found
no retained-resource replacements. No application or data stack changes were deployed.

## GitHub delivery controls

`.github/workflows/validation.yml` runs the locked install and complete `pnpm verify`
gate for pull requests and `main`. All third-party actions are pinned to commit SHAs.
`.github/workflows/aws-identity.yml` is a manual OIDC smoke test; it receives only an
environment role ARN, account ID, and region through GitHub environment variables.
No AWS access key belongs in a repository or environment secret.

The AWS trust policies use GitHub's immutable repository identity, including owner ID
`936134` and repository ID `1409583896`, and an exact `staging` or `production`
environment subject. The corresponding GitHub environments allow deployments only
from `main`; production requires approval from `crazyskateface`, and administrators
cannot bypass the environment rules. If the repository is
transferred or recreated, update the IDs in `lib/delivery-config.ts` and redeploy the
delivery stack before trying OIDC again.

The environment configuration is idempotent:

```text
pnpm infra:configure:github
```

Do not enable the required `Verify repository` branch check until the validation
workflow exists on GitHub. Immediately after that workflow is published, activate
`main` protection with:

```text
pnpm infra:protect:main
```

Then run the `AWS identity check` workflow against `staging`. Production remains
approval-gated even for the identity check. Concurrency keys serialize AWS jobs per
environment so two workflows cannot mutate one stage simultaneously.

## Configuration and outputs

Typed environment configuration lives in `lib/deployment-config.ts`. Delivery trust,
role, repository-identity, and budget configuration lives in
`lib/delivery-config.ts`. Together they own stack
names, shared SSM paths, scheduler names, account/region, log retention, and standard
ownership/cost tags. Add a new stage there rather than assembling names in a stack.

The stacks expose the values needed by later release phases:

- raw-data bucket, DSQL identifier/endpoint, ingestion role, and pricing-worker role;
- site bucket, CloudFront distribution ID/domain, API URL, and API role.

Do not commit `cdk-outputs*.json`; it may contain environment-specific endpoints.

## Security validation

Strict synthesis runs `cdk-nag`'s AWS Solutions checks. Intentional findings are
acknowledged at the narrowest relevant construct and written into CloudFormation
metadata with a reason. Current acknowledgements cover:

- object-key wildcards required for the raw S3 prefix;
- X-Ray APIs that do not support resource-level permissions;
- CDK's standard Lambda log-delivery policy;
- the scheduler's queue already being the dead-letter destination;
- CloudFormation-generated site, ingestion-role, and stack suffixes narrowed to stable
  stage-specific prefixes, plus CloudFront distributions narrowed by stage tags;
- the intentionally public application API;
- globally available CloudFront content; and
- edge/S3 access logging, paid WAF, and custom-certificate TLS work explicitly deferred
  by the low-cost roadmap.

Do not add a blanket stack acknowledgement. Fix actionable findings and keep any
remaining acknowledgement specific and evidence-based.
