import * as cheerio from "cheerio";
import { PC_CACHE_TAG, type ScrapeOptions } from "./pricecharting";
import type { TopChase } from "./top-chases";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const NON_CARD_FRAGMENTS = [
  "elite-trainer-box",
  "booster-box",
  "booster-pack",
  "booster-bundle",
  "sleeved-booster",
  "theme-deck",
  "blister",
  "build-and-battle",
  "build-&-battle",
  "collection-box",
  "gift-set",
  "league-battle",
  "deck-shield",
  "tin",
  "binder",
  "playmat",
  "premium-collection",
  "starter-set",
  "starter-deck",
  "trainer-toolkit",
  "v-box",
  "v-battle",
  "vmax-battle",
  "vstar-premium",
  "ex-battle",
  "starter-kit",
  "deluxe",
  "case-",
  "checklane",
  "mini-tin",
  "promo-pack",
  "code-card",
];

// Stamped / store-exclusive distributions of cards that are technically in the
// set's catalog on PriceCharting but aren't the regular chase pulls. We exclude
// them so the top-5 reflects what you'd actually pull from a sealed booster.
const STAMPED_FRAGMENTS = [
  "stamped",
  "gamestop",
  "eb-games",
  "pokemon-center",
  "reverse-holo",
  "prerelease",
  "staff",
  "winner",
];

function isCardSlug(slug: string): boolean {
  if (!/-\d{1,4}$/.test(slug)) return false;
  for (const frag of NON_CARD_FRAGMENTS) {
    if (slug.includes(frag)) return false;
  }
  for (const frag of STAMPED_FRAGMENTS) {
    if (slug.includes(frag)) return false;
  }
  return true;
}

function parsePrice(text: string): number | null {
  const m = text.replace(/[$,\s]/g, "").match(/^\d+(?:\.\d+)?$/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isNaN(n) ? null : n;
}

export async function getTopChasesFromPC(
  setSlug: string,
  opts: ScrapeOptions = {},
): Promise<TopChase[]> {
  const url = `https://www.pricecharting.com/console/${setSlug}`;
  const fetchInit: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  };
  if (opts.revalidate === false) {
    fetchInit.cache = "no-store";
  } else {
    fetchInit.next = {
      revalidate: opts.revalidate ?? 21600,
      tags: [PC_CACHE_TAG],
    };
  }
  let html: string;
  try {
    const r = await fetch(url, fetchInit);
    if (!r.ok) return [];
    html = await r.text();
  } catch {
    return [];
  }
  const $ = cheerio.load(html);
  const slugPrefix = `/game/${setSlug}/`;

  type Row = { name: string; slug: string; price: number; image: string | null };
  const rows: Row[] = [];

  $("td.title").each((_, el) => {
    const cell = $(el);
    const a = cell.find("a").first();
    const href = a.attr("href") ?? "";
    if (!href.startsWith(slugPrefix)) return;
    const slug = href.slice(slugPrefix.length).split("?")[0];
    if (!isCardSlug(slug)) return;
    const name = a.text().trim();
    if (!name) return;
    const tr = cell.closest("tr");
    const usedText = tr.find("td.used_price .js-price, td.price.numeric.used_price .js-price").first().text();
    const price = parsePrice(usedText);
    if (price == null || price <= 1) return;
    rows.push({ name, slug, price, image: null });
  });

  rows.sort((a, b) => b.price - a.price);
  const top = rows.slice(0, 5);

  return top.map((r): TopChase => {
    const numMatch = r.slug.match(/-(\d{1,4})$/);
    return {
      id: `${setSlug}/${r.slug}`,
      name: r.name,
      number: numMatch ? numMatch[1] : "",
      rarity: "",
      image: null,
      market: r.price,
      source: "pricecharting",
      sourceUrl: `https://www.pricecharting.com/game/${setSlug}/${r.slug}`,
    };
  });
}
