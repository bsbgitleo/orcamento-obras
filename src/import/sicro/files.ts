// src/import/sicro/files.ts
// Recognises the DNIT report files by name ("DF 07-2026 Relatório Sintético de
// Mão de Obra - com desoneração.xlsx" …). The PDFs are ignored. Matching is
// tolerant to lost or garbled accents (names inside ZIPs, "_" for spaces).
import path from "node:path";
import type { SicroFiles } from "./types";

/** Lower case, no accents; any other non-alphanumeric character becomes a space. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9.\-]+/g, " ").replace(/\s+/g, " ").trim();
}

// Um caractere acentuado pode ter virado 0–2 caracteres estranhos (ou um espaço)
const A = "[a-z ]{0,2}";
const RE = {
  analytic: new RegExp(`anal${A}tico de composi`),
  syntheticCompositions: new RegExp(`sint${A}tico de composi`),
  materials: new RegExp(`sint${A}tico de materiais`),
  labor: new RegExp(`sint${A}tico de m${A}o de obra`),
  equipment: new RegExp(`sint${A}tico de equipamentos`),
  priceOrigin: new RegExp(`origem de pre${A}os`),
  desonerado: /com desonera/,
};

export interface SicroFileSet extends Partial<SicroFiles> { uf?: string; ignored: string[] }

/**
 * `names` (optional) are the original file names, when the files were saved
 * under other names (upload folder); otherwise the path's base name is used.
 */
export function classifySicroFiles(paths: string[], names?: string[]): SicroFileSet {
  const out: SicroFileSet = { labor: {}, equipment: {}, ignored: [] };
  paths.forEach((p, i) => {
    const name = norm(names?.[i] ?? path.basename(p));
    if (!name.endsWith(".xlsx")) { out.ignored.push(p); return; }
    const uf = /(?:^|\s)([a-z]{2}) \d{2}-\d{4}(?:\s|$)/.exec(name)?.[1]?.toUpperCase();
    if (uf) out.uf ??= uf;
    const regime = RE.desonerado.test(name) ? "DESONERADO" : "NAO_DESONERADO";
    if (RE.analytic.test(name)) out.analytic = p;
    else if (RE.syntheticCompositions.test(name)) out.syntheticCompositions = p;
    else if (RE.materials.test(name)) out.materials = p;
    else if (RE.labor.test(name)) out.labor![regime] = p;
    else if (RE.equipment.test(name)) out.equipment![regime] = p;
    else if (RE.priceOrigin.test(name)) out.priceOrigin = p;
    else out.ignored.push(p); // analíticos de mão de obra e de encargos: não usados no cálculo
  });
  return out;
}
