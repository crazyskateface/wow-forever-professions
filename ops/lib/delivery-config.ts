import { DEPLOYMENT_ACCOUNT_ID, DEPLOYMENT_REGION } from "./deployment-config";

export const DELIVERY_STACK_NAME = "ForeverProfessionsDelivery";
export const DELIVERY_BUDGET_NAME = "ForeverProfessions-Monthly-10-USD";
export const DELIVERY_BUDGET_LIMIT_USD = 10;

export const GITHUB_OWNER = "crazyskateface";
export const GITHUB_OWNER_ID = "936134";
export const GITHUB_REPOSITORY_NAME = "wow-forever-professions";
export const GITHUB_REPOSITORY_ID = "1409583896";
export const GITHUB_REPOSITORY = `${GITHUB_OWNER}/${GITHUB_REPOSITORY_NAME}`;
export const GITHUB_OIDC_PROVIDER_URL =
  "https://token.actions.githubusercontent.com";
export const GITHUB_OIDC_CONDITION_PREFIX =
  "token.actions.githubusercontent.com";
export const GITHUB_OIDC_SUBJECT_PREFIX =
  `repo:${GITHUB_OWNER}@${GITHUB_OWNER_ID}/${GITHUB_REPOSITORY_NAME}@${GITHUB_REPOSITORY_ID}`;

export interface DeliveryStageConfig {
  readonly stage: "staging" | "production";
  readonly roleName: string;
  readonly roleArn: string;
  readonly applicationStackName: string;
  readonly dataStackName: string;
  readonly siteBucketArnPattern: string;
  readonly ingestionRoleArnPattern: string;
  readonly migrationRoleArnPattern?: string;
}

function roleArn(roleName: string): string {
  return `arn:aws:iam::${DEPLOYMENT_ACCOUNT_ID}:role/${roleName}`;
}

export const DELIVERY_STAGES: readonly DeliveryStageConfig[] = [
  {
    stage: "staging",
    roleName: "forever-professions-github-staging",
    roleArn: roleArn("forever-professions-github-staging"),
    applicationStackName: "ForeverProfessions",
    dataStackName: "ForeverProfessionsData",
    siteBucketArnPattern:
      "arn:aws:s3:::foreverprofessions-sitebucket397a1860-*",
    ingestionRoleArnPattern:
      `arn:aws:iam::${DEPLOYMENT_ACCOUNT_ID}:role/ForeverProfessionsData-IngestionRole-*`,
    migrationRoleArnPattern:
      `arn:aws:iam::${DEPLOYMENT_ACCOUNT_ID}:role/ForeverProfessionsData-MigrationRole-*`,
  },
  {
    stage: "production",
    roleName: "forever-professions-github-production",
    roleArn: roleArn("forever-professions-github-production"),
    applicationStackName: "ForeverProfessions-production",
    dataStackName: "ForeverProfessionsData-production",
    siteBucketArnPattern:
      "arn:aws:s3:::foreverprofessions-production-sitebucket397a1860-*",
    ingestionRoleArnPattern:
      `arn:aws:iam::${DEPLOYMENT_ACCOUNT_ID}:role/ForeverProfessionsData-production-IngestionRole-*`,
  },
] as const;

export const CDK_BOOTSTRAP_ROLE_ARNS = [
  "deploy-role",
  "file-publishing-role",
  "image-publishing-role",
  "lookup-role",
].map(
  (role) =>
    `arn:aws:iam::${DEPLOYMENT_ACCOUNT_ID}:role/cdk-hnb659fds-${role}-${DEPLOYMENT_ACCOUNT_ID}-${DEPLOYMENT_REGION}`,
);
