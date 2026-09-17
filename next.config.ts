import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prerendering "/" scrapes every tracked ETB from PriceCharting (plus promo
  // and top-chase lookups), which runs well past the 60s default and fails the
  // build outright. The page is ISR with a snapshot fallback, so a slow build
  // render is expected rather than a symptom.
  staticPageGenerationTimeout: 300,
};

export default nextConfig;
