import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { Resend } from "resend";
import { runNewestCheck } from "../../../../lib/check-newest";
import {
  readDiscoveredWithStatus,
  writeDiscovered,
  type BlobStatus,
  type DiscoveredEtb,
} from "../../../../lib/discovered-etbs";
import { PC_CACHE_TAG } from "../../../../lib/pricecharting";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function eraOf(setId: string): "swsh" | "sv" | "mep" {
  if (setId.startsWith("swsh") || setId === "cel25" || setId === "pgo") return "swsh";
  if (setId.startsWith("me")) return "mep";
  return "sv";
}

function buildDiscoveredEntry(
  find: { setId: string; setName: string; releaseDate: string; etbUrl: string },
): DiscoveredEtb {
  // pokemontcg.io release dates look like "2026/03/27" or "2026-03-27"
  const parts = find.releaseDate.replace(/-/g, "/").split("/");
  const year = parseInt(parts[0] ?? "0", 10) || new Date().getFullYear();
  const monthNum = parseInt(parts[1] ?? "0", 10) || (new Date().getMonth() + 1);
  return {
    year,
    monthNum,
    month: MONTHS[monthNum - 1] ?? "",
    setName: find.setName,
    setId: find.setId,
    promoName: "(auto-discovered — promo unverified)",
    promoNum: "",
    promoSetId: "",
    promoCardNum: "",
    pcEtbUrl: find.etbUrl,
    pcPromoUrl: "",
    notes: `Auto-discovered ${new Date().toISOString().slice(0, 10)}. Verify promo/URL manually.`,
    era: eraOf(find.setId),
    discoveredAt: new Date().toISOString(),
  };
}

export const runtime = "nodejs";
export const maxDuration = 60;

const NOTIFY_TO = process.env.NOTIFY_EMAIL || "you@example.com";
const FROM = process.env.NOTIFY_FROM || "ETB Tracker <onboarding@resend.dev>";

