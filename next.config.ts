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
  // Uso local no Mac (decisão #85): build autossuficiente (.next/standalone), instalado
  // fora de Documentos por local/instalar.sh. O worker do pdf.js é carregado por
  // import dinâmico, que o rastreamento de arquivos não enxerga.
  output: "standalone",
  outputFileTracingIncludes: { "/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"] },
};

export default nextConfig;
