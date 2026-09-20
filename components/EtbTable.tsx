"use client";

import { Fragment, useMemo, useState } from "react";
import type { EtbWithPrices } from "../lib/all-prices";

type SortKey =
  | "released"
  | "set"
  | "promo"
  | "sealed"
  | "promoRaw"
  | "topTotal"
  | "ratio"
  | "chaseRatio";

const ERA_BADGE: Record<string, string> = {
  swsh: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  sv: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  mep: "bg-amber-400/15 text-amber-300 border-amber-400/30",
};

function fmtCad(usd: number | null, rate: number | null) {
  if (usd == null) return "—";
  if (rate == null) return "—";
  const cad = usd * rate;
  return (
    "C" +
    cad.toLocaleString("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: cad < 100 ? 2 : 0,
    })
  );
}

function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function ratioOf(row: EtbWithPrices): number | null {
  if (!row.sealed) return null;
  const top = row.topChasesTotal ?? 0;
  const promo = row.promoRaw ?? 0;
  const denom = top + promo;
  if (denom <= 0) return null;
  return row.sealed / denom;
}

function chaseRatioOf(row: EtbWithPrices): number | null {
  if (!row.sealed) return null;
  const chase = row.topChases[0]?.market ?? 0;
  if (chase <= 0) return null;
  return row.sealed / chase;
}

function sortValue(row: EtbWithPrices, key: SortKey): number | string {
  switch (key) {
    case "released":
      return row.year * 100 + row.monthNum;
    case "set":
      return row.setName.toLowerCase();
    case "promo":
      return row.promoName.toLowerCase();
    case "sealed":
      return row.sealed ?? -1;
    case "promoRaw":
      return row.promoRaw ?? -1;
    case "topTotal":
      return row.topChasesTotal ?? -1;
    case "ratio":
      return ratioOf(row) ?? -1;
    case "chaseRatio":
      return chaseRatioOf(row) ?? -1;
  }
}

