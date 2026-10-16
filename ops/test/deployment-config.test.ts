import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_ACCOUNT_ID,
  DEPLOYMENT_REGION,
  getDeploymentConfig,
  parseDeploymentStage,
} from "../lib/deployment-config";

describe("deployment configuration", () => {
  it("preserves the existing staging compatibility boundary", () => {
    const config = getDeploymentConfig("staging");

    expect(config).toMatchObject({
      account: DEPLOYMENT_ACCOUNT_ID,
      region: DEPLOYMENT_REGION,
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
  });

  it("rejects unknown stages instead of silently targeting staging", () => {
    expect(() => parseDeploymentStage("preview")).toThrow(
      "Expected staging or production",
    );
  });
});
