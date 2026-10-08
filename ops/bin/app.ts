#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { ForeverProfessionsDataStack } from "../lib/forever-professions-data-stack";
import { ForeverProfessionsStack } from "../lib/forever-professions-stack";

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;

const dataStack = new ForeverProfessionsDataStack(app, "ForeverProfessionsData", {
  env: account && region ? { account, region } : undefined,
  description: "Forever Professions retained Phase 2 data foundation",
  terminationProtection: true,
});

const applicationStack = new ForeverProfessionsStack(app, "ForeverProfessions", {
  env: account && region ? { account, region } : undefined,
  description: "Forever Professions web application and API",
});
applicationStack.addStackDependency(dataStack);
