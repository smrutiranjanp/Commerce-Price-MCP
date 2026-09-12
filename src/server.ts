import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./core/server-factory.js";

void serveStdio(createServer);
console.error("commerce-price-mcp running on stdio");
