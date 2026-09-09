# Commerce Price MCP

A TypeScript MCP server for comparing Indian quick-commerce and e-commerce product prices.

## What it does

- Searches configured marketplace adapters in parallel.
- Normalizes listings into one schema.
- Ranks by **landed price = item price + known delivery fee**.
- Returns direct product links supplied by each connector.
- Persists every observed price to `data/history.jsonl`.
- Exposes price history.
- Predicts 15-30 day direction using an explainable daily-minimum trend + EWMA model.
- Provides a `best_buy_decision` tool.

Marketplace connector slots:
`blinkit`, `zepto`, `instamart`, `bigbasket`, `jiomart`, `amazon_in`, `flipkart`.

## Why connectors are separated

Retailers differ materially in authentication, location handling, public API access,
anti-bot controls, and terms. Do **not** hard-code brittle page scraping into the MCP core.

Each non-core connector can be:
1. an official retailer/affiliate API,
2. an official MCP,
3. a licensed commerce-data provider,
4. your own compliant browser service.

The MCP never needs to change when a provider changes.

## Current Swiggy/Instamart path

Swiggy publishes an Instamart MCP at:

`https://mcp.swiggy.com/im`

It uses OAuth 2.1 with PKCE. For production, either:
- connect your app directly to that MCP and expose its `search_products` result through a small HTTP bridge matching the adapter contract below, or
- extend this project with `@modelcontextprotocol/client` and an OAuth token provider.

A bridge is intentionally not bundled here because OAuth is user/session-specific.

## Adapter contract

Configure each `*_ADAPTER_URL`. The MCP sends:

```json
{
  "query": "Aashirvaad Shudh Chakki Atta",
  "pincode": "751019",
  "quantity": 5,
  "unit": "kg",
  "limit": 10
}
```

Your provider should return:

```json
{
  "items": [
    {
      "title": "Aashirvaad Shudh Chakki Atta 5 kg",
      "price": 249,
      "mrp": 300,
      "deliveryFee": 0,
      "url": "https://...",
      "inStock": true,
      "quantity": 5,
      "unit": "kg",
      "productId": "..."
    }
  ]
}
```

`platform` is optional because the adapter injects it.

## Install

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
# Fill adapter URLs, then export them or load them with your process manager.
npm run dev
```

Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

## MCP tools

### `list_marketplaces`
Shows supported and currently configured connectors.

### `search_product`
Input:
- `query`
- `pincode`
- optional exact `quantity` and `unit`
- optional platform filter

Output:
- `lowest`
- all normalized results sorted by landed price
- direct URLs
- connector errors without failing the entire search

### `get_price_history`
Takes `canonicalKey`, `days`, and optional `pincode`.

### `predict_price`
Takes `canonicalKey`, `horizonDays` (15-30), optional `pincode`.

At least 3 distinct historical days are required; 14+ is recommended.
Confidence is based on observation count and regression noise.

### `best_buy_decision`
Searches now and combines the current lowest listing with available history:
- rising forecast -> `buy_now`
- falling forecast -> `consider_waiting`
- stable -> `neutral`
- too little history -> `insufficient_history`

## Important matching rule

"Lowest price" is dangerous unless pack sizes are matched. Pass `quantity` + `unit`
whenever possible. The server also emits `matchScore`; for production, improve this
with GTIN/EAN/UPC identifiers and retailer product IDs.

## Production upgrades I recommend

1. PostgreSQL/TimescaleDB instead of JSONL.
2. GTIN/EAN-based product entity resolution.
3. Location-aware taxes, fees, membership pricing, coupons, and minimum-cart rules.
4. Scheduled snapshots (e.g. 2-4/day) so history is real history, not only user searches.
5. Festival/calendar/promotion features for the forecast.
6. Per-marketplace rate limits, retries, cache, circuit breakers and observability.
7. A separate "same product confidence" model to prevent false cheapest matches.
8. Store both base price and checkout-effective price; do not mix them.
9. Backtest forecasts (MAE/MAPE/directional accuracy) before displaying confidence.
10. Respect each provider's terms, robots/automation policy, authentication and rate limits.

## Example host configuration

For a local stdio MCP host, configure a command equivalent to:

```json
{
  "command": "npx",
  "args": ["tsx", "/absolute/path/to/commerce-price-mcp/src/index.ts"],
  "env": {
    "BLINKIT_ADAPTER_URL": "https://your-provider/blinkit/search",
    "ZEPTO_ADAPTER_URL": "https://your-provider/zepto/search"
  }
}
```

## Forecast caveat

A 15-30 day retail-price forecast is inherently uncertain. Promotions, inventory,
seller changes, festival sales, memberships and location can dominate the signal.
Treat the forecast as a decision aid, not as a guaranteed future price.
