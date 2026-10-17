import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import {
  createAuroraDsqlTransactionRunner,
  createS3RawDatasetStore,
  ingestBuildDataset,
  normalizeBuildDataset,
  parseBuildImportScriptArguments,
  parseRawDatasetBytes,
} from "../src/index.js";

const databaseRole = "forever_professions_ingestion";
const roleArnPattern = /^arn:aws:iam::(\d{12}):role\/[A-Za-z0-9+=,.@_/-]{1,512}$/;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main(): Promise<void> {
  const { inputPath, compareAgainst } = parseBuildImportScriptArguments(
    process.argv.slice(2),
  );

  const endpoint = requiredEnvironment("DSQL_ENDPOINT");
  const region = requiredEnvironment("AWS_REGION");
  const rawBucket = requiredEnvironment("RAW_DATA_BUCKET");
  const ingestionRoleArn = requiredEnvironment("INGESTION_ROLE_ARN");
  const accountId = roleArnPattern.exec(ingestionRoleArn)?.[1];
  if (!accountId) throw new Error("INGESTION_ROLE_ARN must be an IAM role ARN in the aws partition.");

  const invocationDirectory = process.env.INIT_CWD
    ? resolve(process.env.INIT_CWD)
    : process.cwd();
  const absoluteInputPath = resolve(invocationDirectory, inputPath);
  const rawBytes = await readFile(absoluteInputPath);
  const comparisonBase = compareAgainst
    ? normalizeBuildDataset(
        parseRawDatasetBytes(
          await readFile(resolve(invocationDirectory, compareAgainst.path)),
        ),
      )
    : undefined;
  parseRawDatasetBytes(rawBytes);

  const credentials = fromTemporaryCredentials({
    clientConfig: { region },
    params: {
      RoleArn: ingestionRoleArn,
      RoleSessionName: "ForeverProfessionsClientDataImport",
    },
  });
  const writer = createAuroraDsqlTransactionRunner({
    host: endpoint,
    user: databaseRole,
    region,
    credentials,
  });
  const rawStore = createS3RawDatasetStore({
    bucket: rawBucket,
    region,
    credentials,
    expectedBucketOwner: accountId,
  });

  try {
    const result = await ingestBuildDataset({
      rawBytes,
      rawStore,
      transactionRunner: writer,
      ...(comparisonBase === undefined || compareAgainst === undefined
        ? {}
        : {
            compareAgainst: [
              { build: comparisonBase, comparisonType: compareAgainst.comparisonType },
            ],
          }),
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          sourceFile: absoluteInputPath,
          buildId: result.buildId,
          rawObjectKey: result.rawObjectKey,
          rawObjectStatus: result.rawObjectStatus,
          batches: result.batches,
          comparisons: result.comparisons,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await writer.end();
  }
}

await main();
