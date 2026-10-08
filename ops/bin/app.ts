#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { ForeverProfessionsStack } from "../lib/forever-professions-stack";

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;

new ForeverProfessionsStack(app, "ForeverProfessions", {
  env: account && region ? { account, region } : undefined,
  description: "Forever Professions application and versioned data foundation",
});
