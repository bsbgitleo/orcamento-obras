import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components require Suspense boundaries around every DB read; the MVP
  // renders dynamically. Revisit when adding caching.
  cacheComponents: false,
  partialPrefetching: false,
  // Importação de planilha orçamentária (.xlsx) por server action (decisão #62)
  // e das propostas recebidas, até 10 MB (decisão #76)
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  // pdf.js lê as propostas em PDF no servidor; carregado do node_modules, sem empacotar
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
