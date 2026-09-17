import { PC_CACHE_TAG } from "./pricecharting";

const RATE_URL = "https://open.er-api.com/v6/latest/USD";

export async function fetchUsdToCad(): Promise<number | null> {
  try {
    const r = await fetch(RATE_URL, {
      next: { revalidate: 21600, tags: [PC_CACHE_TAG] },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { rates?: Record<string, number> };
    const rate = j?.rates?.CAD;
    if (typeof rate === "number" && rate > 0.5 && rate < 5) return rate;
    return null;
  } catch {
    return null;
  }
}
