export type TcgSet = {
  id: string;
  name: string;
  releaseDate: string;
  series: string;
  total: number;
  images?: { logo?: string; symbol?: string };
};

const SETS_URL =
  "https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=50";

/**
 * pokemontcg.io intermittently 500s. Without a retry a single blip on the
 * weekly cron day aborts the whole discovery run and new sets go unnoticed for
 * another week, so back off and retry like scrapePriceCharting does.
 */
export async function fetchAllSets(): Promise<TcgSet[]> {
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
    }
    try {
      const r = await fetch(SETS_URL, {
        headers: { "User-Agent": "ETB-Tracker/1.0" },
        cache: "no-store",
      });
      if (r.ok) {
        const j = await r.json();
        return (j?.data ?? []) as TcgSet[];
      }
      lastError = `pokemontcg.io ${r.status}`;
      // 4xx other than rate limiting won't fix itself; fail fast.
      if (r.status !== 429 && r.status < 500) break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastError || "pokemontcg.io request failed");
}

export function setSlug(setName: string): string {
  return setName
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
