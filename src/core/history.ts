import fs from "node:fs";
import path from "node:path";
import type { Listing, PriceSnapshot } from "./types.js";

const historyFile = process.env.PRICE_HISTORY_FILE ?? "./data/history.jsonl";

function ensureFile() {
  const dir = path.dirname(historyFile);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(historyFile)) fs.writeFileSync(historyFile, "");
}

export function recordSnapshots(listings: Listing[], pincode: string): void {
  ensureFile();
  const lines = listings.map<PriceSnapshot>(x => ({
    canonicalKey: x.canonicalKey,
    platform: x.platform,
    price: x.price,
    landedPrice: x.landedPrice,
    capturedAt: x.capturedAt,
    pincode,
    url: x.url
  }));
  if (lines.length) {
    fs.appendFileSync(historyFile, lines.map(x => JSON.stringify(x)).join("\n") + "\n");
  }
}

export function getHistory(canonicalKey: string, days = 90, pincode?: string): PriceSnapshot[] {
  ensureFile();
  const cutoff = Date.now() - days * 86400000;
  return fs.readFileSync(historyFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap(line => {
      try { return [JSON.parse(line) as PriceSnapshot]; } catch { return []; }
    })
    .filter(x => x.canonicalKey === canonicalKey)
    .filter(x => !pincode || x.pincode === pincode)
    .filter(x => new Date(x.capturedAt).getTime() >= cutoff)
    .sort((a,b) => +new Date(a.capturedAt) - +new Date(b.capturedAt));
}
