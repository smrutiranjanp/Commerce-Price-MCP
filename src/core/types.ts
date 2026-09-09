export type Platform =
  | "blinkit"
  | "zepto"
  | "instamart"
  | "bigbasket"
  | "jiomart"
  | "amazon_in"
  | "flipkart";

export interface SearchInput {
  query: string;
  pincode: string;
  quantity?: number;
  unit?: string;
  limit?: number;
}

export interface Listing {
  platform: Platform;
  title: string;
  price: number;
  mrp?: number;
  deliveryFee?: number;
  landedPrice: number;
  url: string;
  inStock: boolean;
  quantity?: number;
  unit?: string;
  seller?: string;
  productId?: string;
  imageUrl?: string;
  capturedAt: string;
  matchScore: number;
  canonicalKey: string;
}

export interface PriceSnapshot {
  canonicalKey: string;
  platform: Platform;
  price: number;
  landedPrice: number;
  capturedAt: string;
  pincode: string;
  url: string;
}

export interface Forecast {
  canonicalKey: string;
  horizonDays: number;
  currentPrice: number;
  predictedPrice: number;
  predictedChangePct: number;
  direction: "increase" | "decrease" | "stable";
  confidence: "low" | "medium" | "high";
  observations: number;
  model: string;
  caveat: string;
}
