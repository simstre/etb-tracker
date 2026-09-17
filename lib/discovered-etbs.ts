/**
 * lib/discovered-etbs.ts — auto-discovered ETBs persisted to Vercel Blob.
 *
 * The weekly /api/cron/check-newest job appends any newly-detected ETB to the
 * blob; getAllPrices() reads it and merges with the hardcoded list in etbs.ts
 * so new releases appear on the page automatically.
 *
 * Gracefully degrades when BLOB_READ_WRITE_TOKEN is missing — read returns an
 * empty list and write is a no-op — so the build keeps working before the
 * blob store is linked. Both paths report *why* they degraded rather than
 * swallowing it: a missing blob store silently disables auto-discovery
 * entirely, and that failure is otherwise invisible from the outside.
 */
import { put, list } from "@vercel/blob";
import { type ETB } from "./etbs";
import { PC_CACHE_TAG } from "./pricecharting";

export type DiscoveredEtb = ETB & {
  discoveredAt: string;
};

export type BlobStatus =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "empty" | "error"; detail?: string };

/**
 * Set IDs already announced by a notification. A set that has no Pokemon Center
 * ETB (a subset like "30th Celebration: Classic Collection") is never added to
 * `entries`, so without this it stays permanently "new" and re-notifies on
 * every run.
 */
export type DiscoveryState = {
  entries: DiscoveredEtb[];
  notifiedSetIds: string[];
};

const BLOB_PATHNAME = "discovered-etbs.json";

function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function readDiscoveredWithStatus(): Promise<
  DiscoveryState & { status: BlobStatus }
> {
  const empty = { entries: [], notifiedSetIds: [] };
  if (!blobEnabled()) {
    console.warn(
      "[discovered-etbs] BLOB_READ_WRITE_TOKEN missing — auto-discovered ETBs will not be shown. Link a Vercel Blob store to this project.",
    );
    return { ...empty, status: { ok: false, reason: "not-configured" } };
  }
  try {
    const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATHNAME);
    if (!match) return { ...empty, status: { ok: false, reason: "empty" } };
    // Blob URLs are served with `max-age=2592000` (30 days) and the pathname is
    // stable across overwrites, so a plain fetch can return a month-old copy
    // and silently hide a newly-discovered ETB. list() is an API call rather
    // than a CDN read, so its uploadedAt is always current — key the URL on it
    // to force a fresh fetch on every write while staying cacheable in between.
    const fresh = new URL(match.downloadUrl ?? match.url);
    fresh.searchParams.set("v", String(new Date(match.uploadedAt).getTime()));
    const r = await fetch(fresh, {
      next: { revalidate: 21600, tags: [PC_CACHE_TAG] },
    });
    if (!r.ok) {
      console.error(`[discovered-etbs] blob fetch failed: http ${r.status}`);
      return {
        ...empty,
        status: { ok: false, reason: "error", detail: `http ${r.status}` },
      };
    }
    const data = await r.json();
    if (!Array.isArray(data?.entries)) {
      console.error("[discovered-etbs] blob JSON has no `entries` array");
      return {
        ...empty,
        status: { ok: false, reason: "error", detail: "malformed blob" },
      };
    }
    return {
      entries: data.entries as DiscoveredEtb[],
      // Absent on blobs written before notification state was tracked.
      notifiedSetIds: Array.isArray(data?.notifiedSetIds)
        ? (data.notifiedSetIds as string[])
        : [],
      status: { ok: true },
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[discovered-etbs] read failed:", detail);
    return { ...empty, status: { ok: false, reason: "error", detail } };
  }
}

export async function readDiscovered(): Promise<DiscoveredEtb[]> {
  return (await readDiscoveredWithStatus()).entries;
}

export async function writeDiscovered(
  state: DiscoveryState,
): Promise<BlobStatus> {
  if (!blobEnabled()) {
    console.error(
      "[discovered-etbs] cannot persist newly-discovered ETBs: BLOB_READ_WRITE_TOKEN missing.",
    );
    return { ok: false, reason: "not-configured" };
  }
  try {
    const body = JSON.stringify({
      updatedAt: new Date().toISOString(),
      entries: state.entries,
      notifiedSetIds: state.notifiedSetIds,
    });
    await put(BLOB_PATHNAME, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return { ok: true };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[discovered-etbs] write failed:", detail);
    return { ok: false, reason: "error", detail };
  }
}
