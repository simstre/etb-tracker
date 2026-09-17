// Static rather than a dynamic import: the fallback is the only path that can
// produce chases for a set TCGPlayer has not priced yet, and a dynamic import
// fails outside the bundler (e.g. scripts/build-snapshot.ts), which silently
// wrote empty chases for exactly those sets. cheerio is already pulled in
// statically by ./pricecharting, so this costs nothing.
import { getTopChasesFromPC } from "./top-chases-pc";

type TcgPrices = Record<string, { market?: number; mid?: number }>;

type TcgCard = {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  subtypes?: string[];
  images?: { small?: string; large?: string };
  tcgplayer?: { prices?: TcgPrices };
};

export type TopChase = {
  id: string;
  name: string;
  number: string;
  rarity: string;
  image: string | null;
  market: number;
  source: "tcgplayer" | "pricecharting";
  sourceUrl: string | null;
};

// Some main sets have parallel subsets that hold most of the chase cards.
const SUBSETS: Record<string, string[]> = {
  swsh45: ["swsh45sv"],
  cel25: ["cel25c"],
  swsh10: ["swsh10tg"],
  swsh11: ["swsh11tg"],
  swsh12: ["swsh12tg"],
  swsh12pt5: ["swsh12pt5gg"],
};

const CHASE_RARITIES = new Set([
  "Mega Hyper Rare",
  "Special Illustration Rare",
  "Hyper Rare",
  "Rare Rainbow",
  "Rare Secret",
  "Rare Shiny",
  "Trainer Gallery Rare Holo",
  "Classic Collection",
  "Illustration Rare",
  "Ultra Rare",
  "Rare Ultra",
]);

const SUBSET_IDS = new Set(Object.values(SUBSETS).flat());

function isSubsetCard(cardId: string): boolean {
  return [...SUBSET_IDS].some((sid) => cardId.startsWith(sid + "-"));
}

function isSwshAltArt(card: TcgCard, all: TcgCard[]): boolean {
  const altRarities = new Set([
    "Rare Ultra",
    "Rare Holo VMAX",
    "Rare Holo V",
    "Rare Holo VSTAR",
  ]);
  if (!card.rarity || !altRarities.has(card.rarity)) return false;
  const myNum = parseInt(card.number, 10);
  if (Number.isNaN(myNum)) return false;
  const subKey = (c: TcgCard) => [...(c.subtypes ?? [])].sort().join("|");
  const same = all.filter(
    (c) =>
      c.name === card.name &&
      subKey(c) === subKey(card) &&
      /^\d+$/.test(c.number),
  );
  if (same.length < 2) return false;
  const nums = same.map((c) => parseInt(c.number, 10)).sort((a, b) => a - b);
  return myNum > nums[0];
}

function marketPrice(card: TcgCard): number | null {
  const prices = card.tcgplayer?.prices;
  if (!prices) return null;
  let best: number | null = null;
  for (const v of Object.values(prices)) {
    const m = v.market ?? v.mid;
    if (m && (best === null || m > best)) best = m;
  }
  return best;
}

/**
 * Pull the PriceCharting console slug out of an ETB product URL, e.g.
 * ".../game/pokemon-chaos-rising/elite-trainer-box-pokemon-center" ->
 * "pokemon-chaos-rising". Used as the fallback for sets missing from
 * PC_SET_SLUGS, which is hand-maintained and by definition never covers a
 * newly auto-discovered set. The ETB URL is already proven good — discovery
 * only persists a URL that returned a real sealed price.
 */
export function pcSetSlugFromUrl(url: string): string | null {
  const m = url.match(/pricecharting\.com\/game\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Map our internal setIds to the PriceCharting console set slug.
// PC uses different naming conventions for some sets.
export const PC_SET_SLUGS: Record<string, string> = {
  swsh45: "pokemon-shining-fates",
  swsh5: "pokemon-battle-styles",
  swsh6: "pokemon-chilling-reign",
  swsh7: "pokemon-evolving-skies",
  cel25: "pokemon-celebrations",
  swsh8: "pokemon-fusion-strike",
  swsh9: "pokemon-brilliant-stars",
  swsh10: "pokemon-astral-radiance",
  pgo: "pokemon-go",
  swsh11: "pokemon-lost-origin",
  swsh12: "pokemon-silver-tempest",
  swsh12pt5: "pokemon-crown-zenith",
  sv1: "pokemon-scarlet-violet",
  sv2: "pokemon-paldea-evolved",
  sv3: "pokemon-obsidian-flames",
  sv3pt5: "pokemon-scarlet-&-violet-151",
  sv4: "pokemon-paradox-rift",
  sv4pt5: "pokemon-paldean-fates",
  sv5: "pokemon-temporal-forces",
  sv6: "pokemon-twilight-masquerade",
  sv6pt5: "pokemon-shrouded-fable",
  sv7: "pokemon-stellar-crown",
  sv8: "pokemon-surging-sparks",
  sv8pt5: "pokemon-prismatic-evolutions",
  sv9: "pokemon-journey-together",
  sv10: "pokemon-destined-rivals",
  zsv10pt5: "pokemon-black-bolt",
  rsv10pt5: "pokemon-white-flare",
  me1: "pokemon-mega-evolution",
  me2: "pokemon-phantasmal-flames",
  me2pt5: "pokemon-ascended-heroes",
  me3: "pokemon-perfect-order",
};

async function fetchSetCards(setId: string): Promise<TcgCard[]> {
  const out: TcgCard[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=250&page=${page}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "ETB-Tracker/1.0" },
      next: { revalidate: 21600, tags: ["pc-prices"] },
    });
    if (!r.ok) break;
    const j = await r.json();
    const data = (j?.data ?? []) as TcgCard[];
    out.push(...data);
    if (data.length < 250) break;
    page += 1;
  }
  return out;
}

export async function getTopChases(
  setId: string,
  fallbackPcSlug?: string | null,
  fetchImages = false,
): Promise<TopChase[]> {
  const ids = [setId, ...(SUBSETS[setId] ?? [])];
  const groups = await Promise.all(ids.map(fetchSetCards));
  const all = groups.flat();

  if (all.length > 0) {
    const candidates = all.filter((c) => {
      if (c.rarity && CHASE_RARITIES.has(c.rarity)) return true;
      if (isSubsetCard(c.id)) return true;
      if (isSwshAltArt(c, all)) return true;
      return false;
    });
    const pool = candidates.length > 0 ? candidates : all;

    const priced = pool
      .map((c) => ({ card: c, market: marketPrice(c) }))
      .filter((p): p is { card: TcgCard; market: number } => p.market !== null && p.market > 1)
      .sort((a, b) => b.market - a.market)
      .slice(0, 5);

    if (priced.length > 0) {
      return priced.map((p) => ({
        id: p.card.id,
        name: p.card.name,
        number: p.card.number,
        rarity: p.card.rarity ?? "",
        image: p.card.images?.large ?? p.card.images?.small ?? null,
        market: p.market,
        source: "tcgplayer",
        sourceUrl: null,
      }));
    }
  }

  // Fallback: pokemontcg.io has no priced cards yet (very recent sets).
  // Scrape PriceCharting's set page for top 5 by ungraded price.
  const slug = PC_SET_SLUGS[setId] ?? fallbackPcSlug;
  if (slug) return getTopChasesFromPC(slug, {}, fetchImages);
  return [];
}
