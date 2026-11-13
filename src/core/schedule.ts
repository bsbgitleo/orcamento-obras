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

// ─── Cronograma hierárquico (decisão #37): linhas editáveis são as etapas-folha ───

export interface ScheduleTreeStage extends ScheduleStage {
  parentId: string | null;
  level: number;
}

export interface ScheduleTreeRow extends ScheduleRow {
  level: number;
  /** false = etapa-pai: valores são a soma das filhas; percentuais derivados */
  editable: boolean;
}

export interface ScheduleTreeResult extends Omit<ScheduleResult, "rows"> {
  rows: ScheduleTreeRow[];
}

/**
 * Folha = etapa sem subetapas. `stages` deve vir em ordem de exibição (pré-ordem).
 * Etapa mista (serviços diretos + subetapas) ganha uma linha editável "serviços
 * diretos" com o valor próprio (preço − soma das filhas), logo abaixo dela.
 */
export function computeScheduleTree(stages: ScheduleTreeStage[], cells: ScheduleCell[], months: number): ScheduleTreeResult {
  const hasChild = new Set(stages.filter((s) => s.parentId).map((s) => s.parentId as string));
  const childrenOf = (id: string) => stages.filter((s) => s.parentId === id);

  // Editable rows: leaves + "own services" of mixed parents (keyed by the parent's id)
  const editable: ScheduleTreeStage[] = [];
  const ownRowOf = new Map<string, ScheduleTreeStage>();
  for (const s of stages) {
    if (!hasChild.has(s.id)) { editable.push(s); continue; }
    const own = D(s.totalPrice).minus(childrenOf(s.id).reduce((a, c) => a.plus(c.totalPrice), ZERO));
    if (own.gt(0)) {
      const row: ScheduleTreeStage = { id: s.id, parentId: s.id, level: s.level + 1, code: s.code, description: `Serviços diretos de ${s.code}`, totalPrice: own };
      ownRowOf.set(s.id, row);
      editable.push(row);
    }
  }
  const leafResult = computeSchedule(editable, cells, months);
  const byId = new Map<string, ScheduleTreeRow>();     // leaves and parents
  const ownById = new Map<string, ScheduleTreeRow>();  // own-services rows of mixed parents
  for (const r of leafResult.rows) {
    const st = editable.find((s) => s.id === r.stage.id && s.description === r.stage.description)!;
    if (ownRowOf.get(r.stage.id) === st) ownById.set(r.stage.id, { ...r, level: st.level, editable: true });
    else byId.set(r.stage.id, { ...r, level: st.level, editable: true });
  }
  // parents bottom-up: deepest first
  const parents = stages.filter((s) => hasChild.has(s.id)).sort((a, b) => b.level - a.level);
  for (const p of parents) {
    const parts = [...childrenOf(p.id).map((s) => byId.get(s.id)!), ...(ownById.has(p.id) ? [ownById.get(p.id)!] : [])];
    const price = D(p.totalPrice);
    const values = Array.from({ length: months }, (_, i) => parts.reduce((a, c) => a.plus(c.values[i]), ZERO));
    const total = values.reduce((a, v) => a.plus(v), ZERO);
    const percents = values.map((v) => (price.isZero() ? ZERO : v.div(price).times(HUNDRED)));
    const totalPct = price.isZero() ? ZERO : total.div(price).times(HUNDRED);
    byId.set(p.id, { stage: p, price, percents, values, totalPct, incomplete: parts.some((c) => c.incomplete), level: p.level, editable: false });
  }
  const rows = stages.flatMap((s) => [byId.get(s.id)!, ...(ownById.has(s.id) ? [ownById.get(s.id)!] : [])]);
  const roots = stages.filter((s) => s.level === 1).map((s) => byId.get(s.id)!);
  const monthTotals = Array.from({ length: months }, (_, i) => roots.reduce((a, r) => a.plus(r.values[i]), ZERO));
  const total = roots.reduce((a, r) => a.plus(r.price), ZERO);
  let acc = ZERO;
  const cumulative = monthTotals.map((m) => (acc = acc.plus(m)));
  const pctOf = (v: Dec) => (total.isZero() ? ZERO : v.div(total).times(HUNDRED));
  return {
    months, rows, monthTotals, monthPct: monthTotals.map(pctOf), cumulative, cumulativePct: cumulative.map(pctOf),
    total, scheduled: leafResult.scheduled, incompleteRows: leafResult.incompleteRows,
  };
}
