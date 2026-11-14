// src/import/sicro/files.ts
// Recognises the DNIT report files by name ("DF 07-2026 Relatório Sintético de
// Mão de Obra - com desoneração.xlsx" …). The PDFs are ignored.
import path from "node:path";
import type { SicroFiles } from "./types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface SicroFileSet extends Partial<SicroFiles> { uf?: string; ignored: string[] }

export function classifySicroFiles(paths: string[]): SicroFileSet {
  const out: SicroFileSet = { labor: {}, equipment: {}, ignored: [] };
  for (const p of paths) {
    const name = norm(path.basename(p));
    if (!name.endsWith(".xlsx")) { out.ignored.push(p); continue; }
    const uf = /^([a-z]{2})\s+\d{2}-\d{4}\s/.exec(name)?.[1]?.toUpperCase();
    if (uf) out.uf ??= uf;
    const desonerado = name.includes("com desoneracao");
    if (name.includes("analitico de composicoes")) out.analytic = p;
    else if (name.includes("sintetico de composicoes")) out.syntheticCompositions = p;
    else if (name.includes("sintetico de materiais")) out.materials = p;
    else if (name.includes("sintetico de mao de obra")) out.labor![desonerado ? "DESONERADO" : "NAO_DESONERADO"] = p;
    else if (name.includes("sintetico de equipamentos")) out.equipment![desonerado ? "DESONERADO" : "NAO_DESONERADO"] = p;
    else if (name.includes("origem de precos")) out.priceOrigin = p;
    else out.ignored.push(p); // analíticos de mão de obra e de encargos: não usados no cálculo
  }
  return out;
}
