import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import {
  applySqlMigrations,
  createAuroraDsqlTransactionRunner,
  loadSqlMigrations,
} from "../src/index.js";

const roleArnPattern = /^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]{1,512}$/;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const endpoint = requiredEnvironment("DSQL_ENDPOINT");
const region = requiredEnvironment("AWS_REGION");
const migrationRoleArn = requiredEnvironment("MIGRATION_ROLE_ARN");
if (!roleArnPattern.test(migrationRoleArn)) {
  throw new Error("MIGRATION_ROLE_ARN must be an IAM role ARN in the aws partition.");
}

const credentials = fromTemporaryCredentials({
  clientConfig: { region },
  params: {
    RoleArn: migrationRoleArn,
    RoleSessionName: "ForeverProfessionsMigration",
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
  const catalog = await applySqlMigrations(runner, {
    dialect: "aurora-dsql",
    scope: "catalog",
    migrations: await loadSqlMigrations(new URL("../sql/", import.meta.url)),
  });
  const pricing = await applySqlMigrations(runner, {
    dialect: "aurora-dsql",
    scope: "pricing",
    migrations: await loadSqlMigrations(new URL("../../pricing/sql/", import.meta.url)),
  });
  process.stdout.write(`${JSON.stringify({ catalog, pricing }, null, 2)}\n`);
} finally {
  await runner.end();
}
