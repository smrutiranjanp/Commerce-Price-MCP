import type { MarketplaceAdapter } from "./base.js";
import type { Platform } from "../core/types.js";
import { HttpJsonAdapter } from "./http-json.js";

const configs: Array<[Platform,string]> = [
  ["blinkit","BLINKIT_ADAPTER_URL"],
  ["zepto","ZEPTO_ADAPTER_URL"],
  ["instamart","INSTAMART_ADAPTER_URL"],
  ["bigbasket","BIGBASKET_ADAPTER_URL"],
  ["jiomart","JIOMART_ADAPTER_URL"],
  ["amazon_in","AMAZON_IN_ADAPTER_URL"],
  ["flipkart","FLIPKART_ADAPTER_URL"]
];

export function buildAdapters(): MarketplaceAdapter[] {
  const token = process.env.PRICE_PROVIDER_TOKEN;
  return configs.flatMap(([platform, env]) => {
    const endpoint = process.env[env];
    return endpoint ? [new HttpJsonAdapter(platform, endpoint, token)] : [];
  });
}

export const supportedPlatforms = configs.map(([p]) => p);
