import {
  DEPLOYMENT_ACCOUNT_ID,
  DEPLOYMENT_REGION,
  getDeploymentConfig,
} from "./deployment-config";

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
  readonly branch: "stage" | "main";
  readonly roleName: string;
  readonly roleArn: string;
  readonly bootstrapQualifier: string;
  readonly cdkBootstrapRoleArns: readonly string[];
  readonly deploymentRoleName: string;
  readonly deploymentRoleArn: string;
  readonly cloudFormationExecutionRoleArn: string;
  readonly applicationStackName: string;
  readonly dataStackName: string;
  readonly siteBucketArnPattern: string;
  readonly ingestionRoleArnPattern: string;
  readonly migrationRoleArnPattern?: string;
}

function roleArn(roleName: string): string {
  return `arn:aws:iam::${DEPLOYMENT_ACCOUNT_ID}:role/${roleName}`;
}

function cdkBootstrapRoleArns(qualifier: string): readonly string[] {
  return [
    "file-publishing-role",
    "image-publishing-role",
    "lookup-role",
  ].map(
    (role) =>
      `arn:aws:iam::${DEPLOYMENT_ACCOUNT_ID}:role/cdk-${qualifier}-${role}-${DEPLOYMENT_ACCOUNT_ID}-${DEPLOYMENT_REGION}`,
  );
}

const staging = getDeploymentConfig("staging");
const production = getDeploymentConfig("production");

export const DELIVERY_STAGES: readonly DeliveryStageConfig[] = [
  {
    stage: "staging",
    branch: staging.branch,
    roleName: "forever-professions-github-staging",
    roleArn: roleArn("forever-professions-github-staging"),
    bootstrapQualifier: staging.bootstrapQualifier,
    cdkBootstrapRoleArns: cdkBootstrapRoleArns(staging.bootstrapQualifier),
    deploymentRoleName: staging.deploymentRoleName,
    deploymentRoleArn: staging.deploymentRoleArn,
    cloudFormationExecutionRoleArn:
      staging.cloudFormationExecutionRoleArn,
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
    branch: production.branch,
    roleName: "forever-professions-github-production",
    roleArn: roleArn("forever-professions-github-production"),
    bootstrapQualifier: production.bootstrapQualifier,
    cdkBootstrapRoleArns: cdkBootstrapRoleArns(production.bootstrapQualifier),
    deploymentRoleName: production.deploymentRoleName,
    deploymentRoleArn: production.deploymentRoleArn,
    cloudFormationExecutionRoleArn:
      production.cloudFormationExecutionRoleArn,
    applicationStackName: "ForeverProfessions-production",
    dataStackName: "ForeverProfessionsData-production",
    siteBucketArnPattern:
      "arn:aws:s3:::foreverprofessions-production-sitebucket397a1860-*",
    ingestionRoleArnPattern:
      `arn:aws:iam::${DEPLOYMENT_ACCOUNT_ID}:role/ForeverProfessionsData-production-IngestionRole-*`,
  },
] as const;
