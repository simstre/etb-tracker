import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy & Contact — ETB Tracker",
  description: "How ETB Tracker handles visitor data, and how to get in touch.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16 space-y-8">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          &larr; Back to the tracker
        </Link>

        <header className="space-y-2">
          <span className="text-xs uppercase tracking-[0.25em] text-muted">
            Pokémon Center · ETB Tracker
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Privacy &amp; Contact</h1>
          <p className="text-xs text-muted">Last updated 24 September 2026</p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed text-muted">
          <h2 className="text-lg font-semibold text-foreground">Privacy</h2>
          <p>
            ETB Tracker is a free price reference. There are no accounts, forms or sign-ups, and
            we don&apos;t collect anything about the people who visit. There are no analytics,
            ads, cookies or tracking, and nothing is sold.
          </p>
          <p>
            The site is hosted by <span className="text-foreground">Vercel</span>, which processes
            requests (including IP addresses) to deliver pages. Product images load from
            PriceCharting&apos;s image host on <span className="text-foreground">Google Cloud
            Storage</span>, which receives your IP address when your browser fetches them. Prices
            are gathered by our server, so your browser never contacts PriceCharting or the
            exchange-rate service directly.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-lg font-semibold">Contact</h2>
          <div className="rounded-xl border border-border bg-background-soft px-5 py-4 text-muted">
            Questions, corrections or data requests:{" "}
            <a
              href="mailto:velvetloop.admin@gmail.com"
              className="text-accent underline underline-offset-2"
            >
              velvetloop.admin@gmail.com
            </a>
          </div>
        </section>

        <footer className="pt-10 border-t border-border text-xs text-muted">
          Not affiliated with The Pokémon Company.
        </footer>
      </div>
    </main>
  );
}
