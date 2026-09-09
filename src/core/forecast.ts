import type { Forecast, PriceSnapshot } from "./types.js";

function dailyMin(history: PriceSnapshot[]): { t: number; y: number }[] {
  const byDay = new Map<string, number>();
  for (const h of history) {
    const d = h.capturedAt.slice(0, 10);
    const prev = byDay.get(d);
    if (prev == null || h.landedPrice < prev) byDay.set(d, h.landedPrice);
  }
  const rows = [...byDay.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([d,y]) => ({ t: new Date(d+"T00:00:00Z").getTime()/86400000, y }));
  if (!rows.length) return [];
  const t0 = rows[0].t;
  return rows.map(r => ({ t: r.t - t0, y: r.y }));
}

function linearRegression(points: {t:number;y:number}[]) {
  const n = points.length;
  const mt = points.reduce((s,p)=>s+p.t,0)/n;
  const my = points.reduce((s,p)=>s+p.y,0)/n;
  const num = points.reduce((s,p)=>s+(p.t-mt)*(p.y-my),0);
  const den = points.reduce((s,p)=>s+(p.t-mt)**2,0);
  const slope = den ? num/den : 0;
  const intercept = my - slope*mt;
  const residuals = points.map(p => p.y-(intercept+slope*p.t));
  const rmse = Math.sqrt(residuals.reduce((s,e)=>s+e*e,0)/Math.max(1,n));
  return {slope, intercept, rmse};
}

function ewma(values:number[], alpha=0.35) {
  let v = values[0];
  for (let i=1;i<values.length;i++) v = alpha*values[i] + (1-alpha)*v;
  return v;
}

export function forecastPrice(
  canonicalKey: string,
  history: PriceSnapshot[],
  horizonDays: number
): Forecast {
  const pts = dailyMin(history);
  if (pts.length < 3) {
    throw new Error("Need at least 3 distinct days of history; 14+ days is recommended.");
  }

  const current = pts.at(-1)!.y;
  const reg = linearRegression(pts);
  const trendFuture = reg.intercept + reg.slope*(pts.at(-1)!.t + horizonDays);
  const smoothed = ewma(pts.map(p=>p.y));
  // Blend long-term slope and recent level; clamp implausible jumps to +/-25%.
  let predicted = 0.65*trendFuture + 0.35*smoothed;
  predicted = Math.max(current*0.75, Math.min(current*1.25, predicted));

  const changePct = ((predicted-current)/current)*100;
  const threshold = 1.5;
  const direction = changePct > threshold ? "increase" : changePct < -threshold ? "decrease" : "stable";

  const cv = reg.rmse / Math.max(1,current);
  const confidence =
    pts.length >= 30 && cv < 0.05 ? "high" :
    pts.length >= 14 && cv < 0.12 ? "medium" : "low";

  return {
    canonicalKey,
    horizonDays,
    currentPrice: Number(current.toFixed(2)),
    predictedPrice: Number(predicted.toFixed(2)),
    predictedChangePct: Number(changePct.toFixed(2)),
    direction,
    confidence,
    observations: pts.length,
    model: "daily-min OLS trend + EWMA level, 65/35 blend, ±25% clamp",
    caveat: "Retail prices are promotion-, inventory-, seller-, and location-driven. This is a statistical estimate, not a guarantee."
  };
}
