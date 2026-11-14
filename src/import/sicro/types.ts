// src/import/sicro/types.ts
// Shapes produced by the SICRO (DNIT) report parsers — pure data, no Prisma.

export type SicroRegime = "NAO_DESONERADO" | "DESONERADO";

export interface SicroInput {
  code: string; // P9801, E9050, M0798
  description: string;
  unit: string;
  kind: "MAO_DE_OBRA" | "EQUIPAMENTO" | "MATERIAL";
  /** Preço com 4 casas; equipamento: custo produtivo. null = em branco no relatório */
  unitPrice: string | null;
  productiveCost: string | null;
  unproductiveCost: string | null;
  /** Tipo de origem do preço na UF (PC, PFM, PRZ…), do Relatório de Origem de Preços */
  priceOrigin: string | null;
}

export type SicroItem =
  | { group: "A"; code: string; coefficient: string; operativeUse: string; unproductiveUse: string }
  | { group: "B" | "C"; code: string; coefficient: string }
  | { group: "D"; compositionCode: string; coefficient: string }
  | { group: "E"; materialCode: string; compositionCode: string; coefficient: string }
  | { group: "F"; materialCode: string; coefficient: string; transportCodes: string[] }
  | { group: "PCT"; section: "A" | "B" | "C" | "D"; percent: string; label: string };

export interface SicroComposition {
  code: string; // 7 dígitos
  description: string;
  unit: string;
  production: string | null;
  fic: string | null;
  /** Custo publicado no Relatório Sintético de Composições (2 casas) */
  publishedCost: string | null;
  items: SicroItem[];
}

export interface SicroFiles {
  analytic: string;
  syntheticCompositions?: string;
  materials: string;
  labor: Partial<Record<SicroRegime, string>>;
  equipment: Partial<Record<SicroRegime, string>>;
  priceOrigin?: string;
  /** Relatório Analítico de Encargos Sociais e Trabalhistas, por regime (decisão #70) */
  charges?: Partial<Record<SicroRegime, string>>;
}

export interface SicroLaborCharge {
  code: string; // P9801
  description: string;
  unit: string;
  /** Item → percentual com 4 casas ("A1" → "20") */
  items: Record<string, string>;
  groups: { A: string; B: string; C: string; D: string };
  /** Total publicado (2 casas) */
  total: string;
}

export interface SicroChargeLegend {
  /** "A" → "Encargos Sociais" */
  groups: Record<string, string>;
  /** "A1" → "INSS" */
  items: Record<string, string>;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Julho/2026" → "2026-07" */
export function parseSicroMonth(text: string): string | null {
  const m = /^\s*([a-zç]+)\s*\/\s*(\d{4})\s*$/i.exec(text);
  if (!m) return null;
  const i = MONTHS.indexOf(m[1].toLowerCase());
  return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, "0")}`;
}

/** Composition codes are 7 digits; numeric cells lose the leading zero. */
export function compositionCode7(v: string): string {
  const t = v.trim();
  return /^\d{1,7}$/.test(t) ? t.padStart(7, "0") : t;
}
