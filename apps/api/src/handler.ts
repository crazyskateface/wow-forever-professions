import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { createAuroraDsqlTransactionRunner } from "@forever-professions/ingestion";
import { DsqlAuctionPricingRepository } from "@forever-professions/pricing";
import { routeRequest } from "./router.js";

const endpoint = process.env.DSQL_ENDPOINT?.trim();
const region = process.env.AWS_REGION?.trim();
const databaseRole = process.env.PRICING_DATABASE_ROLE?.trim();
const pricing =
  endpoint && region && databaseRole
    ? new DsqlAuctionPricingRepository(
        createAuroraDsqlTransactionRunner({
          host: endpoint,
          user: databaseRole,
          region,
          maxConnections: 3,
          idleTimeoutMilliseconds: 45_000,
        }),
      )
    : undefined;

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
    pricing === undefined ? {} : { pricing },
    body,
  );
}
