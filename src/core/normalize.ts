import crypto from "node:crypto";
import type { Listing } from "./types.js";

const STOP = new Set([
  "the","a","an","and","with","of","for","pack","combo","new","india"
]);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(x => !STOP.has(x));
}

export function canonicalKey(title: string, quantity?: number, unit?: string): string {
  const base = tokens(title).sort().join("-");
  const qty = quantity ? `-${quantity}${(unit ?? "").toLowerCase()}` : "";
  return crypto.createHash("sha1").update(base + qty).digest("hex").slice(0, 16);
}

export function similarity(query: string, title: string): number {
  const a = new Set(tokens(query));
  const b = new Set(tokens(title));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

export function normalizeListing(raw: any, fallbackPlatform: Listing["platform"], query: string): Listing | null {
  const price = Number(raw.price);
  if (!Number.isFinite(price) || price <= 0 || !raw.title || !raw.url) return null;

  const quantity = raw.quantity != null ? Number(raw.quantity) : undefined;
  const deliveryFee = raw.deliveryFee != null ? Number(raw.deliveryFee) : 0;
  const platform = (raw.platform ?? fallbackPlatform) as Listing["platform"];
  const title = String(raw.title);

  return {
    platform,
    title,
    price,
    mrp: raw.mrp != null ? Number(raw.mrp) : undefined,
    deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : 0,
    landedPrice: price + (Number.isFinite(deliveryFee) ? deliveryFee : 0),
    url: String(raw.url),
    inStock: raw.inStock !== false,
    quantity: Number.isFinite(quantity) ? quantity : undefined,
    unit: raw.unit ? String(raw.unit) : undefined,
    seller: raw.seller ? String(raw.seller) : undefined,
    productId: raw.productId ? String(raw.productId) : undefined,
    imageUrl: raw.imageUrl ? String(raw.imageUrl) : undefined,
    capturedAt: raw.capturedAt ? String(raw.capturedAt) : new Date().toISOString(),
    matchScore: similarity(query, title),
    canonicalKey: canonicalKey(title, Number.isFinite(quantity) ? quantity : undefined, raw.unit)
  };
}

export function quantityCompatible(
  listing: Listing,
  requestedQuantity?: number,
  requestedUnit?: string
): boolean {
  if (!requestedQuantity) return true;
  if (!listing.quantity) return true; // unknown: retain, but rank by text match
  if (requestedUnit && listing.unit && requestedUnit.toLowerCase() !== listing.unit.toLowerCase()) return false;
  const tolerance = Math.max(0.01 * requestedQuantity, 0.001);
  return Math.abs(listing.quantity - requestedQuantity) <= tolerance;
}
