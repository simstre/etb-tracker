import { ETBS, type ETB } from "./etbs";
import {
  fetchEtbPrices,
  scrapePriceCharting,
  type PCPrices,
} from "./pricecharting";
import { getTopChases, type TopChase } from "./top-chases";
import { readDiscovered } from "./discovered-etbs";
import snapshotData from "../data/snapshot.json";

export type EtbWithPrices = ETB & {
  id: string;
  sealed: number | null;
  promoRaw: number | null;
  promoPsa10: number | null;
  etbImage: string | null;
  promoImage: string | null;
  topChases: TopChase[];
  topChasesTotal: number | null;
};

type SnapshotEntry = {
  id: string;
  setId: string;
  promoNum: string;
  sealed: number | null;
  promoRaw: number | null;
  promoPsa10: number | null;
  etbImage: string | null;
  promoImage: string | null;
  topChases: TopChase[];
  topChasesTotal: number | null;
};

const SNAPSHOT_INDEX: Map<string, SnapshotEntry> = new Map(
  (snapshotData.entries as SnapshotEntry[]).map((e) => [e.id, e]),
);

async function chunked<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
  delayMs = 0,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const results = await Promise.all(batch.map(fn));
    out.push(...results);
    if (delayMs > 0 && i + size < items.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return out;
}

async function fetchOne(etb: ETB): Promise<EtbWithPrices> {
  const id = `${etb.setId}:${etb.promoNum || "base"}`;
  const snap = SNAPSHOT_INDEX.get(id);

  const [etbData, promoData, topChases]: [PCPrices, PCPrices, TopChase[]] =
    await Promise.all([
      fetchEtbPrices(etb.pcEtbUrl),
      etb.pcPromoUrl
        ? scrapePriceCharting(etb.pcPromoUrl)
        : Promise.resolve({} as PCPrices),
      getTopChases(etb.setId).catch(() => [] as TopChase[]),
    ]);
  const topChasesTotal = topChases.length
    ? topChases.reduce((s, c) => s + c.market, 0)
    : null;

  // Live data wins; snapshot fills any gap from a transient fetch failure so
  // the page never shows a half-empty row when Vercel build IPs hit a rate
  // limit. Re-run scripts/build-snapshot.ts locally to refresh the floor.
  return {
    ...etb,
    id,
    sealed: etbData.sealedValue ?? snap?.sealed ?? null,
    promoRaw: promoData.cardRaw ?? snap?.promoRaw ?? null,
    promoPsa10: promoData.cardPsa10 ?? snap?.promoPsa10 ?? null,
    etbImage: etbData.imageUrl ?? snap?.etbImage ?? null,
    promoImage: promoData.imageUrl ?? snap?.promoImage ?? null,
    topChases: topChases.length > 0 ? topChases : (snap?.topChases ?? []),
    topChasesTotal:
      topChasesTotal !== null ? topChasesTotal : (snap?.topChasesTotal ?? null),
  };
}

export async function getAllPrices(): Promise<EtbWithPrices[]> {
  const discovered = await readDiscovered();
  // Hardcoded entries first (curated by hand), then auto-discovered ones at the
  // bottom. The page sort puts newest-released first regardless of source.
  const all: ETB[] = [...ETBS];
  const known = new Set(
    ETBS.map((e) => `${e.setId}:${e.promoNum || "base"}`),
  );
  for (const d of discovered) {
    const key = `${d.setId}:${d.promoNum || "base"}`;
    if (!known.has(key)) all.push(d);
  }
  return chunked(all, 4, fetchOne, 500);
}
