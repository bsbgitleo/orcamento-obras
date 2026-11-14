// src/core/proposals/compare.ts
// Casamento dos itens da proposta com a planilha do orçamento e mapa
// comparativo com equalização (decisões #76–#79).
//
//   casamento   pela numeração do item (1.1 = 01.01); sem numeração igual, pela
//               descrição; o que sobra é item acrescentado pela proponente;
//   equalizado  por item do orçamento: quantidade DO ORÇAMENTO × preço unitário
//               ofertado, ARRED(…; 2) como na planilha para proponentes; item sem
//               preço recebe o MAIOR preço unitário das demais proponentes (ou o
//               de referência, se nenhuma cotou); itens acrescentados ficam à
//               parte e não entram no equalizado (#77, #78);
//   alertas     preço unitário 30 % acima ou abaixo da mediana das propostas ou
//               da referência; total equalizado abaixo de 75 % do orçado
//               (Lei 14.133, art. 59, § 4º); prazo e validade fora do exigido;
//               soma da proponente diferente do total que ela declarou (#79).
import Decimal from "decimal.js";
import { normText } from "./types";

export const OUTLIER = new Decimal("0.30");
export const INEXEQUIBLE = new Decimal("0.75");

export interface RefItem {
  nodeId: string;
  item: string;
  description: string;
  unit: string | null;
  quantity: string | null;
  /** Preço unitário de referência (com BDI) */
  unitPrice: string | null;
}

export interface ProposalLineIn {
  id?: string;
  nodeId: string | null;
  item: string | null;
  description: string;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  totalPrice: string | null;
}

export interface ProposalIn {
  id: string;
  name: string;
  executionDays: number | null;
  validityDays: number | null;
  declaredTotal: string | null;
  lines: ProposalLineIn[];
}

export interface Rules {
  maxExecutionDays: number | null;
  minValidityDays: number | null;
}

/* ---------- casamento ---------- */

export const normItem = (s: string | null) => (s ?? "").trim().replace(/\.$/, "").split(".").map((p) => String(Number(p))).join(".");
const descKey = (s: string) => normText(s).replace(/[^a-z0-9 ]/g, "").slice(0, 60);

export function matchLines<T extends { item: string | null; description: string }>(lines: T[], ref: RefItem[]): (T & { nodeId: string | null; matchedBy: "item" | "description" | null })[] {
  const byItem = new Map(ref.map((r) => [normItem(r.item), r]));
  const taken = new Set<string>();
  const out = lines.map((l) => {
    const r = l.item ? byItem.get(normItem(l.item)) : undefined;
    if (r && !taken.has(r.nodeId)) { taken.add(r.nodeId); return { ...l, nodeId: r.nodeId, matchedBy: "item" as const }; }
    return { ...l, nodeId: null as string | null, matchedBy: null as "item" | "description" | null };
  });
  // Sem numeração igual: pela descrição (início igual)
  for (const l of out) {
    if (l.nodeId) continue;
    const k = descKey(l.description);
    if (k.length < 12) continue;
    const r = ref.find((x) => !taken.has(x.nodeId) && (descKey(x.description).startsWith(k) || k.startsWith(descKey(x.description))));
    if (r) { taken.add(r.nodeId); l.nodeId = r.nodeId; l.matchedBy = "description"; }
  }
  return out;
}

/* ---------- comparação ---------- */

export type Flag = "sem-preco" | "quantidade" | "acima" | "abaixo" | "preenchido";

export interface Cell {
  /** Preço unitário ofertado */
  unitPrice: Decimal | null;
  quantity: Decimal | null;
  /** Total como a proponente cotou (o dela, ou ARRED(qtd dela × preço; 2)) */
  quotedTotal: Decimal | null;
  /** Preço unitário usado na equalização */
  equalizedUnit: Decimal | null;
  equalizedTotal: Decimal;
  flags: Flag[];
  /** Desvio do preço em relação à mediana das propostas (0,35 = +35 %) */
  vsMedian: Decimal | null;
  vsReference: Decimal | null;
}

export interface CompareRow {
  ref: RefItem;
  referenceTotal: Decimal;
  median: Decimal | null;
  cells: Cell[];
  /** Índice da proposta com o menor preço unitário */
  lowest: number | null;
}

export interface ProposalSummary {
  id: string;
  name: string;
  /** Soma de todas as linhas da proponente, inclusive acrescentadas */
  quotedTotal: Decimal;
  declaredTotal: Decimal | null;
  /** Total declarado difere da soma das linhas */
  arithmeticGap: Decimal | null;
  equalizedTotal: Decimal;
  vsReference: Decimal | null;
  extras: (ProposalLineIn & { total: Decimal })[];
  extrasTotal: Decimal;
  counts: { missing: number; filled: number; quantity: number; outliers: number };
  flags: ("prazo" | "validade" | "inexequivel" | "soma")[];
  executionDays: number | null;
  validityDays: number | null;
  rank: number;
}

export interface Comparison {
  rows: CompareRow[];
  proposals: ProposalSummary[];
  referenceTotal: Decimal;
}

const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const dec = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? null : new Decimal(v));

function median(values: Decimal[]): Decimal | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a.comparedTo(b));
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : s[m - 1].plus(s[m]).div(2);
}

const deviation = (p: Decimal, base: Decimal | null) => (base && base.gt(0) ? p.div(base).minus(1) : null);

