import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { PC_CACHE_TAG } from "../../../../lib/pricecharting";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Mark all PriceCharting + pokemontcg.io fetches stale; the next render uses
  // stale-while-revalidate so visitors keep seeing instant cached pages while
  // the new prices stream in behind the scenes.
  revalidateTag(PC_CACHE_TAG, "max");
  revalidatePath("/", "page");
  return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
}
