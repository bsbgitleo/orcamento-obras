// src/import/sinapi/types.ts
// Shapes produced by the SINAPI workbook parsers (pure data, no Prisma).

export type SinapiRegime = "NAO_DESONERADO" | "DESONERADO" | "SEM_ENCARGOS";

/** Sheet names in "SINAPI_Referência_AAAA_MM.xlsx" per regime. */
export const SINAPI_SHEETS: Record<SinapiRegime, { inputs: string; compositions: string }> = {
  NAO_DESONERADO: { inputs: "ISD", compositions: "CSD" },
  DESONERADO: { inputs: "ICD", compositions: "CCD" },
  SEM_ENCARGOS: { inputs: "ISE", compositions: "CSE" },
};

/** Sheet names in "SINAPI_mao_de_obra_AAAA_MM.xlsx". */
export const SINAPI_LABOR_SHEETS: Partial<Record<SinapiRegime, string>> = {
  NAO_DESONERADO: "SEM Desoneração",
  DESONERADO: "COM Desoneração",
};

export interface ParsedInput {
  code: string;
  description: string;
  unit: string;
  /** Classificação original (MATERIAL, MAO DE OBRA, EQUIPAMENTO (AQUISIÇÃO), ...). */
  sourceClass: string;
  /** C | CR | AS | ... */
  priceOrigin: string | null;
  /** Price as decimal string ("18.52"); null when blank for the UF and for the fallback UF. */
  unitPrice: string | null;
  /** Set when the UF price was blank and the SP price was used (SINAPI's own rule). */
  priceFallbackUf: string | null;
}

export interface ParsedComposition {
  code: string;
  group: string;
  description: string;
  unit: string;
  /** Custo publicado para a UF (decimal string) ou null. */
  referenceCost: string | null;
  /** %AS: fração do custo que veio de preços atribuídos por similaridade. */
  asShare: string | null;
  /** COM CUSTO | SEM CUSTO | EM ESTUDO (from "Analítico"). */
  status: string | null;
  items: ParsedCompositionItem[];
}

export interface ParsedCompositionItem {
  type: "INSUMO" | "COMPOSICAO";
  code: string;
  description: string;
  unit: string;
  /** Decimal string, up to 7 places. */
  coefficient: string;
  /** COM PREÇO | SEM PREÇO | COM CUSTO | SEM CUSTO | EM ESTUDO */
  status: string | null;
}

export interface ParsedReference {
  referenceMonth: string; // "2026-10"
  uf: string;
  regime: SinapiRegime;
  /** Encargos sociais sobre a mão de obra (fração), quando a aba os publica. */
  socialCharges: { hourly: string; monthly: string } | null;
  inputs: ParsedInput[];
  compositions: ParsedComposition[];
}

export interface ParseReferenceOptions {
  uf: string;
  regime: SinapiRegime;
  /** UF usada quando o preço da UF pedida está em branco. SINAPI usa "SP". */
  fallbackUf?: string;
  onProgress?: (message: string) => void;
}