export function compareProposals(ref: RefItem[], proposals: ProposalIn[], rules: Rules): Comparison {
  const lineFor = proposals.map((p) => {
    const m = new Map<string, ProposalLineIn>();
    for (const l of p.lines) if (l.nodeId && !m.has(l.nodeId)) m.set(l.nodeId, l);
    return m;
  });

  const rows: CompareRow[] = ref.map((r) => {
    const qRef = dec(r.quantity) ?? new Decimal(0);
    const refPrice = dec(r.unitPrice);
    const offered = proposals.map((_, k) => {
      const l = lineFor[k].get(r.nodeId);
      const pu = dec(l?.unitPrice);
      return pu && pu.gt(0) ? pu : null;
    });
    const priced = offered.filter((x): x is Decimal => x !== null);
    const med = median(priced);
    const cells: Cell[] = proposals.map((_, k) => {
      const l = lineFor[k].get(r.nodeId);
      const pu = offered[k];
      const q = dec(l?.quantity);
      const flags: Flag[] = [];
      let eqUnit: Decimal | null = pu;
      if (!pu) {
        flags.push("sem-preco");
        const others = offered.filter((x, j): x is Decimal => j !== k && x !== null);
        eqUnit = others.length ? Decimal.max(...others) : refPrice;
        if (eqUnit) flags.push("preenchido");
      }
      if (l && q && !q.minus(qRef).abs().lte(new Decimal("0.0001").times(Decimal.max(1, qRef)))) flags.push("quantidade");
      const vsMedian = pu && priced.length >= 2 ? deviation(pu, med) : null;
      const vsReference = pu ? deviation(pu, refPrice) : null;
      if (pu && ((vsMedian && vsMedian.gt(OUTLIER)) || (vsReference && vsReference.gt(OUTLIER)))) flags.push("acima");
      if (pu && ((vsMedian && vsMedian.lt(OUTLIER.neg())) || (vsReference && vsReference.lt(OUTLIER.neg())))) flags.push("abaixo");
      const quotedTotal = l ? dec(l.totalPrice) ?? (pu && q ? r2(q.times(pu)) : null) : null;
      return { unitPrice: pu, quantity: q, quotedTotal, equalizedUnit: eqUnit, equalizedTotal: eqUnit ? r2(qRef.times(eqUnit)) : new Decimal(0), flags, vsMedian, vsReference };
    });
    let lowest: number | null = null;
    offered.forEach((p, k) => { if (p && (lowest === null || p.lt(offered[lowest]!))) lowest = k; });
    return { ref: r, referenceTotal: refPrice ? r2(qRef.times(refPrice)) : new Decimal(0), median: med, cells, lowest };
  });

  const referenceTotal = rows.reduce((a, r) => a.plus(r.referenceTotal), new Decimal(0));
  const refIds = new Set(ref.map((r) => r.nodeId));
  const summaries: ProposalSummary[] = proposals.map((p, k) => {
    const lineTotal = (l: ProposalLineIn) => dec(l.totalPrice) ?? (dec(l.unitPrice) && dec(l.quantity) ? r2(dec(l.quantity)!.times(dec(l.unitPrice)!)) : new Decimal(0));
    const seen = new Set<string>();
    const extras = p.lines.filter((l) => {
      if (!l.nodeId || !refIds.has(l.nodeId)) return true;
      if (seen.has(l.nodeId)) return true; // repetido: o segundo fica à parte
      seen.add(l.nodeId);
      return false;
    }).map((l) => ({ ...l, total: lineTotal(l) }));
    const quotedTotal = p.lines.reduce((a, l) => a.plus(lineTotal(l)), new Decimal(0));
    const equalizedTotal = rows.reduce((a, r) => a.plus(r.cells[k].equalizedTotal), new Decimal(0));
    const declared = dec(p.declaredTotal);
    const gap = declared ? declared.minus(quotedTotal) : null;
    const counts = { missing: 0, filled: 0, quantity: 0, outliers: 0 };
    for (const r of rows) {
      const f = r.cells[k].flags;
      if (f.includes("sem-preco")) counts.missing++;
      if (f.includes("preenchido")) counts.filled++;
      if (f.includes("quantidade")) counts.quantity++;
      if (f.includes("acima") || f.includes("abaixo")) counts.outliers++;
    }
    const flags: ProposalSummary["flags"] = [];
    if (rules.maxExecutionDays && p.executionDays && p.executionDays > rules.maxExecutionDays) flags.push("prazo");
    if (rules.minValidityDays && p.validityDays && p.validityDays < rules.minValidityDays) flags.push("validade");
    if (referenceTotal.gt(0) && equalizedTotal.lt(referenceTotal.times(INEXEQUIBLE))) flags.push("inexequivel");
    if (gap && gap.abs().gt("0.05")) flags.push("soma");
    return {
      id: p.id, name: p.name, quotedTotal, declaredTotal: declared, arithmeticGap: gap && gap.abs().gt("0.05") ? gap : null,
      equalizedTotal, vsReference: deviation(equalizedTotal, referenceTotal), extras,
      extrasTotal: extras.reduce((a, e) => a.plus(e.total), new Decimal(0)),
      counts, flags, executionDays: p.executionDays, validityDays: p.validityDays, rank: 0,
    };
  });
  [...summaries].sort((a, b) => a.equalizedTotal.comparedTo(b.equalizedTotal)).forEach((s, i) => { s.rank = i + 1; });
  return { rows, proposals: summaries, referenceTotal };
}
