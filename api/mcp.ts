import type { IncomingMessage, ServerResponse } from "node:http";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { createServer } from "../src/core/server-factory";

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      resolve(raw.length ? JSON.parse(raw) : undefined);
    });
    req.on("error", reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.writeHead(405, { allow: "GET, POST" }).end();
    return;
  }

  const url = new URL(req.url ?? "/mcp", "https://commerce-price-mcp.example");
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const body = req.method === "POST" ? (await readBody(req)) : undefined;
  const request = new Request(url, {
    method: req.method,
    headers,
    body: body === undefined ? null : JSON.stringify(body)
  });

  const transport = new WebStandardStreamableHTTPServerTransport({ mcpServer: createServer() });
  const response = await transport.handleRequest(request);

  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.writeHead(response.status, response.statusText);

  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }
  res.end();
}
