// src/core/bdi.ts
// BDI (Benefícios e Despesas Indiretas) — fórmula do Acórdão TCU 2622/2013:
//
//   BDI = [ (1 + AC + S + R + G) × (1 + DF) × (1 + L) / (1 − I) ] − 1
//
// AC = administração central, S = seguro, R = risco, G = garantia,
// DF = despesas financeiras, L = lucro, I = tributos (PIS + COFINS + ISS + CPRB).
// IRPJ e CSLL não entram (Súmula TCU 254). Ver 06-tcu-engenharia-custos-regras.md §7.
import { D, ONE, pct, type Dec, type DecimalInput } from "./money";

/** All fields are percentages, e.g. "5" means 5 %. */
export interface BdiInput {
  centralAdministration: DecimalInput; // AC
  insurance: DecimalInput; // S
  risk: DecimalInput; // R
  guarantee: DecimalInput; // G
  financialExpenses: DecimalInput; // DF
  profit: DecimalInput; // L
  taxes: {
    pis: DecimalInput;
    cofins: DecimalInput;
    iss: DecimalInput; // alíquota efetiva do município da obra
    cprb?: DecimalInput; // só quando a empresa opta pela desoneração
  };
}

export interface BdiResult {
  /** Soma dos tributos (I), em percentual. */
  taxesPct: Dec;
  /** BDI como fração (0.2386). */
  factor: Dec;
  /** BDI em percentual com 2 casas (23.86). */
  percent: Dec;
}

export function totalTaxesPct(taxes: BdiInput["taxes"]): Dec {
  return D(taxes.pis).plus(taxes.cofins).plus(taxes.iss).plus(taxes.cprb ?? 0);
}

export function calculateBdi(input: BdiInput): BdiResult {
  const ac = pct(input.centralAdministration);
  const s = pct(input.insurance);
  const r = pct(input.risk);
  const g = pct(input.guarantee);
  const df = pct(input.financialExpenses);
  const l = pct(input.profit);
  const taxesPct = totalTaxesPct(input.taxes);
  const i = pct(taxesPct);

  if (i.gte(ONE)) throw new Error("Tributos devem ser menores que 100%.");

  const factor = ONE.plus(ac).plus(s).plus(r).plus(g)
    .times(ONE.plus(df))
    .times(ONE.plus(l))
    .div(ONE.minus(i))
    .minus(ONE);

  return {
    taxesPct,
    factor,
    percent: factor.times(100).toDecimalPlaces(2),
  };
}

/**
 * Preço de venda = custo direto × (1 + BDI).
 * Usa o BDI em percentual com 2 casas (o valor declarado na planilha), e não o
 * fator bruto, para que o preço bata com o demonstrativo do BDI (decisão #10).
 * Não arredonda o resultado; o chamador decide.
 */
export function applyBdi(directCost: DecimalInput, bdiPercent: DecimalInput): Dec {
  return D(directCost).times(ONE.plus(pct(bdiPercent)));
}

/**
 * Faixas de referência do Acórdão TCU 2622/2013 (1º quartil / médio / 3º quartil)
 * para BDI total por tipo de obra. Servem de alerta em obra pública, não de bloqueio.
 */
// Fonte: Acórdão 2622/2013-TCU-Plenário, item 9.1 ("Valores do BDI por tipo de obra").
export type WorkType =
  | "EDIFICACOES"
  | "RODOVIAS_FERROVIAS"
  | "REDES_AGUA_ESGOTO"
  | "PORTUARIAS_MARITIMAS_FLUVIAIS"
  | "ESTACOES_REDES_ENERGIA_ELETRICA"
  | "FORNECIMENTO_MATERIAIS_EQUIPAMENTOS";

export const TCU_BDI_RANGES: Record<WorkType, { q1: string; median: string; q3: string }> = {
  EDIFICACOES: { q1: "20.34", median: "22.12", q3: "25.00" },
  RODOVIAS_FERROVIAS: { q1: "19.60", median: "20.97", q3: "24.23" },
  REDES_AGUA_ESGOTO: { q1: "20.76", median: "24.18", q3: "26.44" },
  PORTUARIAS_MARITIMAS_FLUVIAIS: { q1: "22.80", median: "27.48", q3: "30.95" },
  ESTACOES_REDES_ENERGIA_ELETRICA: { q1: "24.00", median: "25.84", q3: "27.86" },
  FORNECIMENTO_MATERIAIS_EQUIPAMENTOS: { q1: "11.10", median: "14.02", q3: "16.80" },
};

export type BdiRangeStatus = "BELOW" | "WITHIN" | "ABOVE";

export function classifyBdi(percent: DecimalInput, workType: WorkType): BdiRangeStatus {
  const p = D(percent);
  const { q1, q3 } = TCU_BDI_RANGES[workType];
  if (p.lt(q1)) return "BELOW";
  if (p.gt(q3)) return "ABOVE";
  return "WITHIN";
}
