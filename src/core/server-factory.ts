import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { buildAdapters, supportedPlatforms } from "../adapters/registry.js";
import { quantityCompatible } from "./normalize.js";
import { recordSnapshots, getHistory } from "./history.js";
import { forecastPrice } from "./forecast.js";
import type { Platform } from "./types.js";

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>
  };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "commerce-price-mcp",
    version: "0.1.0",
    description: "Compare product prices across Indian quick-commerce/e-commerce marketplaces, store history, and forecast price direction."
  });

  server.registerTool("list_marketplaces", {
    description: "List supported marketplace connector slots and which are configured.",
    inputSchema: z.object({})
  }, async () => {
    const active = new Set(buildAdapters().map(a => a.platform));
    return json({
      marketplaces: supportedPlatforms.map(platform => ({
        platform,
        configured: active.has(platform)
      }))
    });
  });

  server.registerTool("search_product", {
    description: "Search configured marketplaces for the same product at a pincode and rank by lowest landed price.",
    inputSchema: z.object({
      query: z.string().min(2),
      pincode: z.string().regex(/^\d{6}$/),
      quantity: z.number().positive().optional(),
      unit: z.string().optional(),
      platforms: z.array(z.enum(supportedPlatforms as [Platform, ...Platform[]])).optional(),
      limitPerPlatform: z.number().int().min(1).max(30).default(10),
      minimumMatchScore: z.number().min(0).max(1).default(0.20)
    })
  }, async ({query,pincode,quantity,unit,platforms,limitPerPlatform,minimumMatchScore}) => {
    let adapters = buildAdapters();
    if (platforms?.length) adapters = adapters.filter(a => platforms.includes(a.platform));

    if (!adapters.length) {
      return {
        ...json({
          error: "No marketplace adapters are configured.",
          hint: "Set one or more *_ADAPTER_URL variables. See .env.example and README.md."
        }),
        isError: true
      };
    }

    const settled = await Promise.allSettled(adapters.map(async adapter => ({
      platform: adapter.platform,
      listings: await adapter.search({query,pincode,quantity,unit,limit:limitPerPlatform})
    })));

    const errors: any[] = [];
    let listings = settled.flatMap(result => {
      if (result.status === "rejected") {
        errors.push({error: String(result.reason)});
        return [];
      }
      return result.value.listings;
    });

    listings = listings
      .filter(x => x.inStock)
      .filter(x => x.matchScore >= minimumMatchScore)
      .filter(x => quantityCompatible(x, quantity, unit))
      .sort((a,b) => a.landedPrice-b.landedPrice || b.matchScore-a.matchScore);

    recordSnapshots(listings, pincode);

    return json({
      query,
      pincode,
      lowest: listings[0] ?? null,
      results: listings,
      errors,
      note: "Compare matchScore and pack size before treating two listings as identical."
    });
  });

  server.registerTool("get_price_history", {
    description: "Get recorded historical snapshots for a canonical product key.",
    inputSchema: z.object({
      canonicalKey: z.string().min(4),
      days: z.number().int().min(1).max(730).default(90),
      pincode: z.string().regex(/^\d{6}$/).optional()
    })
  }, async ({canonicalKey,days,pincode}) => {
    const rows = getHistory(canonicalKey, days, pincode);
    return json({canonicalKey, observations: rows.length, history: rows});
  });

  server.registerTool("predict_price", {
    description: "Predict whether the recorded lowest landed price will increase, decrease, or stay stable over 15-30 days.",
    inputSchema: z.object({
      canonicalKey: z.string().min(4),
      horizonDays: z.number().int().min(15).max(30),
      historyDays: z.number().int().min(14).max(365).default(120),
      pincode: z.string().regex(/^\d{6}$/).optional()
    })
  }, async ({canonicalKey,horizonDays,historyDays,pincode}) => {
    try {
      const history = getHistory(canonicalKey, historyDays, pincode);
      return json(forecastPrice(canonicalKey, history, horizonDays));
    } catch (e:any) {
      return {
        ...json({error: e?.message ?? String(e)}),
        isError: true
      };
    }
  });

  server.registerTool("best_buy_decision", {
    description: "Combine current search with available history and say whether buying now appears preferable to waiting.",
    inputSchema: z.object({
      query: z.string().min(2),
      pincode: z.string().regex(/^\d{6}$/),
      quantity: z.number().positive().optional(),
      unit: z.string().optional(),
      horizonDays: z.number().int().min(15).max(30).default(15)
    })
  }, async ({query,pincode,quantity,unit,horizonDays}) => {
    const adapters = buildAdapters();
    const settled = await Promise.allSettled(adapters.map(a => a.search({query,pincode,quantity,unit,limit:10})));
    let listings = settled.flatMap(r => r.status === "fulfilled" ? r.value : [])
      .filter(x => x.inStock && x.matchScore >= 0.2)
      .filter(x => quantityCompatible(x, quantity, unit))
      .sort((a,b)=>a.landedPrice-b.landedPrice);

    recordSnapshots(listings,pincode);
    const lowest = listings[0];
    if (!lowest) return {...json({error:"No matching in-stock listing found."}), isError:true};

    const history = getHistory(lowest.canonicalKey,120,pincode);
    let forecast = null;
    let recommendation = "insufficient_history";
    try {
      forecast = forecastPrice(lowest.canonicalKey,history,horizonDays);
      recommendation =
        forecast.direction === "increase" ? "buy_now" :
        forecast.direction === "decrease" ? "consider_waiting" :
        "neutral";
    } catch {}

    return json({
      lowest,
      forecast,
      recommendation,
      disclaimer: "Forecasts are probabilistic and can miss promotions, stockouts, festival sales, seller changes, or location-specific fees."
    });
  });

  return server;
}

