#!/usr/bin/env node
import { App, Tags, Validations } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { ForeverProfessionsDataStack } from "../lib/forever-professions-data-stack";
import { ForeverProfessionsStack } from "../lib/forever-professions-stack";
import {
  createDeploymentSynthesizer,
  getDeploymentConfig,
  parseDeploymentStage,
} from "../lib/deployment-config";

const app = new App();
const contextStage = app.node.tryGetContext("stage") as unknown;
const environmentStage = process.env.DEPLOYMENT_STAGE;

if (
  contextStage !== undefined &&
  environmentStage !== undefined &&
  contextStage !== environmentStage
) {
  throw new Error(
    `CDK context stage ${JSON.stringify(contextStage)} conflicts with DEPLOYMENT_STAGE ${JSON.stringify(environmentStage)}.`,
  );
}

const stage = parseDeploymentStage(
  contextStage ?? environmentStage ?? "staging",
);
const deployment = getDeploymentConfig(stage);
const env = { account: deployment.account, region: deployment.region };

for (const [key, value] of Object.entries(deployment.tags)) {
  Tags.of(app).add(key, value);
}

const dataStack = new ForeverProfessionsDataStack(app, deployment.dataStackId, {
  env,
  stackName: deployment.dataStackName,
  description: deployment.dataStackDescription,
  terminationProtection: true,
  deployment,
  synthesizer: createDeploymentSynthesizer(deployment),
});

const applicationStack = new ForeverProfessionsStack(
  app,
  deployment.applicationStackId,
  {
    env,
    stackName: deployment.applicationStackName,
    description: deployment.applicationStackDescription,
    terminationProtection: true,
    deployment,
    synthesizer: createDeploymentSynthesizer(deployment),
  },
);
applicationStack.addStackDependency(dataStack);

Validations.of(app).addPlugins(
  new AwsSolutionsChecks(app, {
    verbose: true,
    writeSuppressionsToCloudFormation: true,
  }),
);
