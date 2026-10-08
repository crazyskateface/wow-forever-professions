import { createServer } from "node:http";
import { routeRequest } from "./router.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const result = routeRequest(request.method ?? "GET", url.pathname);

  response.writeHead(result.statusCode, result.headers);
  response.end(result.body);
});

server.listen(port, () => {
  console.log(`Forever Professions API listening on http://localhost:${port}`);
});
