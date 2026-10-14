import { createServer, type IncomingMessage } from "node:http";
import { createPostgresRecipeCatalogReader } from "@forever-professions/ingestion";
import { localPricingReader } from "./local-pricing.js";
import { routeRequest } from "./router.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const localDatabaseUrl = process.env.LOCAL_DATABASE_URL?.trim();
const localCatalog = localDatabaseUrl
  ? createPostgresRecipeCatalogReader({ connectionString: localDatabaseUrl })
  : undefined;

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 64 * 1024) return undefined;
    chunks.push(bytes);
  }
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const result = await routeRequest(
    request.method ?? "GET",
    url.pathname,
    Object.fromEntries(url.searchParams),
    {
      ...(localCatalog === undefined ? {} : { catalog: localCatalog }),
      ...(localCatalog === undefined ? {} : { changes: localCatalog }),
      pricing: localPricingReader,
    },
    await readJsonBody(request),
  );

  response.writeHead(result.statusCode, result.headers);
  response.end(result.body);
});

server.listen(port, () => {
  console.log(
    `Forever Professions API listening on http://localhost:${port} (${localCatalog ? "PostgreSQL catalog" : "fixture catalog"})`,
  );
});

async function close(): Promise<void> {
  server.close();
  await localCatalog?.end();
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
