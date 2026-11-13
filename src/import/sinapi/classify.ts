// src/import/sinapi/classify.ts
// Identifies which SINAPI workbook a file is by its sheet names (file names
// inside the Caixa zip come with broken accents, e.g. "SINAPI_Refer+?ncia").
import { readSheetNames } from "./workbook";
import { SINAPI_LABOR_SHEETS, SINAPI_SHEETS } from "./types";
import { MAINTENANCE_SHEET } from "./parse-maintenance";

export type SinapiFileKind = "REFERENCE" | "LABOR_SHARE" | "MAINTENANCE" | "UNKNOWN";

export function classifyBySheetNames(names: Iterable<string>): SinapiFileKind {
  const set = new Set(names);
  const refSheets = Object.values(SINAPI_SHEETS).flatMap((s) => [s.inputs, s.compositions]);
  if (refSheets.some((s) => set.has(s)) && (set.has("Analítico") || set.has("Analítico com Custo"))) return "REFERENCE";
  if (Object.values(SINAPI_LABOR_SHEETS).some((s) => s && set.has(s))) return "LABOR_SHARE";
  if (set.has(MAINTENANCE_SHEET)) return "MAINTENANCE";
  return "UNKNOWN";
}

export async function classifySinapiWorkbook(path: string): Promise<SinapiFileKind> {
  try {
    const names = await readSheetNames(path);
    return classifyBySheetNames(names.values());
  } catch {
    return "UNKNOWN"; // não é um .xlsx válido
  }
}

export interface SinapiPackage {
  reference?: string;
  laborShare?: string;
  maintenance?: string;
  /** Arquivos que não são de nenhum dos três tipos (ex.: famílias e coeficientes) */
  ignored: string[];
}

/** Classifies a list of .xlsx paths. Two files of the same kind is an error. */
export async function buildSinapiPackage(paths: string[]): Promise<SinapiPackage> {
  const pkg: SinapiPackage = { ignored: [] };
  const label: Record<Exclude<SinapiFileKind, "UNKNOWN">, string> = {
    REFERENCE: "SINAPI_Referência", LABOR_SHARE: "SINAPI_mao_de_obra", MAINTENANCE: "SINAPI_Manutenções",
  };
  for (const p of paths) {
    const kind = await classifySinapiWorkbook(p);
    const key = kind === "REFERENCE" ? "reference" : kind === "LABOR_SHARE" ? "laborShare" : kind === "MAINTENANCE" ? "maintenance" : null;
    if (!key) { pkg.ignored.push(p); continue; }
    if (pkg[key]) throw new Error(`Foram enviados dois arquivos do tipo ${label[kind as keyof typeof label]}. Envie um de cada.`);
    pkg[key] = p;
  }
  return pkg;
}
