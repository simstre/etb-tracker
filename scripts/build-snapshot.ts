/**
 * scripts/build-snapshot.ts — fetch live prices for every tracked ETB and write
 * the result to data/snapshot.json. Run locally where PriceCharting doesn't
 * rate-limit; commit the resulting JSON. The build then uses it as a fallback
 * for any ETB whose live fetch fails on Vercel's build IPs.
 *
 * Usage:  npx tsx scripts/build-snapshot.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ETBS } from "../lib/etbs";
import {
  fetchEtbPrices,
  scrapePriceCharting,
  type PCPrices,
} from "../lib/pricecharting";
import { getTopChases, pcSetSlugFromUrl } from "../lib/top-chases";

type EntrySnapshot = {
  id: string;
  setId: string;
  promoNum: string;
  sealed: number | null;
  promoRaw: number | null;
  promoPsa10: number | null;
  etbImage: string | null;
  promoImage: string | null;
  topChases: { id: string; name: string; number: string; rarity: string; image: string | null; market: number }[];
  topChasesTotal: number | null;
};

async function fetchOne(etb: typeof ETBS[number]): Promise<EntrySnapshot> {
  const id = `${etb.setId}:${etb.promoNum || "base"}`;
  console.log(`  ${id}…`);
  const [etbData, promoData, topChases] = await Promise.all([
    fetchEtbPrices(etb.pcEtbUrl, { revalidate: false }),
    etb.pcPromoUrl
      ? scrapePriceCharting(etb.pcPromoUrl, { revalidate: false })
      : Promise.resolve({} as PCPrices),
    // Same fallback slug the page uses, so sets missing from PC_SET_SLUGS get
    // a real snapshot floor instead of an empty chase list.
    getTopChases(etb.setId, pcSetSlugFromUrl(etb.pcEtbUrl), true).catch(
      () => [] as ReturnType<typeof getTopChases> extends Promise<infer R> ? R : never,
    ),
  ]);
  const topChasesTotal = topChases.length
    ? topChases.reduce((s, c) => s + c.market, 0)
    : null;
  return {
    id,
    setId: etb.setId,
    promoNum: etb.promoNum,
    sealed: etbData.sealedValue ?? null,
    promoRaw: promoData.cardRaw ?? null,
    promoPsa10: promoData.cardPsa10 ?? null,
    etbImage: etbData.imageUrl ?? null,
    promoImage: promoData.imageUrl ?? null,
    topChases,
    topChasesTotal,
  };
}

async function main() {
  console.log(`Fetching ${ETBS.length} ETBs sequentially (slow but reliable)...`);
  const results: EntrySnapshot[] = [];
  for (const etb of ETBS) {
    const r = await fetchOne(etb);
    results.push(r);
    await new Promise((res) => setTimeout(res, 800));
  }

  const dir = join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const out = {
    generatedAt: new Date().toISOString(),
    entries: results,
  };
  const path = join(dir, "snapshot.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${results.length} entries to ${path}`);

  const nulls = results.filter((r) => r.sealed === null).length;
  console.log(`  ${nulls} sealed nulls`);
  const promoNulls = results.filter((r, i) => ETBS[i].pcPromoUrl && r.promoRaw === null).length;
  console.log(`  ${promoNulls} promo nulls (excluding empty pcPromoUrl)`);
  const topNulls = results.filter((r) => r.topChasesTotal === null).length;
  console.log(`  ${topNulls} top5 nulls`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
