import { NextResponse } from "next/server";
import { getTrackedEtbs } from "../../../../lib/all-prices";
import {
  fetchEtbPrices,
  scrapePriceCharting,
  type PCPrices,
} from "../../../../lib/pricecharting";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  // Tracked list, not just the hardcoded one, so auto-discovered ETBs resolve.
  const tracked = await getTrackedEtbs();
  const etb = tracked.find((e) => `${e.setId}:${e.promoNum || "base"}` === id);
  if (!etb) {
    return NextResponse.json({ error: "etb not found" }, { status: 404 });
  }

  const [etbPrices, promoPrices]: [PCPrices, PCPrices] = await Promise.all([
    fetchEtbPrices(etb.pcEtbUrl, { revalidate: false }),
    etb.pcPromoUrl
      ? scrapePriceCharting(etb.pcPromoUrl, { revalidate: false })
      : Promise.resolve({} as PCPrices),
  ]);

  return NextResponse.json({
    id,
    setId: etb.setId,
    setName: etb.setName,
    promoName: etb.promoName,
    fetchedAt: new Date().toISOString(),
    etb: {
      sealed: etbPrices.sealedValue ?? null,
      loose: etbPrices.loose ?? null,
      cib: etbPrices.cib ?? null,
      newSealed: etbPrices.newSealed ?? null,
      image: etbPrices.imageUrl ?? null,
      sourceUrl: etb.pcEtbUrl,
    },
    promo: {
      raw: promoPrices.cardRaw ?? null,
      psa10: promoPrices.cardPsa10 ?? null,
      image: promoPrices.imageUrl ?? null,
      sourceUrl: etb.pcPromoUrl || null,
    },
  });
}
