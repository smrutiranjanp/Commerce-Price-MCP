import type { MarketplaceAdapter } from "./base.js";
import type { Platform, SearchInput, Listing } from "../core/types.js";
import { normalizeListing } from "../core/normalize.js";

export class HttpJsonAdapter implements MarketplaceAdapter {
  constructor(
    public platform: Platform,
    private endpoint: string,
    private token?: string
  ) {}

  async search(input: SearchInput): Promise<Listing[]> {
    const headers: Record<string,string> = {"content-type":"application/json"};
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error(`${this.platform}: provider returned HTTP ${res.status}`);

    const payload: any = await res.json();
    const rawItems = Array.isArray(payload) ? payload : (payload.items ?? payload.data?.items ?? []);
    return rawItems
      .map((x:any) => normalizeListing(x, this.platform, input.query))
      .filter((x:Listing|null): x is Listing => !!x);
  }
}