function fmtUsd(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Read the already-discovered list first: those sets count as tracked for
  // this run, so they neither get re-scraped nor re-notify every single week.
  const {
    entries: existing,
    notifiedSetIds,
    status: readStatus,
  } = await readDiscoveredWithStatus();
  const existingIds = new Set(existing.map((e) => e.setId));
  const alreadyNotified = new Set(notifiedSetIds);

  let result;
  try {
    result = await runNewestCheck(existingIds);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const liveFinds = result.untrackedSets.filter((s) => s.sealed && s.etbUrl);
  // A set with no Pokemon Center ETB never lands in `entries`, so gate on the
  // notified list instead — otherwise something like a Classic Collection
  // subset is reported as "new" on every run indefinitely.
  const newSetUntracked =
    result.newestSet &&
    !result.newestSet.tracked &&
    !alreadyNotified.has(result.newestSet.setId)
      ? result.newestSet
      : null;

  // Persist live finds to the discovered blob so they show up on the site
  // without manual editing. Idempotent: existing entries are kept as-is.
  const newlyAdded: DiscoveredEtb[] = [];
  for (const find of liveFinds) {
    if (!find.etbUrl) continue;
    if (existingIds.has(find.setId)) continue;
    newlyAdded.push(
      buildDiscoveredEntry({
        setId: find.setId,
        setName: find.setName,
        releaseDate: find.releaseDate,
        etbUrl: find.etbUrl,
      }),
    );
  }
  const allEntries = [...existing, ...newlyAdded];
  let writeStatus: BlobStatus | null = null;
  if (newlyAdded.length > 0) {
    writeStatus = await writeDiscovered({ entries: allEntries, notifiedSetIds });
    if (writeStatus.ok) {
      // A brand-new row has to actually appear, so expire the tag immediately
      // instead of the "max" stale-while-revalidate profile used for routine
      // price refreshes — otherwise the new ETB is withheld another cycle.
      revalidateTag(PC_CACHE_TAG, { expire: 0 });
      revalidatePath("/", "page");
    }
  }

  // Surface a broken blob store loudly: a failed write means the find is lost
  // and the site silently stops updating, which is exactly the failure this
  // job exists to prevent. Non-2xx so it shows up as a failed cron run.
  if (writeStatus && !writeStatus.ok) {
    return NextResponse.json(
      {
        status: "persist-failed",
        blobWrite: writeStatus,
        blobRead: readStatus,
        checkedAt: result.fetchedAt,
        droppedFinds: newlyAdded.map((e) => e.setId),
      },
      { status: 500 },
    );
  }

  if (liveFinds.length === 0 && !newSetUntracked) {
    return NextResponse.json({
      status: "no-new-etbs",
      checkedAt: result.fetchedAt,
      blobRead: readStatus,
      trackedDiscovered: existing.length,
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        status: "would-notify",
        warning: "RESEND_API_KEY not set; skipping email",
        liveFinds,
        newSetUntracked,
        persistedToBlob: writeStatus?.ok ?? null,
        newlyAdded: newlyAdded.map((e) => e.setId),
        blobRead: readStatus,
      },
      { status: 200 },
    );
  }

  const resend = new Resend(apiKey);

  const findRows = liveFinds
    .map(
      (s) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;vertical-align:top;">
          ${s.image ? `<img src="${s.image}" alt="" width="80" style="border-radius:6px;background:#f5f5f5;" />` : ""}
        </td>
        <td style="padding:10px;border-bottom:1px solid #eee;vertical-align:top;">
          <div style="font-weight:600;color:#111;">${s.setName}</div>
          <div style="color:#666;font-size:12px;">Released ${s.releaseDate}</div>
          <div style="color:#111;font-size:18px;font-weight:700;margin-top:4px;">${fmtUsd(s.sealed)}</div>
          ${s.etbUrl ? `<a href="${s.etbUrl}" style="color:#3b6cf2;font-size:12px;">View on PriceCharting →</a>` : ""}
        </td>
      </tr>`,
    )
    .join("");

  const subject =
    liveFinds.length > 0
      ? `🎴 ${liveFinds.length} new Pokémon Center ETB${liveFinds.length > 1 ? "s" : ""} live`
      : `🎴 New set detected: ${newSetUntracked?.setName ?? ""}`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
      <h1 style="margin:0 0 8px 0;font-size:22px;">ETB Tracker — new release${liveFinds.length > 1 ? "s" : ""} detected</h1>
      <p style="color:#555;margin:0 0 24px 0;font-size:14px;">
        Checked ${new Date(result.fetchedAt).toUTCString()}.
      </p>
      ${
        liveFinds.length > 0
          ? `
        <h2 style="font-size:16px;margin:0 0 8px 0;">Live on PriceCharting</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          ${findRows}
        </table>
      `
          : ""
      }
      ${
        newSetUntracked && liveFinds.length === 0
          ? `
        <p style="font-size:14px;color:#333;">
          New set <strong>${newSetUntracked.setName}</strong> released ${newSetUntracked.releaseDate} —
          no Pokémon Center ETB listing on PriceCharting yet, but the set itself just dropped.
        </p>
      `
          : ""
      }
      <p style="font-size:12px;color:#888;margin-top:32px;">
        <a href="https://etb-tracker.vercel.app" style="color:#888;">etb-tracker.vercel.app</a>
      </p>
    </div>
  `;

  const sent = await resend.emails.send({
    from: FROM,
    to: NOTIFY_TO,
    subject,
    html,
  });

  // Record what was announced only after the send actually succeeded, so a
  // Resend outage retries next run instead of silently swallowing the alert.
  let notifyWriteStatus: BlobStatus | null = null;
  if (!sent.error) {
    const announced = [
      ...liveFinds.map((s) => s.setId),
      ...(newSetUntracked ? [newSetUntracked.setId] : []),
    ].filter((id) => !alreadyNotified.has(id));
    if (announced.length > 0) {
      notifyWriteStatus = await writeDiscovered({
        entries: allEntries,
        notifiedSetIds: [...notifiedSetIds, ...announced],
      });
    }
  }

  return NextResponse.json({
    status: "notified",
    emailId: sent.data?.id ?? null,
    sendError: sent.error ?? null,
    liveFinds: liveFinds.length,
    newSetUntracked: newSetUntracked?.setId ?? null,
    persistedToBlob: writeStatus?.ok ?? null,
    notifyStatePersisted: notifyWriteStatus?.ok ?? null,
    newlyAddedCount: newlyAdded.length,
    newlyAdded: newlyAdded.map((e) => e.setId),
    blobRead: readStatus,
  });
}
