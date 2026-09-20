// Chase prices come from PriceCharting alone. They used to come from TCGPlayer
// (via pokemontcg.io) with PriceCharting only as a fallback, which meant two
// marketplaces priced different rows of the same table - TCGPlayer had
// Prismatic Evolutions' Umbreon ex at $1415 against PriceCharting's $1250 - so
// the ratio columns were not comparable across rows and a card's price did not
// match the page it linked to. Static rather than a dynamic import: a dynamic
// one fails outside the bundler (e.g. scripts/build-snapshot.ts).
import { getTopChasesFromPC } from "./top-chases-pc";

export type TopChase = {
  id: string;
  name: string;
  number: string;
  rarity: string;
  image: string | null;
  market: number;
  source: "pricecharting";
  sourceUrl: string | null;
};

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
  // PriceCharting spells this console with the ampersand; the plain-word slug
  // 404s, which left the set with no chases at all.
  sv1: "pokemon-scarlet-&-violet",
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

/**
 * Top 5 chase cards of a set by PriceCharting ungraded price. Every set resolves
 * through the same source, so the numbers are comparable row to row and each
 * card links to the page its price was read from.
 */
export async function getTopChases(
  setId: string,
  fallbackPcSlug?: string | null,
  fetchImages = false,
): Promise<TopChase[]> {
  const slug = PC_SET_SLUGS[setId] ?? fallbackPcSlug;
  if (!slug) return [];
  return getTopChasesFromPC(slug, {}, fetchImages);
}
