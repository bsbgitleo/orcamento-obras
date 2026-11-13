import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components require Suspense boundaries around every DB read; the MVP
  // renders dynamically. Revisit when adding caching.
  cacheComponents: false,
  partialPrefetching: false,
};

export default nextConfig;
