import type { Platform, SearchInput, Listing } from "../core/types.js";

export interface MarketplaceAdapter {
  platform: Platform;
  search(input: SearchInput): Promise<Listing[]>;
}
