import { App, Tags } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { getDeploymentConfig, type DeploymentStage } from "../lib/deployment-config";
import { ForeverProfessionsDataStack } from "../lib/forever-professions-data-stack";
import { ForeverProfessionsStack } from "../lib/forever-professions-stack";

function createStacks(stage: DeploymentStage) {
  const app = new App();
  const deployment = getDeploymentConfig(stage);
  const env = { account: deployment.account, region: deployment.region };
  for (const [key, value] of Object.entries(deployment.tags)) {
    Tags.of(app).add(key, value);
  }
  const dataStack = new ForeverProfessionsDataStack(
    app,
    deployment.dataStackId,
    {
      deployment,
      env,
      stackName: deployment.dataStackName,
      terminationProtection: true,
    },
  );
  const applicationStack = new ForeverProfessionsStack(
    app,
    deployment.applicationStackId,
    {
      deployment,
      env,
      stackName: deployment.applicationStackName,
      terminationProtection: true,
    },
  );
  applicationStack.addStackDependency(dataStack);

  return { applicationStack, dataStack, deployment };
}

describe("Forever Professions stacks", () => {
  it("keeps the staging stateful logical IDs stable", () => {
    const { applicationStack, dataStack } = createStacks("staging");
    const dataResources = Template.fromStack(dataStack).toJSON().Resources;
    const applicationResources =
      Template.fromStack(applicationStack).toJSON().Resources;

    expect(dataResources).toHaveProperty("RawDataBucket57F26C03");
    expect(dataResources).toHaveProperty("DataCluster");
    expect(applicationResources).toHaveProperty("SiteBucket397A1860");
    expect(applicationResources).toHaveProperty("Distribution830FAC52");
  });

  it.each([
    ["staging", 7],
    ["production", 14],
  ] as const)("uses the %s log-retention policy", (stage, retentionDays) => {
    const { applicationStack, dataStack } = createStacks(stage);

    Template.fromStack(dataStack).hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: retentionDays,
    });
    Template.fromStack(applicationStack).hasResourceProperties(
      "AWS::Logs::LogGroup",
      { RetentionInDays: retentionDays },
    );
  });

  it("uses production-qualified shared names", () => {
    const { dataStack, deployment } = createStacks("production");
    const template = Template.fromStack(dataStack);

    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: deployment.dataClusterEndpointParameterName,
    });
    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: deployment.dataClusterIdentifierParameterName,
    });
    template.hasResourceProperties("AWS::Scheduler::Schedule", {
      Name: deployment.auctionRefreshScheduleName,
    });
  });

  it("tags resources for ownership, stage, and cost allocation", () => {
    const { dataStack } = createStacks("production");
    const resources = Template.fromStack(dataStack).toJSON().Resources;
    const clusterTags = resources.DataCluster.Properties.Tags;

    expect(clusterTags).toEqual(
      expect.arrayContaining([
        { Key: "Application", Value: "forever-professions" },
        { Key: "Environment", Value: "production" },
        { Key: "ManagedBy", Value: "aws-cdk" },
        { Key: "Owner", Value: "crazyskateface" },
        { Key: "CostCenter", Value: "personal-project" },
      ]),
    );
  });

  it("protects both stacks from accidental deletion", () => {
    const { applicationStack, dataStack } = createStacks("production");

    expect(dataStack.terminationProtection).toBe(true);
    expect(applicationStack.terminationProtection).toBe(true);
  });

  it("exports the values needed by the web release", () => {
    const { applicationStack } = createStacks("production");
    const outputs = Template.fromStack(applicationStack).toJSON().Outputs;

    expect(outputs).toHaveProperty("WebUrl");
    expect(outputs).toHaveProperty("ApiUrl");
    expect(outputs).toHaveProperty("SiteBucketName");
    expect(outputs).toHaveProperty("DistributionId");
    expect(outputs).toHaveProperty("DistributionDomainName");
  });

  it("exports scoped data-plane roles", () => {
    const { dataStack } = createStacks("staging");
    const outputs = Template.fromStack(dataStack).toJSON().Outputs;

    expect(outputs).toHaveProperty("IngestionRoleArn");
    expect(outputs).toHaveProperty("MigrationRoleArn");
    expect(outputs).toHaveProperty("PricingWorkerRoleArn");
  });
});
