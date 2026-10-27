import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  createAuroraDsqlTransactionRunner,
  SqlRecipeChangeReader,
  SqlRecipeCatalogReader,
} from "@forever-professions/ingestion";
import { DsqlAuctionPricingRepository } from "@forever-professions/pricing";
import { routeRequest } from "./router.js";

const endpoint = process.env.DSQL_ENDPOINT?.trim();
const region = process.env.AWS_REGION?.trim();
const databaseRole =
  process.env.DATA_DATABASE_ROLE?.trim() ?? process.env.PRICING_DATABASE_ROLE?.trim();
const database =
  endpoint && region && databaseRole
    ? createAuroraDsqlTransactionRunner({
        host: endpoint,
        user: databaseRole,
        region,
        maxConnections: 3,
        idleTimeoutMilliseconds: 45_000,
      })
    : undefined;
const pricing = database ? new DsqlAuctionPricingRepository(database) : undefined;
const catalog = database ? new SqlRecipeCatalogReader(database) : undefined;
const changes = database ? new SqlRecipeChangeReader(database) : undefined;
const readiness = database
  ? async () => {
      await database.query("SELECT 1 AS ready");
    }
  : undefined;
const corsOrigin = process.env.API_CORS_ORIGIN?.trim();

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  let body: unknown;
  if (event.body !== undefined) {
    try {
      const decoded = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
      body = JSON.parse(decoded);
    } catch {
      body = undefined;
    }
  }
  return routeRequest(
    event.requestContext.http.method,
    event.rawPath,
    event.queryStringParameters ?? {},
    {
      ...(catalog === undefined ? {} : { catalog }),
      ...(changes === undefined ? {} : { changes }),
      ...(pricing === undefined ? {} : { pricing }),
      productEventSink(event) {
        console.info(JSON.stringify({
          event,
          receivedAt: new Date().toISOString(),
          type: "anonymous-product-event",
        }));
      },
      ...(readiness === undefined ? {} : { readiness }),
      ...(corsOrigin === undefined || corsOrigin.length === 0 ? {} : { corsOrigin }),
    },
    body,
  );
}
