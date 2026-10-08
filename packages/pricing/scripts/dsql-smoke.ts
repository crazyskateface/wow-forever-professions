import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import type { AuctionPriceObservation } from "@forever-professions/contracts";
import {
  createAuroraDsqlTransactionRunner,
  type ClosableTransactionRunner,
  type SqlQueryResult,
  type TransactionRunner,
} from "@forever-professions/ingestion";
import { DsqlAuctionPricingRepository } from "../src/index.js";

const writerDatabaseRole = "forever_professions_pricing_writer";
const readerDatabaseRole = "forever_professions_pricing_reader";
const roleArnPattern = /^arn:aws:iam::(\d{12}):role\/[A-Za-z0-9+=,.@_/-]{1,512}$/;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalRoleArn(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!roleArnPattern.test(value)) throw new Error(`${name} must be an IAM role ARN.`);
  return value;
}

async function executeOne(
  runner: TransactionRunner,
  sql: string,
  values?: readonly unknown[],
): Promise<SqlQueryResult> {
  return runner.transaction((database) => database.query(sql, values));
}

async function applySchema(runner: ClosableTransactionRunner): Promise<number> {
  const directory = fileURLToPath(new URL("../sql/", import.meta.url));
  const migrations = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    const sql = await readFile(new URL(`../sql/${file}`, import.meta.url), "utf8");
    const result = await executeOne(runner, sql);
    const jobId = result.rows[0]?.job_id;
    if (typeof jobId === "string" && jobId.length > 0) {
      const wait = await runner.query("CALL sys.wait_for_job($1)", [jobId]);
      const completed = Object.values(wait.rows[0] ?? {}).find(
        (value): value is boolean => typeof value === "boolean",
      );
      if (completed === false) throw new Error(`Migration ${file} did not complete.`);
    }
  }
  return migrations.length;
}

async function ensureDatabaseRole(
  runner: TransactionRunner,
  databaseRole: string,
): Promise<void> {
  const role = await executeOne(
    runner,
    "SELECT 1 AS found FROM pg_roles WHERE rolname = $1",
    [databaseRole],
  );
  if (role.rowCount === 0) await executeOne(runner, `CREATE ROLE ${databaseRole} WITH LOGIN`);
}

async function ensureRoleMapping(
  runner: TransactionRunner,
  databaseRole: string,
  roleArn: string,
): Promise<void> {
  if (!roleArnPattern.test(roleArn)) throw new Error("IAM role ARN is invalid.");
  const mapping = await executeOne(
    runner,
    "SELECT 1 AS found FROM sys.iam_pg_role_mappings WHERE pg_role_name = $1 AND arn = $2",
    [databaseRole, roleArn],
  );
  if (mapping.rowCount === 0) {
    await executeOne(runner, `AWS IAM GRANT ${databaseRole} TO '${roleArn}'`);
  }
}

async function configureRoles(
  runner: TransactionRunner,
  writerRoleArns: readonly string[],
  readerRoleArn?: string,
): Promise<void> {
  await ensureDatabaseRole(runner, writerDatabaseRole);
  for (const roleArn of writerRoleArns) {
    await ensureRoleMapping(runner, writerDatabaseRole, roleArn);
  }
  await executeOne(runner, `GRANT SELECT ON item TO ${writerDatabaseRole}`);
  await executeOne(
    runner,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON auction_market, auction_price_current TO ${writerDatabaseRole}`,
  );

  if (readerRoleArn !== undefined) {
    await ensureDatabaseRole(runner, readerDatabaseRole);
    await ensureRoleMapping(runner, readerDatabaseRole, readerRoleArn);
    await executeOne(
      runner,
      `GRANT SELECT ON auction_market, auction_price_current TO ${readerDatabaseRole}`,
    );
  }
}

async function main(): Promise<void> {
  const endpoint = requiredEnvironment("DSQL_ENDPOINT");
  const region = requiredEnvironment("AWS_REGION");
  const workerRoleArn = requiredEnvironment("PRICING_WRITER_ROLE_ARN");
  const testRoleArn = requiredEnvironment("PRICING_TEST_ROLE_ARN");
  const readerRoleArn = optionalRoleArn("PRICING_READER_ROLE_ARN");
  for (const roleArn of [workerRoleArn, testRoleArn]) {
    if (!roleArnPattern.test(roleArn)) throw new Error("Pricing writer role ARN is invalid.");
  }

  const admin = createAuroraDsqlTransactionRunner({
    host: endpoint,
    user: "admin",
    region,
    maxConnections: 2,
  });
  let migrationsApplied: number;
  try {
    migrationsApplied = await applySchema(admin);
    await configureRoles(admin, [workerRoleArn, testRoleArn], readerRoleArn);
  } finally {
    await admin.end();
  }

  const credentials = fromTemporaryCredentials({
    clientConfig: { region },
    params: { RoleArn: testRoleArn, RoleSessionName: "ForeverProfessionsPricingTest" },
  });
  const writer = createAuroraDsqlTransactionRunner({
    host: endpoint,
    user: writerDatabaseRole,
    region,
    credentials,
    maxConnections: 2,
  });
  try {
    const repository = new DsqlAuctionPricingRepository(writer);
    const market = {
      id: "forever.pvp.horde.us",
      provider: "ah-ledger" as const,
      game: "forever",
      ruleset: "pvp",
      faction: "horde",
      region: "us",
      label: "Forever PvP Horde US",
    };
    const fetchedAt = new Date().toISOString();
    const observations: readonly AuctionPriceObservation[] = [
      {
        provider: "ah-ledger",
        marketId: market.id,
        gameItemId: 2589,
        status: "available",
        observedAt: fetchedAt,
        fetchedAt,
        medianUnitPriceCopper: 37,
        minimumBuyoutUnitPriceCopper: 26,
        quantity: 1,
        attribution: { text: "Prices from AHledger", url: "https://ahledger.com/" },
      },
      {
        provider: "ah-ledger",
        marketId: market.id,
        gameItemId: 2592,
        status: "unavailable",
        fetchedAt,
        reason: "no-market-data",
        attribution: { text: "Prices from AHledger", url: "https://ahledger.com/" },
      },
    ];
    await repository.upsertMarkets([market], fetchedAt);
    await repository.upsertCurrentPrices(observations);
    await repository.upsertCurrentPrices(observations);
    const stored = await repository.getCurrentPrices({
      marketId: market.id,
      gameItemIds: observations.map(({ gameItemId }) => gameItemId),
    });
    if (stored.length !== observations.length) {
      throw new Error("The live pricing store did not return complete coverage.");
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          migrationsApplied,
          markets: (await repository.listMarkets()).length,
          observations: stored.length,
          readerRoleConfigured: readerRoleArn !== undefined,
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
