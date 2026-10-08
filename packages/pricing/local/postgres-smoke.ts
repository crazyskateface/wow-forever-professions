import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import type { AuctionPriceObservation } from "@forever-professions/contracts";
import type {
  SqlExecutor,
  SqlQueryResult,
  TransactionRunner,
} from "@forever-professions/ingestion";
import { DsqlAuctionPricingRepository } from "../src/index.js";

const defaultConnectionUrl =
  "postgresql://forever_professions:local-only@127.0.0.1:55432/forever_professions_local";

function localConnectionUrl(): string {
  const value = process.env.LOCAL_DATABASE_URL ?? defaultConnectionUrl;
  const parsed = new URL(value);
  if (
    !new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname) ||
    parsed.pathname !== "/forever_professions_local"
  ) {
    throw new Error("The pricing smoke test only connects to forever_professions_local on localhost.");
  }
  return value;
}

function executor(client: PoolClient): SqlExecutor {
  return {
    async query(sql, values): Promise<SqlQueryResult> {
      const result = await client.query(sql, values === undefined ? [] : [...values]);
      return { rowCount: result.rowCount, rows: result.rows };
    },
  };
}

function runner(pool: Pool): TransactionRunner {
  return {
    async transaction<T>(work: (database: SqlExecutor) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(executor(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function applyDirectory(pool: Pool, relativeDirectory: string): Promise<number> {
  const directory = fileURLToPath(new URL(relativeDirectory, import.meta.url));
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const source = await readFile(new URL(`${relativeDirectory}/${file}`, import.meta.url), "utf8");
    await pool.query(source.replace("CREATE INDEX ASYNC", "CREATE INDEX"));
  }
  return files.length;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: localConnectionUrl(), max: 3 });
  try {
    const phase2Migrations = await applyDirectory(pool, "../../ingestion/sql");
    const phase3Migrations = await applyDirectory(pool, "../sql");
    await pool.query(
      "INSERT INTO item (item_id, game_id, name) VALUES ($1, $2, $3), ($4, $5, $6) ON CONFLICT DO NOTHING",
      ["pricing-local-linen", 2589, "Linen Cloth", "pricing-local-wool", 2592, "Wool Cloth"],
    );

    const repository = new DsqlAuctionPricingRepository(runner(pool), {
      maximumRows: 100,
      maximumBytes: 1024 * 1024,
    });
    const market = {
      id: "forever.pvp.horde.us",
      provider: "ah-ledger" as const,
      game: "forever",
      ruleset: "pvp",
      faction: "horde",
      region: "us",
      label: "Forever PvP Horde US",
    };
    await repository.upsertMarkets([market], "2026-10-08T06:00:00.000Z");

    const initial: readonly AuctionPriceObservation[] = [
      {
        provider: "ah-ledger",
        marketId: market.id,
        gameItemId: 2589,
        status: "available",
        observedAt: "2026-10-08T05:55:00.000Z",
        fetchedAt: "2026-10-08T06:00:00.000Z",
        medianUnitPriceCopper: 37,
        minimumBuyoutUnitPriceCopper: 26,
        quantity: 8757,
        attribution: { text: "Prices from AHledger", url: "https://ahledger.com/" },
      },
      {
        provider: "ah-ledger",
        marketId: market.id,
        gameItemId: 2592,
        status: "unavailable",
        fetchedAt: "2026-10-08T06:00:00.000Z",
        reason: "no-market-data",
        attribution: { text: "Prices from AHledger", url: "https://ahledger.com/" },
      },
    ];
    await repository.upsertCurrentPrices(initial);
    await repository.upsertCurrentPrices([
      {
        provider: "ah-ledger",
        marketId: market.id,
        gameItemId: 2589,
        status: "unavailable",
        fetchedAt: "2026-10-08T05:00:00.000Z",
        reason: "no-market-data",
      },
    ]);

    const observations = await repository.getCurrentPrices({
      marketId: market.id,
      gameItemIds: [2589, 2592],
    });
    if (observations[0]?.status !== "available") {
      throw new Error("A stale observation replaced the current available price.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          migrationsApplied: phase2Migrations + phase3Migrations,
          markets: (await repository.listMarkets()).length,
          observations: observations.length,
          trackedItems: (await repository.listTrackedGameItemIds()).filter((id) =>
            [2589, 2592].includes(id),
          ),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await pool.end();
  }
}

await main();
