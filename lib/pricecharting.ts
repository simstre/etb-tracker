import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export type PCPrices = {
  loose?: number;
  cib?: number;
  newSealed?: number;
  sealedValue?: number;
  cardRaw?: number;
  cardPsa10?: number;
  imageUrl?: string;
  error?: string;
};

function parsePriceFromContainer($: cheerio.CheerioAPI, id: string): number | undefined {
  const container = $(`#${id}`);
  if (!container.length) return undefined;
  const el =
    container.find(".price.js-price").first().text() ||
    container.find(".js-price").first().text() ||
    container.find(".price").first().text();
  if (el) {
    const cleaned = el.replace(/\$|,/g, "").trim();
    const n = parseFloat(cleaned);
    if (!Number.isNaN(n)) return n;
  }
  const text = container.text().replace(/\$|,/g, "");
  const m = text.match(/\d+\.\d{2}/);
  if (m) {
    const n = parseFloat(m[0]);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

export type ScrapeOptions = {
  revalidate?: number | false;
};

export const PC_CACHE_TAG = "pc-prices-v6";

export async function scrapePriceCharting(
  url: string,
  opts: ScrapeOptions = {},
): Promise<PCPrices> {
  if (!url) return {};
  const revalidate = opts.revalidate;
  const fetchInit: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  };
  if (revalidate === false) {
    fetchInit.cache = "no-store";
  } else {
    fetchInit.next = {
      revalidate: revalidate ?? 21600,
      tags: [PC_CACHE_TAG],
    };
  }
  async function attempt(): Promise<Response | null> {
    try {
      return await fetch(url, fetchInit);
    } catch {
      return null;
    }
  }
  try {
    let r = await attempt();
    let retries = 0;
    while (
      retries < 3 &&
      (!r || (!r.ok && (r.status === 429 || r.status >= 500)))
    ) {
      await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, retries)));
      r = await attempt();
      retries += 1;
    }
    if (!r) return { error: "network error" };
    if (!r.ok) return { error: `http ${r.status}` };
    // PriceCharting redirects unknown product slugs to a search results page.
    // Treat that as a failure rather than scraping the wrong photo.
    if (r.url && (r.url.includes("/search-products") || r.url.includes("/search?"))) {
      // Could be a genuine missing URL OR a transient bot-detection redirect.
      // Retry once with a longer pause; if PC really doesn't have this URL the
      // retry just costs us 4s, but rate-limited URLs often recover.
      await new Promise((res) => setTimeout(res, 4000));
      const r2 = await attempt();
      if (
        r2 &&
        r2.ok &&
        r2.url &&
        !r2.url.includes("/search-products") &&
        !r2.url.includes("/search?")
      ) {
        const html2 = await r2.text();
        return parseHtml(html2);
      }
      return { error: "redirected to search" };
    }
    const html = await r.text();
    return parseHtml(html);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function parseHtml(html: string): PCPrices {
  const $ = cheerio.load(html);
  const out: PCPrices = {};

  // Every Pokemon product on PriceCharting - sealed boxes included - uses the
  // graded card layout: Ungraded | Grade 7 | Grade 8 | Grade 9 | Grade 9.5 |
  // PSA 10, backed by the ids below. The old Loose/CIB/New reading came from
  // PriceCharting's video-game layout, which these pages never use, so
  // "newSealed" was really Grade 8 and "cardPsa10" was a Grade 8 price.
  out.loose = parsePriceFromContainer($, "used_price");
  out.cib =
    parsePriceFromContainer($, "cib_price") ??
    parsePriceFromContainer($, "complete_price");
  out.newSealed = parsePriceFromContainer($, "new_price");

  // A sealed ETB's price is the Ungraded column; the grade columns, when a
  // graded box has ever sold, describe a different product from the one we
  // track. Prefer Ungraded and only fall back if the page has no value there.
  if (out.loose && out.loose > 0) out.sealedValue = out.loose;
  else if (out.cib && out.cib > 0) out.sealedValue = out.cib;
  else if (out.newSealed && out.newSealed > 0) out.sealedValue = out.newSealed;

  if (out.loose && out.loose > 0) out.cardRaw = out.loose;
  const psa10 = parsePriceFromContainer($, "manual_only_price");
  if (psa10 && psa10 > 0) out.cardPsa10 = psa10;

  const hasPriceMarker = !!($("#used_price").length || $("#new_price").length);
  if (hasPriceMarker) {
    const og = $('meta[property="og:image"]').attr("content");
    const itemprop = $('img[itemprop="image"]').attr("src");
    const productImg =
      $("img#product_name_image").attr("src") ||
      $("img.product_image").attr("src");
    out.imageUrl = og || itemprop || productImg || undefined;
  }
  return out;
}

/**
 * Word-order variants of the same Pokemon Center product only. Dropping
 * "-pokemon-center" is deliberately not among them: on PriceCharting the bare
 * "elite-trainer-box" slug is the regular retail box, a genuinely different
 * product. Substituting it priced Mega Evolution at the retail box's $123.80
 * instead of the Pokemon Center box's $204.40 whenever the real URL hit a 429.
 */
export function alternateEtbUrls(url: string): string[] {
  const out: string[] = [];
  if (url.includes("elite-trainer-box-pokemon-center")) {
    out.push(
      url.replace(
        "elite-trainer-box-pokemon-center",
        "pokemon-center-elite-trainer-box",
      ),
    );
  }
  if (url.includes("pokemon-center-elite-trainer-box")) {
    out.push(
      url.replace(
        "pokemon-center-elite-trainer-box",
        "elite-trainer-box-pokemon-center",
      ),
    );
  }
  return out;
}

function isUseful(p: PCPrices) {
  return !!p.sealedValue || !!p.imageUrl;
}

function merge(a: PCPrices, b: PCPrices): PCPrices {
  return {
    loose: a.loose ?? b.loose,
    cib: a.cib ?? b.cib,
    newSealed: a.newSealed ?? b.newSealed,
    sealedValue: a.sealedValue ?? b.sealedValue,
    cardRaw: a.cardRaw ?? b.cardRaw,
    cardPsa10: a.cardPsa10 ?? b.cardPsa10,
    imageUrl: a.imageUrl ?? b.imageUrl,
  };
}

export async function fetchEtbPrices(
  pcEtbUrl: string,
  opts: ScrapeOptions = {},
): Promise<PCPrices> {
  let data = await scrapePriceCharting(pcEtbUrl, opts);
  if (data.sealedValue && data.imageUrl) return data;
  for (const alt of alternateEtbUrls(pcEtbUrl)) {
    const altData = await scrapePriceCharting(alt, opts);
    if (isUseful(altData)) {
      data = merge(data, altData);
      if (data.sealedValue && data.imageUrl) return data;
    }
  }
  return data;
}
