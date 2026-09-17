import { ETBS } from "./etbs";
import { fetchAllSets, setSlug } from "./sets";
import { fetchEtbPrices } from "./pricecharting";

const PC = "https://www.pricecharting.com/game";

const URL_PATTERNS = [
  (slug: string) => `${PC}/pokemon-${slug}/elite-trainer-box-pokemon-center`,
  (slug: string) => `${PC}/pokemon-${slug}/pokemon-center-elite-trainer-box`,
  (slug: string) => `${PC}/pokemon-${slug}/elite-trainer-box`,
];

export type NewestCheck = {
  fetchedAt: string;
  newestSet: {
    setId: string;
    setName: string;
    releaseDate: string;
    logo: string | null;
    tracked: boolean;
  } | null;
  untrackedSets: {
    setId: string;
    setName: string;
    releaseDate: string;
    logo: string | null;
    etbUrl: string | null;
    sealed: number | null;
    image: string | null;
  }[];
};

/**
 * @param alreadyDiscovered set IDs already persisted by a previous run. Without
 * these the check only knows about the hardcoded ETBS, so every auto-discovered
 * set stays "untracked" forever and re-notifies on every weekly run.
 */
export async function runNewestCheck(
  alreadyDiscovered: Iterable<string> = [],
): Promise<NewestCheck> {
  const knownSetIds = new Set([
    ...ETBS.map((e) => e.setId),
    ...alreadyDiscovered,
  ]);
  const sets = await fetchAllSets();

  const candidates = sets
    .filter((s) => !knownSetIds.has(s.id))
    .filter((s) => {
      const d = new Date(s.releaseDate);
      const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365);
      return !Number.isNaN(d.getTime()) && d >= cutoff;
    })
    .slice(0, 8);

  const newest = sets[0] ?? null;

  const findings = await Promise.all(
    candidates.map(async (s) => {
      const slug = setSlug(s.name);
      for (const build of URL_PATTERNS) {
        const url = build(slug);
        const data = await fetchEtbPrices(url);
        if (data.sealedValue && data.sealedValue > 0) {
          return {
            setId: s.id,
            setName: s.name,
            releaseDate: s.releaseDate,
            logo: s.images?.logo ?? null,
            etbUrl: url,
            sealed: data.sealedValue,
            image: data.imageUrl ?? null,
          };
        }
      }
      return {
        setId: s.id,
        setName: s.name,
        releaseDate: s.releaseDate,
        logo: s.images?.logo ?? null,
        etbUrl: null,
        sealed: null,
        image: null,
      };
    }),
  );

  return {
    fetchedAt: new Date().toISOString(),
    newestSet: newest
      ? {
          setId: newest.id,
          setName: newest.name,
          releaseDate: newest.releaseDate,
          logo: newest.images?.logo ?? null,
          tracked: knownSetIds.has(newest.id),
        }
      : null,
    untrackedSets: findings,
  };
}
