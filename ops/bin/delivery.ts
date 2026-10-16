#!/usr/bin/env node
import { App, Tags, Validations } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import {
  DEPLOYMENT_ACCOUNT_ID,
  DEPLOYMENT_REGION,
} from "../lib/deployment-config";
import { DELIVERY_STACK_NAME } from "../lib/delivery-config";
import { ForeverProfessionsDeliveryStack } from "../lib/forever-professions-delivery-stack";

const app = new App();
const stack = new ForeverProfessionsDeliveryStack(app, DELIVERY_STACK_NAME, {
  env: {
    account: DEPLOYMENT_ACCOUNT_ID,
    region: DEPLOYMENT_REGION,
  },
  stackName: DELIVERY_STACK_NAME,
  description:
    "Forever Professions GitHub OIDC delivery identities and cost guardrail",
  terminationProtection: true,
});

for (const [key, value] of Object.entries({
  Application: "forever-professions",
  Environment: "shared",
  ManagedBy: "aws-cdk",
  Repository: "crazyskateface/wow-forever-professions",
  Owner: "crazyskateface",
  CostCenter: "personal-project",
})) {
  Tags.of(stack).add(key, value);
}

Validations.of(app).addPlugins(
  new AwsSolutionsChecks(app, {
    verbose: true,
    writeSuppressionsToCloudFormation: true,
  }),
);
