/**
 * lib/discovered-etbs.ts — auto-discovered ETBs persisted to Vercel Blob.
 *
 * The weekly /api/cron/check-newest job appends any newly-detected ETB to the
 * blob; getAllPrices() reads it and merges with the hardcoded list in etbs.ts
 * so new releases appear on the page automatically.
 *
 * Gracefully degrades when BLOB_READ_WRITE_TOKEN is missing — read returns an
 * empty list and write is a no-op — so the build keeps working before the
 * blob store is linked.
 */
import { put, list } from "@vercel/blob";
import { type ETB } from "./etbs";

export type DiscoveredEtb = ETB & {
  discoveredAt: string;
};

const BLOB_PATHNAME = "discovered-etbs.json";

function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function readDiscovered(): Promise<DiscoveredEtb[]> {
  if (!blobEnabled()) return [];
  try {
    const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATHNAME);
    if (!match) return [];
    const r = await fetch(match.downloadUrl ?? match.url, {
      next: { revalidate: 21600, tags: ["pc-prices-v5"] },
    });
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data?.entries)) return [];
    return data.entries as DiscoveredEtb[];
  } catch {
    return [];
  }
}

export async function writeDiscovered(entries: DiscoveredEtb[]): Promise<boolean> {
  if (!blobEnabled()) return false;
  try {
    const body = JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries,
    });
    await put(BLOB_PATHNAME, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return true;
  } catch {
    return false;
  }
}
