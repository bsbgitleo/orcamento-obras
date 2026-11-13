// src/core/abc-curve.ts
// Curva ABC: ordenar por custo total decrescente; A = até 80% acumulado,
// B = 80–95%, C = 95–100% (02-modelo-dados-e-regras.md §2).
// A classe é decidida pelo acumulado ANTES do item (decisão #28): o item que
// cruza o limite pertence à classe anterior (o 1º item é sempre A).
import { D, ZERO, HUNDRED, type Dec, type DecimalInput } from "./money";

export type AbcClass = "A" | "B" | "C";

export interface AbcInputRow<T> {
  item: T;
  total: DecimalInput;
}

export interface AbcRow<T> {
  rank: number;
  item: T;
  total: Dec;
  /** Participação individual (%). */
  sharePct: Dec;
  /** Participação acumulada (%). */
  cumulativePct: Dec;
  abcClass: AbcClass;
}

export interface AbcThresholds {
  a: DecimalInput; // default 80
  b: DecimalInput; // default 95
}

export const DEFAULT_ABC_THRESHOLDS: AbcThresholds = { a: "80", b: "95" };

export function buildAbcCurve<T>(
  rows: AbcInputRow<T>[],
  thresholds: AbcThresholds = DEFAULT_ABC_THRESHOLDS,
): AbcRow<T>[] {
  const a = D(thresholds.a);
  const b = D(thresholds.b);
  if (a.gte(b) || b.gt(HUNDRED)) throw new Error("Limites da curva ABC inválidos.");

  const sorted = rows
    .map((r) => ({ item: r.item, total: D(r.total) }))
    .sort((x, y) => y.total.comparedTo(x.total));

  const grandTotal = sorted.reduce((acc, r) => acc.plus(r.total), ZERO);

  let cumulative = ZERO;
  return sorted.map((r, idx) => {
    const sharePct = grandTotal.isZero() ? ZERO : r.total.div(grandTotal).times(HUNDRED);
    const before = cumulative;
    cumulative = cumulative.plus(sharePct);
    const abcClass: AbcClass = before.lt(a) ? "A" : before.lt(b) ? "B" : "C";
    return { rank: idx + 1, item: r.item, total: r.total, sharePct, cumulativePct: cumulative, abcClass };
  });
}
