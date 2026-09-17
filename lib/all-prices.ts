import { ETBS, type ETB } from "./etbs";
import {
  fetchEtbPrices,
  scrapePriceCharting,
  type PCPrices,
} from "./pricecharting";
import { getTopChases, pcSetSlugFromUrl, type TopChase } from "./top-chases";
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
      getTopChases(etb.setId, pcSetSlugFromUrl(etb.pcEtbUrl)).catch(
        () => [] as TopChase[],
      ),
    ]);
  const topChasesTotal = topChases.length
    ? topChases.reduce((s, c) => s + c.market, 0)
    : null;

  // Chase art comes from a per-card PriceCharting request, which is the first
  // thing to get rate-limited during a parallel build. Falling back only when
  // the whole list is empty isn't enough: a live list that resolved names and
  // prices but no images would still beat a complete snapshot. Borrow just the
  // missing image per card so prices stay live while the art survives.
  // Matched on id first, then card number. A set can resolve through either
  // TCGPlayer or PriceCharting depending on which upstream answers, and the two
  // use different id namespaces for the same card ("sv4pt5-232" vs
  // "pokemon-paldean-fates/mew-ex-232"), so id alone misses whenever the source
  // flaps between the snapshot run and the build. Number is unique within a set.
  const snapChases = snap?.topChases ?? [];
  const artById = new Map<string, string | null>();
  const artByNumber = new Map<string, string | null>();
  const ambiguousNumbers = new Set<string>();
  for (const c of snapChases) {
    if (c.image) artById.set(c.id, c.image);
    if (!c.number) continue;
    if (artByNumber.has(c.number)) ambiguousNumbers.add(c.number);
    else if (c.image) artByNumber.set(c.number, c.image);
  }
  const borrowArt = (c: TopChase): string | null =>
    artById.get(c.id) ??
    (c.number && !ambiguousNumbers.has(c.number)
      ? (artByNumber.get(c.number) ?? null)
      : null);

  let mergedChases =
    topChases.length > 0
      ? topChases.map((c) => (c.image ? c : { ...c, image: borrowArt(c) }))
      : snapChases;

  // Anything the snapshot has never seen — a card that just climbed into the
  // top 5, or a set newer than the committed snapshot — is fetched directly.
  // Usually none, so this stays well clear of the rate limit that made fetching
  // art for every card unreliable. Re-run scripts/build-snapshot.ts to fold
  // these back into the committed floor.
  const needArt = mergedChases.filter((c) => !c.image && c.sourceUrl);
  if (needArt.length > 0) {
    const fetched = new Map<string, string | null>();
    for (const c of needArt) {
      const img = await scrapePriceCharting(c.sourceUrl!)
        .then((d) => d.imageUrl ?? null)
        .catch(() => null);
      fetched.set(c.id, img);
    }
    mergedChases = mergedChases.map((c) =>
      c.image ? c : { ...c, image: fetched.get(c.id) ?? null },
    );
  }

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
    topChases: mergedChases,
    topChasesTotal:
      topChasesTotal !== null ? topChasesTotal : (snap?.topChasesTotal ?? null),
  };
}

/**
 * The full tracked list: hardcoded entries first (curated by hand), then
 * auto-discovered ones at the bottom. The page sort puts newest-released first
 * regardless of source. Shared with the page header so the "Tracking N ETBs"
 * counts can never drift from the rows actually rendered.
 */
export async function getTrackedEtbs(): Promise<ETB[]> {
  const discovered = await readDiscovered();
  const all: ETB[] = [...ETBS];
  const known = new Set(
    ETBS.map((e) => `${e.setId}:${e.promoNum || "base"}`),
  );
  // A discovered entry is stored with an empty promoNum, so once a set is
  // hand-curated its keys no longer match ("me4:base" vs "me4:MEP080") and the
  // row would render twice. Curated data always supersedes the placeholder, so
  // drop any discovered entry whose set is already in ETBS.
  const curatedSetIds = new Set(ETBS.map((e) => e.setId));
  for (const d of discovered) {
    const key = `${d.setId}:${d.promoNum || "base"}`;
    if (known.has(key) || curatedSetIds.has(d.setId)) continue;
    all.push(d);
  }
  return all;
}

export async function getAllPrices(): Promise<EtbWithPrices[]> {
  return chunked(await getTrackedEtbs(), 4, fetchOne, 500);
}
