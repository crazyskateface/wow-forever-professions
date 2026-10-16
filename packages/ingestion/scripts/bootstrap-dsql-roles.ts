import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import {
  configureDsqlDatabaseRoles,
  createAuroraDsqlTransactionRunner,
} from "../src/index.js";

const roleArnPattern = /^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]{1,512}$/;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredRoleArn(name: string): string {
  const value = requiredEnvironment(name);
  if (!roleArnPattern.test(value)) throw new Error(`${name} must be an IAM role ARN.`);
  return value;
}

const endpoint = requiredEnvironment("DSQL_ENDPOINT");
const region = requiredEnvironment("AWS_REGION");
const migrationRoleArn = requiredRoleArn("MIGRATION_ROLE_ARN");
const credentials = fromTemporaryCredentials({
  clientConfig: { region },
  params: {
    RoleArn: migrationRoleArn,
    RoleSessionName: "ForeverProfessionsRoleBootstrap",
  },
});
const runner = createAuroraDsqlTransactionRunner({
  host: endpoint,
  user: "admin",
  region,
  credentials,
  maxConnections: 2,
});

try {
  const result = await configureDsqlDatabaseRoles(runner, {
    ingestionRoleArn: requiredRoleArn("INGESTION_ROLE_ARN"),
    applicationReaderRoleArn: requiredRoleArn("APPLICATION_READER_ROLE_ARN"),
    pricingWriterRoleArn: requiredRoleArn("PRICING_WRITER_ROLE_ARN"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await runner.end();
}
