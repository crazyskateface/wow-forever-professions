# Cloud deployment decisions

Decision date: October 16, 2026

Status: accepted for the initial deployment path

This is the Phase 0 decision record for
[`CLOUD_DEPLOYMENT_ROADMAP.md`](CLOUD_DEPLOYMENT_ROADMAP.md). It fixes the initial
AWS boundary, ownership, launch shape, tagging, budget, and recovery expectations so
later implementation work does not have to guess.

## Environment boundary

| Stage | AWS account | Region | Initial purpose |
| --- | --- | --- | --- |
| Staging | `370979476195` | `us-east-1` | Preserve and automate the existing development deployment; prove migrations, imports, releases, and rollback |
| Production | `370979476195` | `us-east-1` | Separately named resources receiving only staging-proven releases |

This is an intentional single-account starting point. The application is a small,
serverless project, and only one project account is currently configured. Stage
isolation must therefore be enforced with distinct stack names, resource names, SSM
paths, IAM roles, deployment environments, and data stores. A later move to separate
AWS accounts must not require application changes.

Git uses a matching promotion boundary: `stage` is the default integration branch and
deploys only the staging environment. `main` is production-only and receives changes
through reviewed `stage -> main` pull requests. The stages use independent `fpstage`
and `fpprod` CDK bootstrap qualifiers; neither GitHub identity may assume the shared
default bootstrap roles used to administer the delivery stack. Each identity instead
assumes a dedicated deploy role that is limited to its two named CloudFormation stacks
and is permitted to pass only its qualifier-specific execution role. The standard CDK
bootstrap deploy roles are not exposed to GitHub Actions.

The existing deployed stacks and their construct IDs are the staging compatibility
boundary:

- `ForeverProfessionsData`
- `ForeverProfessions`

Do not rename or replace those stacks while introducing stage configuration. The
production stacks will use explicit production-qualified names. Phase 1 must implement
this as typed configuration with a compatibility mapping for staging rather than
renaming existing stateful resources.

The currently documented development entry points remain staging references, not the
production URL:

- CloudFront: `https://d2v8wp3f4a4zkh.cloudfront.net`
- API Gateway: `https://m6ulu3zwch.execute-api.us-east-1.amazonaws.com`

## Identity and ownership

| Responsibility | Decision |
| --- | --- |
| Primary operator | GitHub owner `crazyskateface` |
| Production approver | GitHub owner `crazyskateface` for the initial solo-project workflow |
| Alarm recipient | The primary operator, configured outside the repository through the deployment environment |
| CI identity | One GitHub Actions OIDC role per stage |
| Human AWS identity | A non-root operator role with MFA and only the access required to inspect or recover deployments |

The local AWS profile named `forever-professions` currently identifies the selected
account, but its login session is expired and tied to the account root identity. It is
not an approved deployment identity. Phase 2 must establish GitHub OIDC roles and a
non-root human operator role before any new production deployment.

Phase 1 bootstrap validation used the existing non-root IAM user `cdk_admin` only to
upgrade `CDKToolkit` and enable its termination protection. That local long-lived
credential is a transition mechanism, not the release identity; Phase 2 still replaces
deployment access with GitHub OIDC.

Phase 2 deployed the environment-specific GitHub OIDC roles and provider in the
termination-protected `ForeverProfessionsDelivery` stack on October 16, 2026. The
roles trust GitHub's immutable owner/repository IDs plus the exact protected
environment subject. The `cdk_admin` credential remains a temporary bootstrap and
recovery identity only; a dedicated MFA-protected human operator role is still
required before the first production deployment.

Production self-approval is acceptable only while this remains a solo project. Add a
second required reviewer before another maintainer receives deployment access.

## Launch origin and domain

The first production launch will use its generated CloudFront domain. Route 53, ACM,
and a branded custom domain are deferred to Phase 9.

This avoids making DNS ownership a launch blocker. Production CORS will be restricted
to the production CloudFront origin after that distribution exists, then changed to
the canonical custom origin if Phase 9 is completed.

## Required resource tags

Every taggable resource created or adopted by the stage-aware CDK app must receive:

| Tag | Value |
| --- | --- |
| `Application` | `forever-professions` |
| `Environment` | `staging` or `production` |
| `ManagedBy` | `aws-cdk` |
| `Repository` | `crazyskateface/wow-forever-professions` |
| `Owner` | `crazyskateface` |
| `CostCenter` | `personal-project` |

