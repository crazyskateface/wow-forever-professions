import { App, DefaultStackSynthesizer, Stack } from "aws-cdk-lib";
import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_ACCOUNT_ID,
  DEPLOYMENT_REGION,
  createDeploymentSynthesizer,
  getDeploymentConfig,
  parseDeploymentStage,
} from "../lib/deployment-config";

describe("deployment configuration", () => {
  it("preserves the existing staging compatibility boundary", () => {
    const config = getDeploymentConfig("staging");

    expect(config).toMatchObject({
      account: DEPLOYMENT_ACCOUNT_ID,
      region: DEPLOYMENT_REGION,
      branch: "stage",
      bootstrapQualifier: "fpstage",
      bootstrapStackName: "CDKToolkit-fpstage",
      deploymentRoleName: "forever-professions-cdk-deploy-staging",
      cloudFormationExecutionRoleArn:
        "arn:aws:iam::370979476195:role/cdk-fpstage-cfn-exec-role-370979476195-us-east-1",
      dataStackId: "ForeverProfessionsData",
      dataStackName: "ForeverProfessionsData",
      applicationStackId: "ForeverProfessions",
      applicationStackName: "ForeverProfessions",
      dataClusterEndpointParameterName:
        "/forever-professions/data/dsql-endpoint",
      dataClusterIdentifierParameterName:
        "/forever-professions/data/dsql-identifier",
      auctionRefreshScheduleName: "forever-professions-auction-refresh",
      tags: expect.objectContaining({ Environment: "staging" }),
    });
  });

  it("isolates production names from staging", () => {
    const staging = getDeploymentConfig("staging");
    const production = getDeploymentConfig("production");

    expect(production.dataStackName).not.toBe(staging.dataStackName);
    expect(production.applicationStackName).not.toBe(
      staging.applicationStackName,
    );
    expect(production.dataClusterEndpointParameterName).not.toBe(
      staging.dataClusterEndpointParameterName,
    );
    expect(production.dataClusterIdentifierParameterName).not.toBe(
      staging.dataClusterIdentifierParameterName,
    );
    expect(production.auctionRefreshScheduleName).not.toBe(
      staging.auctionRefreshScheduleName,
    );
    expect(production.tags.Environment).toBe("production");
    expect(production.branch).toBe("main");
    expect(production.bootstrapQualifier).toBe("fpprod");
    expect(production.bootstrapStackName).toBe("CDKToolkit-fpprod");
    expect(production.bootstrapQualifier).not.toBe(staging.bootstrapQualifier);
    expect(production.deploymentRoleArn).not.toBe(
      staging.deploymentRoleArn,
    );
    expect(production.cloudFormationExecutionRoleArn).not.toBe(
      staging.cloudFormationExecutionRoleArn,
    );
  });

  it("synthesizes each stage against its isolated bootstrap resources", () => {
    for (const stage of ["staging", "production"] as const) {
      const deployment = getDeploymentConfig(stage);
      const stack = new Stack(new App(), `Test${stage}`, {
        env: { account: deployment.account, region: deployment.region },
        synthesizer: createDeploymentSynthesizer(deployment),
      });
      expect(stack.synthesizer.bootstrapQualifier).toBe(
        deployment.bootstrapQualifier,
      );
      expect(stack.synthesizer).toBeInstanceOf(DefaultStackSynthesizer);
      const synthesizer = stack.synthesizer as DefaultStackSynthesizer;
      expect(synthesizer.deployRoleArn).toBe(
        deployment.deploymentRoleArn,
      );
      expect(synthesizer.cloudFormationExecutionRoleArn).toBe(
        deployment.cloudFormationExecutionRoleArn,
      );
    }
  });

  it("rejects unknown stages instead of silently targeting staging", () => {
    expect(() => parseDeploymentStage("preview")).toThrow(
      "Expected staging or production",
    );
  });
});
