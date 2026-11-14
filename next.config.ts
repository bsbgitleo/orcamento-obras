import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components require Suspense boundaries around every DB read; the MVP
  // renders dynamically. Revisit when adding caching.
  cacheComponents: false,
  partialPrefetching: false,
  // Importação de planilha orçamentária (.xlsx) por server action (decisão #62)
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