Existing resource-specific `Purpose` tags remain useful and should not be removed.
Activate `Application` and `Environment` as cost-allocation tags before relying on a
tag-scoped budget; use an account-level budget as the temporary fallback.

## Initial cost guardrail

The initial Forever Professions budget is **USD 10 per month** across both stages,
with an operating target of **USD 0–5 per month** while traffic remains low. Configure
a monitoring-only monthly cost budget with:

- an actual-spend notification at 50%;
- an actual-spend notification at 80%;
- an actual-spend notification at 100%; and
- a forecasted-spend notification at 100%.

Notifications go to the primary operator. A budget is an alert threshold, not a hard
spending cap. No automatic shutdown action will be added initially because an
automated denial policy can interfere with recovery. The operator will review the
budget after the first full month and either keep it or record a new amount with
evidence from Cost Explorer.

The small starting budget is reasonable for the intended low-traffic serverless shape:
Aurora DSQL scales database activity to zero and includes monthly free usage, Lambda
has a monthly free tier, and CloudFront offers both free allowances and a free
flat-rate plan. This is a guardrail, not a promise that usage cannot exceed the budget.
Current pricing must be checked again before enabling a paid CloudFront plan or
materially increasing traffic:

- [Aurora DSQL pricing](https://aws.amazon.com/rds/aurora/dsql/pricing/)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [Amazon CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)

### Accepted cost controls

These controls are decisions for the implementation phases; they are not all applied
to the existing AWS deployment yet.

- Keep the staging pricing schedule disabled except for deliberate release or provider
  testing.
- Start the production pricing refresh at `rate(4 hours)`, not the current
  `rate(15 minutes)` default. A shorter interval requires cost and product evidence.
- Retain CloudWatch logs for 7 days in staging and 14 days in production.
- Use CloudFront's USD 0 flat-rate plan if it is compatible with the application and
  can be managed or reproducibly recorded by the deployment process. Otherwise remain
  on pay-as-you-go within its free allowance. Do not select a paid CloudFront plan for
  the initial launch.
- Expire noncurrent static-site object versions after 30 days. Do not apply this
  lifecycle to raw import snapshots, import audits, or release manifests.
- Keep custom DNS, paid WAF features, CloudWatch Synthetics, and multi-region resources
  deferred. Start with the existing security-headers policy, CloudFront protection,
  ordinary CloudWatch alarms, and a low-cost external health check.
- Keep staging idle outside deployment and migration validation. Do not run recurring
  imports or pricing refreshes there.

## Availability and recovery expectations

Forever Professions begins as a best-effort, single-region service. There is no public
availability SLA for the initial launch, no active-active region, and no requirement
for zero-downtime database schema changes beyond maintaining application compatibility.

| Component | Recovery-time target | Recovery-point target | Recovery source |
| --- | --- | --- | --- |
| Static site | 4 hours | Last successful release | Immutable build artifact plus versioned site bucket |
| API | 4 hours | Last successful release | Git commit, deployment manifest, and prior Lambda artifact |
| Catalog and comparison data | 8 hours | Last successfully audited immutable import | Versioned raw snapshot, migration ledger, source hashes, and import audit |
| Current pricing | 24 hours | Last successful refresh | Re-run the provider after containment; stale prices may remain visible with attribution |

Recovery rules:

- Keep the data stack termination-protected and all stateful removal policies retained.
- Preserve raw input snapshots, hashes, audit output, and release manifests.
- Roll back web and API artifacts independently of the database.
- Repair database changes forward; do not automate destructive schema downgrades.
- Disable the pricing schedule first when the provider or pricing writes misbehave.
- Revisit multi-region or stronger targets only after real usage justifies their cost
  and operational complexity.

## Phase 0 exit decision

Phase 0 is complete. The initial implementation proceeds with:

1. one AWS account and region with strict staging/production naming and bootstrap-role isolation;
2. the existing deployment preserved as staging;
3. a separately named production environment;
4. GitHub OIDC and a non-root operator identity as prerequisites;
5. CloudFront domains for the initial launch;
6. consistent ownership and cost-allocation tags;
7. a USD 10 monitoring budget with a USD 0–5 operating target;
8. explicit low-cost controls for schedules, logs, site versions, and edge delivery;
   and
9. best-effort single-region recovery targets backed by immutable releases and raw
   import snapshots.

Any change to these decisions should update this record and the cloud deployment
roadmap in the same pull request.