export function EtbTable({
  rows,
  cadRate,
}: {
  rows: EtbWithPrices[];
  cadRate: number | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("released");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "set" || key === "promo" ? "asc" : "desc");
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-semibold">All tracked ETBs</h2>
        <p className="text-xs text-muted mt-1">
          Click any column header to sort. Click a row to see its top 5 chase cards. All
          prices are converted from USD to{" "}
          <span className="text-foreground">CAD</span>
          {cadRate ? (
            <>
              {" "}at <span className="text-foreground">1 USD = C${cadRate.toFixed(4)}</span>
            </>
          ) : (
            <>; FX rate unavailable</>
          )}
          . Prices refresh automatically every day at 11:00 UTC.
        </p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background-soft/80 text-muted">
              <tr>
                <Th onClick={() => toggleSort("released")} active={sortKey === "released"} dir={sortDir} className="text-left">
                  Released
                </Th>
                <Th onClick={() => toggleSort("set")} active={sortKey === "set"} dir={sortDir} className="text-left">
                  Set
                </Th>
                <Th className="text-left">ETB</Th>
                <Th onClick={() => toggleSort("promo")} active={sortKey === "promo"} dir={sortDir} className="text-left">
                  Promo
                </Th>
                <Th className="text-left">Top chase</Th>
                <Th onClick={() => toggleSort("sealed")} active={sortKey === "sealed"} dir={sortDir} className="text-right">
                  Sealed ETB (CAD)
                </Th>
                <Th onClick={() => toggleSort("promoRaw")} active={sortKey === "promoRaw"} dir={sortDir} className="text-right">
                  Promo raw (CAD)
                </Th>
                <Th onClick={() => toggleSort("topTotal")} active={sortKey === "topTotal"} dir={sortDir} className="text-right">
                  Top 5 total (CAD)
                </Th>
                <Th onClick={() => toggleSort("ratio")} active={sortKey === "ratio"} dir={sortDir} className="text-right">
                  ETB to top cards ratio
                </Th>
                <Th onClick={() => toggleSort("chaseRatio")} active={sortKey === "chaseRatio"} dir={sortDir} className="text-right">
                  ETB to chase ratio
                </Th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const isOpen = expanded.has(row.id);
                const top1 = row.topChases[0];
                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => toggleExpand(row.id)}
                      className={`border-t border-border hover:bg-background-soft/40 transition cursor-pointer ${isOpen ? "bg-background-soft/30" : ""}`}
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-foreground">
                          {row.month.slice(0, 3)} {row.year}
                        </div>
                        <span className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border ${ERA_BADGE[row.era]}`}>
                          {row.era === "mep" ? "Mega" : row.era === "sv" ? "S&V" : "SWSH"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <a
                          href={row.pcEtbUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-foreground hover:text-accent transition"
                        >
                          {row.setName}
                        </a>
                      </td>
                      <td className="px-3 py-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={
                            row.etbImage ||
                            `https://images.pokemontcg.io/${row.setId}/logo.png`
                          }
                          alt=""
                          className={`h-14 w-14 object-contain rounded bg-black/30 ${row.etbImage ? "" : "p-1"}`}
                          loading="lazy"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {row.promoSetId && row.promoCardNum ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={
                                row.promoImage ||
                                `https://images.pokemontcg.io/${row.promoSetId}/${row.promoCardNum}_hires.png`
                              }
                              alt=""
                              className="h-12 w-9 object-contain rounded bg-black/30"
                              loading="lazy"
                            />
                          ) : null}
                          <a
                            href={row.pcPromoUrl || "#"}
                            target={row.pcPromoUrl ? "_blank" : undefined}
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-foreground/90 hover:text-accent transition truncate max-w-[140px]"
                          >
                            {row.promoName}
                          </a>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {top1 ? (
                          <div className="flex items-center gap-2">
                            {top1.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={top1.image}
                                alt=""
                                className="h-12 w-9 object-contain rounded bg-black/30"
                                loading="lazy"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="text-foreground/90 truncate max-w-[140px] text-xs">
                                {top1.name}
                              </div>
                              <div className="text-[10px] text-muted">
                                {fmtCad(top1.market, cadRate)}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">
                        <span className={row.sealed ? "text-accent" : "text-foreground/40"}>
                          {fmtCad(row.sealed, cadRate)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className={row.promoRaw ? "text-foreground" : "text-foreground/40"}>
                          {fmtCad(row.promoRaw, cadRate)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className={row.topChasesTotal ? "text-foreground" : "text-foreground/40"}>
                          {fmtCad(row.topChasesTotal, cadRate)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted">
                        {fmtPct(ratioOf(row))}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted">
                        {fmtPct(chaseRatioOf(row))}
                      </td>
                      <td className="px-2 py-3 text-muted">
                        <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-background-soft/20 border-t border-border">
                        <td colSpan={11} className="px-4 py-4">
                          {row.topChases.length === 0 ? (
                            <p className="text-xs text-muted">
                              No chase cards with TCGPlayer market prices found for{" "}
                              {row.setName}.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-wider text-muted">
                                Top 5 chase cards ·{" "}
                                {row.topChases[0]?.source === "pricecharting" ? (
                                  <span className="text-amber-300">PriceCharting ungraded (TCGPlayer prices not yet listed for this set)</span>
                                ) : (
                                  <span>TCGPlayer market</span>
                                )}
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                {row.topChases.map((c, idx) => {
                                  const inner = (
                                    <>
                                      <span className="text-xs text-muted w-4 text-center">
                                        {idx + 1}
                                      </span>
                                      {c.image && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={c.image}
                                          alt=""
                                          className="h-16 w-12 object-contain rounded bg-black/30"
                                          loading="lazy"
                                        />
                                      )}
                                      <div className="min-w-0">
                                        <div className="text-xs text-foreground truncate">
                                          {c.name}
                                        </div>
                                        <div className="text-[10px] text-muted truncate">
                                          {c.rarity}
                                        </div>
                                        <div className="text-sm font-semibold text-accent tabular-nums">
                                          {fmtCad(c.market, cadRate)}
                                        </div>
                                      </div>
                                    </>
                                  );
                                  return c.sourceUrl ? (
                                    <a
                                      key={c.id}
                                      href={c.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="rounded-lg border border-border bg-black/20 p-2 flex gap-2 items-center hover:border-accent/40 transition"
                                    >
                                      {inner}
                                    </a>
                                  ) : (
                                    <div
                                      key={c.id}
                                      className="rounded-lg border border-border bg-black/20 p-2 flex gap-2 items-center"
                                    >
                                      {inner}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Th({
  children,
  className = "",
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
}) {
  const sortable = !!onClick;
  return (
    <th
      onClick={onClick}
      className={`px-3 py-3 text-[11px] uppercase tracking-wider font-medium select-none ${className} ${sortable ? "cursor-pointer hover:text-foreground" : ""}`}
    >
      <span className={`inline-flex items-center gap-1 ${active ? "text-accent" : ""}`}>
        {children}
        {sortable && (
          <span className="text-[8px] opacity-60">
            {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        )}
      </span>
    </th>
  );
}
