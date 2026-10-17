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

  it("limits the API runtime to the application reader and its exact DSQL cluster", () => {
    const { applicationStack } = createStacks("staging");
    const resources = Template.fromStack(applicationStack).toJSON().Resources as Record<
      string,
      { Type: string; Properties?: Record<string, unknown> }
    >;
    const functions = Object.values(resources).filter(
      ({ Type }) => Type === "AWS::Lambda::Function",
    );
    const apiFunction = functions.find((resource) => {
      const variables = (resource.Properties?.Environment as {
        Variables?: Record<string, unknown>;
      } | undefined)?.Variables;
      return variables?.DATA_DATABASE_ROLE === "forever_professions_application_reader";
    });
    expect(apiFunction).toBeDefined();

    const dsqlStatements = Object.values(resources)
      .filter(({ Type }) => Type === "AWS::IAM::Policy")
      .flatMap((resource) => {
        const policyDocument = resource.Properties?.PolicyDocument as {
          Statement?: readonly Record<string, unknown>[];
        } | undefined;
        return policyDocument?.Statement ?? [];
      })
      .filter(({ Action }) =>
        Array.isArray(Action)
          ? Action.includes("dsql:DbConnect")
          : Action === "dsql:DbConnect",
      );

    expect(dsqlStatements).toHaveLength(1);
    expect(dsqlStatements[0]).toMatchObject({
      Action: "dsql:DbConnect",
      Effect: "Allow",
    });
    expect(JSON.stringify(dsqlStatements[0]?.Resource)).toContain(
      ":dsql:us-east-1:370979476195:cluster/",
    );
    expect(dsqlStatements[0]?.Resource).not.toBe("*");
  });

  it("keeps wildcard CORS in staging and removes it from production", () => {
    const stagingResources = Template.fromStack(
      createStacks("staging").applicationStack,
    ).toJSON().Resources as Record<
      string,
      { Type: string; Properties?: Record<string, unknown> }
    >;
    const stagingApi = Object.values(stagingResources).find(
      ({ Type }) => Type === "AWS::ApiGatewayV2::Api",
    );
    expect(stagingApi?.Properties?.CorsConfiguration).toMatchObject({
      AllowOrigins: ["*"],
    });

    const productionResources = Template.fromStack(
      createStacks("production").applicationStack,
    ).toJSON().Resources as Record<
      string,
      { Type: string; Properties?: Record<string, unknown> }
    >;
    const productionApi = Object.values(productionResources).find(
      ({ Type }) => Type === "AWS::ApiGatewayV2::Api",
    );
    expect(productionApi?.Properties?.CorsConfiguration).toBeUndefined();

    const productionFunctions = Object.values(productionResources).filter(
      ({ Type }) => Type === "AWS::Lambda::Function",
    );
    const applicationFunction = productionFunctions.find((resource) => {
      const variables = (resource.Properties?.Environment as {
        Variables?: Record<string, unknown>;
      } | undefined)?.Variables;
      return variables?.DATA_DATABASE_ROLE === "forever_professions_application_reader";
    });
    const variables = (applicationFunction?.Properties?.Environment as {
      Variables?: Record<string, unknown>;
    } | undefined)?.Variables;
    expect(variables).not.toHaveProperty("API_CORS_ORIGIN");
  });

  it("keeps SPA rewrites out of the API behavior", () => {
    const resources = Template.fromStack(
      createStacks("staging").applicationStack,
    ).toJSON().Resources as Record<
      string,
      { Type: string; Properties?: Record<string, unknown> }
    >;
    const distribution = Object.values(resources).find(
      ({ Type }) => Type === "AWS::CloudFront::Distribution",
    );
    const config = distribution?.Properties?.DistributionConfig as {
      CustomErrorResponses?: unknown;
      DefaultCacheBehavior?: { FunctionAssociations?: unknown };
      CacheBehaviors?: readonly {
        PathPattern?: string;
        FunctionAssociations?: unknown;
      }[];
    } | undefined;

    expect(config?.CustomErrorResponses).toBeUndefined();
    expect(config?.DefaultCacheBehavior?.FunctionAssociations).toBeDefined();
    expect(config?.CacheBehaviors?.find(({ PathPattern }) => PathPattern === "api/*"))
      .not.toHaveProperty("FunctionAssociations");
  });
});
