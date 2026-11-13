// src/core/schedule.ts
// Cronograma físico-financeiro: percentual por mês por etapa raiz, aplicado ao
// preço de venda da etapa.
//
//   valor(etapa, mês) = TRUNC(preço da etapa × %/100, 2)
//   o último mês com percentual recebe a diferença de centavos, para que a
//   soma dos meses feche exatamente com o preço da etapa (decisão #29).
import { D, HUNDRED, ZERO, truncMoney, type Dec, type DecimalInput } from "./money";

export interface ScheduleStage { id: string; code: string; description: string; totalPrice: DecimalInput }
export interface ScheduleCell { nodeId: string; month: number; percent: DecimalInput }

export interface ScheduleRow {
  stage: ScheduleStage;
  price: Dec;
  percents: Dec[]; // index 0 = mês 1
  values: Dec[];
  totalPct: Dec;
  /** true quando 0 < soma < 100 ou soma > 100 */
  incomplete: boolean;
}

export interface ScheduleResult {
  months: number;
  rows: ScheduleRow[];
  monthTotals: Dec[];
  monthPct: Dec[];
  cumulative: Dec[];
  cumulativePct: Dec[];
  total: Dec;
  /** Soma das etapas com cronograma preenchido (100 %) */
  scheduled: Dec;
  incompleteRows: number;
}

export function computeSchedule(stages: ScheduleStage[], cells: ScheduleCell[], months: number): ScheduleResult {
  const byKey = new Map(cells.map((c) => [`${c.nodeId}:${c.month}`, D(c.percent)]));
  const rows: ScheduleRow[] = stages.map((stage) => {
    const price = D(stage.totalPrice);
    const percents = Array.from({ length: months }, (_, i) => byKey.get(`${stage.id}:${i + 1}`) ?? ZERO);
    const totalPct = percents.reduce((a, p) => a.plus(p), ZERO);
    const values = percents.map((p) => truncMoney(price.times(p).div(HUNDRED)));
    if (totalPct.eq(100)) {
      // fecha os centavos no último mês com percentual
      const last = percents.map((p) => !p.isZero()).lastIndexOf(true);
      if (last >= 0) {
        const sum = values.reduce((a, v) => a.plus(v), ZERO);
        values[last] = values[last].plus(price.minus(sum));
      }
    }
    return { stage, price, percents, values, totalPct, incomplete: !totalPct.isZero() && !totalPct.eq(100) };
  });

  const monthTotals = Array.from({ length: months }, (_, i) => rows.reduce((a, r) => a.plus(r.values[i]), ZERO));
  const total = rows.reduce((a, r) => a.plus(r.price), ZERO);
  const scheduled = rows.filter((r) => r.totalPct.eq(100)).reduce((a, r) => a.plus(r.price), ZERO);
  let acc = ZERO;
  const cumulative = monthTotals.map((m) => (acc = acc.plus(m)));
  const pctOf = (v: Dec) => (total.isZero() ? ZERO : v.div(total).times(HUNDRED));
  return {
    months, rows, monthTotals, monthPct: monthTotals.map(pctOf), cumulative, cumulativePct: cumulative.map(pctOf),
    total, scheduled, incompleteRows: rows.filter((r) => r.incomplete).length,
  };
}

/** Distribuição linear sugerida: 100 % dividido igualmente, resto no último mês. */
export function linearPercents(months: number): Dec[] {
  if (months < 1) return [];
  const base = D(100).div(months).toDecimalPlaces(2, 1 /* ROUND_DOWN */);
  const arr = Array.from({ length: months }, () => base);
  arr[months - 1] = arr[months - 1].plus(D(100).minus(base.times(months)));
  return arr;
}
