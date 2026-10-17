import { DefaultStackSynthesizer } from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";

export const DEPLOYMENT_ACCOUNT_ID = "370979476195";
export const DEPLOYMENT_REGION = "us-east-1";

export const DEPLOYMENT_STAGES = ["staging", "production"] as const;

export type DeploymentStage = (typeof DEPLOYMENT_STAGES)[number];

export interface DeploymentConfig {
  readonly stage: DeploymentStage;
  readonly branch: "stage" | "main";
  readonly account: string;
  readonly region: string;
  readonly bootstrapQualifier: string;
  readonly bootstrapStackName: string;
  readonly deploymentRoleName: string;
  readonly deploymentRoleArn: string;
  readonly cloudFormationExecutionRoleArn: string;
  readonly dataStackId: string;
  readonly dataStackName: string;
  readonly dataStackDescription: string;
  readonly applicationStackId: string;
  readonly applicationStackName: string;
  readonly applicationStackDescription: string;
  readonly dataClusterEndpointParameterName: string;
  readonly dataClusterIdentifierParameterName: string;
  readonly auctionRefreshScheduleName: string;
  readonly auctionRefreshSource: string;
  readonly logRetention: logs.RetentionDays;
  readonly tags: Readonly<Record<string, string>>;
}

const commonTags = {
  Application: "forever-professions",
  ManagedBy: "aws-cdk",
  Repository: "crazyskateface/wow-forever-professions",
  Owner: "crazyskateface",
  CostCenter: "personal-project",
} as const;

function roleArn(roleName: string): string {
  return `arn:aws:iam::${DEPLOYMENT_ACCOUNT_ID}:role/${roleName}`;
}

function cloudFormationExecutionRoleArn(qualifier: string): string {
  return roleArn(
    `cdk-${qualifier}-cfn-exec-role-${DEPLOYMENT_ACCOUNT_ID}-${DEPLOYMENT_REGION}`,
  );
}

const deploymentConfigs: Record<DeploymentStage, DeploymentConfig> = {
  staging: {
    stage: "staging",
    branch: "stage",
    account: DEPLOYMENT_ACCOUNT_ID,
    region: DEPLOYMENT_REGION,
    bootstrapQualifier: "fpstage",
    bootstrapStackName: "CDKToolkit-fpstage",
    deploymentRoleName: "forever-professions-cdk-deploy-staging",
    deploymentRoleArn: roleArn("forever-professions-cdk-deploy-staging"),
    cloudFormationExecutionRoleArn:
      cloudFormationExecutionRoleArn("fpstage"),
    dataStackId: "ForeverProfessionsData",
    dataStackName: "ForeverProfessionsData",
    dataStackDescription: "Forever Professions retained Phase 2 data foundation",
    applicationStackId: "ForeverProfessions",
    applicationStackName: "ForeverProfessions",
    applicationStackDescription: "Forever Professions web application and API",
    dataClusterEndpointParameterName: "/forever-professions/data/dsql-endpoint",
    dataClusterIdentifierParameterName: "/forever-professions/data/dsql-identifier",
    auctionRefreshScheduleName: "forever-professions-auction-refresh",
    auctionRefreshSource: "forever-professions.schedule",
    logRetention: logs.RetentionDays.ONE_WEEK,
    tags: { ...commonTags, Environment: "staging" },
  },
  production: {
    stage: "production",
    branch: "main",
    account: DEPLOYMENT_ACCOUNT_ID,
    region: DEPLOYMENT_REGION,
    bootstrapQualifier: "fpprod",
    bootstrapStackName: "CDKToolkit-fpprod",
    deploymentRoleName: "forever-professions-cdk-deploy-production",
    deploymentRoleArn: roleArn("forever-professions-cdk-deploy-production"),
    cloudFormationExecutionRoleArn:
      cloudFormationExecutionRoleArn("fpprod"),
    dataStackId: "ForeverProfessionsDataProduction",
    dataStackName: "ForeverProfessionsData-production",
    dataStackDescription: "Forever Professions production retained data foundation",
    applicationStackId: "ForeverProfessionsProduction",
    applicationStackName: "ForeverProfessions-production",
    applicationStackDescription:
      "Forever Professions production web application and API",
    dataClusterEndpointParameterName:
      "/forever-professions/production/data/dsql-endpoint",
    dataClusterIdentifierParameterName:
      "/forever-professions/production/data/dsql-identifier",
    auctionRefreshScheduleName:
      "forever-professions-production-auction-refresh",
    auctionRefreshSource: "forever-professions.production.schedule",
    logRetention: logs.RetentionDays.TWO_WEEKS,
    tags: { ...commonTags, Environment: "production" },
  },
};

export function parseDeploymentStage(value: unknown): DeploymentStage {
  if (value === "staging" || value === "production") {
    return value;
  }

  throw new Error(
    `Unsupported deployment stage ${JSON.stringify(value)}. Expected staging or production.`,
  );
}

export function getDeploymentConfig(stage: DeploymentStage): DeploymentConfig {
  return deploymentConfigs[stage];
}

export function createDeploymentSynthesizer(
  deployment: DeploymentConfig,
): DefaultStackSynthesizer {
  return new DefaultStackSynthesizer({
    qualifier: deployment.bootstrapQualifier,
    deployRoleArn: deployment.deploymentRoleArn,
    cloudFormationExecutionRole:
      deployment.cloudFormationExecutionRoleArn,
  });
}
