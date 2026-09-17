export type TcgSet = {
  id: string;
  name: string;
  releaseDate: string;
  series: string;
  total: number;
  images?: { logo?: string; symbol?: string };
};

export async function fetchAllSets(): Promise<TcgSet[]> {
  const r = await fetch(
    "https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=50",
    { headers: { "User-Agent": "ETB-Tracker/1.0" }, cache: "no-store" },
  );
  if (!r.ok) throw new Error(`pokemontcg.io ${r.status}`);
  const j = await r.json();
  return (j?.data ?? []) as TcgSet[];
}

export function setSlug(setName: string): string {
  return setName
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
