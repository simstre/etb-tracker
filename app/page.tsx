import { Suspense } from "react";
import Link from "next/link";
import { getAllPrices, getTrackedEtbs } from "../lib/all-prices";
import { fetchUsdToCad } from "../lib/fx";
import { EtbTable } from "../components/EtbTable";

export const revalidate = 21600;

async function PricedTable() {
  const [rows, cadRate] = await Promise.all([getAllPrices(), fetchUsdToCad()]);
  return <EtbTable rows={rows} cadRate={cadRate} />;
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="h-12 bg-background-soft/80 shimmer" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-16 border-t border-border shimmer" />
      ))}
    </div>
  );
}

export default async function Home() {
  // Counts come from the same merged list the table renders, so auto-discovered
  // ETBs are included rather than only the hardcoded ones.
  const tracked = await getTrackedEtbs();
  const totalEtbs = tracked.length;
  const totalSets = new Set(tracked.map((e) => e.setId)).size;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-5 md:px-8 py-12 md:py-16 space-y-12">
        <header className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="relative size-10 rounded-full overflow-hidden shadow-lg">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: "linear-gradient(180deg, #ef4444 0 50%, #fff 50% 100%)",
                }}
              />
              <div className="absolute inset-x-0 top-1/2 h-[3px] bg-black/85 -translate-y-[1.5px]" />
              <div className="absolute inset-0 m-auto size-3.5 rounded-full bg-white border-[3px] border-black/85" />
            </div>
            <span className="text-xs uppercase tracking-[0.25em] text-muted">
              Pokémon Center · ETB Tracker
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight max-w-3xl leading-[1.1]">
            Every Pokémon Center Exclusive
            <br />
            <span className="bg-gradient-to-r from-accent via-accent-soft to-poke-blue bg-clip-text text-transparent">
              Elite Trainer Box
            </span>{" "}
            since 2021, in one sortable view.
          </h1>

          <p className="text-base text-muted max-w-2xl leading-relaxed">
            Tracking <span className="text-foreground font-semibold">{totalEtbs}</span> ETBs
            across <span className="text-foreground font-semibold">{totalSets}</span> sets, from
            Shining Fates through the Mega Evolution era. Sealed-box, promo, and top-5 chase
            prices are scraped live from PriceCharting — one source throughout, so every row
            is comparable — and converted to <span className="text-foreground">CAD</span> at
            the live USD/CAD rate from open.er-api.com. No estimates, no fabrication.
            Refreshed automatically once a day.
          </p>
        </header>

        <Suspense fallback={<TableSkeleton />}>
          <PricedTable />
        </Suspense>

        <footer className="pt-10 border-t border-border text-xs text-muted">
          Prices: PriceCharting · Set data: pokemontcg.io. Not affiliated with The Pokémon Company.
          {" · "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy &amp; Contact
          </Link>
        </footer>
      </div>
    </main>
  );
}
