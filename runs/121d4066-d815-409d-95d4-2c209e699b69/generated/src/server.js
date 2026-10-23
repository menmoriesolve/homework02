import { createServer } from "node:http";
import {
  createService,
  NotFoundError,
  ValidationError,
} from "./service.js";

const port = Number(process.env.PORT ?? 3100);
const service = createService();
const collectionPath = "/api/tasks";

const server = createServer(async (request, response) => {
  setCors(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "GET" && url.pathname === "/health") {
      return send(response, 200, { status: "ok", entity: "任务" });
    }
    if (request.method === "GET" && url.pathname === collectionPath) {
      return send(response, 200, { data: service.list() });
    }
    if (request.method === "POST" && url.pathname === collectionPath) {
      const body = await readJson(request);
      return send(response, 201, { data: service.create(body) });
    }

    const match = url.pathname.match(new RegExp("^" + collectionPath + "/([^/]+)$"));
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (request.method === "GET") {
        return send(response, 200, { data: service.get(id) });
      }
      if (request.method === "PUT") {
        const body = await readJson(request);
        return send(response, 200, { data: service.update(id, body) });
      }
      if (request.method === "DELETE") {
        return send(response, 200, { data: service.remove(id) });
      }
    }
    return send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ValidationError) {
      return send(response, 400, {
        error: error.message,
        details: error.details,
      });
    }
    if (error instanceof NotFoundError) {
      return send(response, 404, { error: error.message });
    }
    console.error(error);
    return send(response, 500, { error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log("任务 API listening on http://localhost:" + port);
});

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("请求体必须是合法 JSON");
  }
}
