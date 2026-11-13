// src/core/budget.ts
// Planilha orçamentária: numeração da EAP e totais de custo e de preço (com BDI).
//
//   custo total do serviço  = TRUNC(qtd × custo unitário, 2)              (decisão #5)
//   preço unitário          = TRUNC(custo unitário × (1 + BDI%), 2)       (decisões #10, #25)
//   preço total do serviço  = TRUNC(qtd × preço unitário, 2)
//   etapa                   = soma dos filhos; obra = soma das etapas raiz
//
// Serviços sem custo (composição incompleta) entram com null e não somam, e o
// resultado sinaliza `incompleteServices`.
import { D, ONE, ZERO, pct, truncMoney, type Dec, type DecimalInput } from "./money";
import { serviceTotal } from "./composition";

export interface BudgetServiceInput {
  kind: "SERVICE";
  id: string;
  description: string;
  unit: string;
  quantity: DecimalInput;
  /** null = composição sem custo */
  unitCost: DecimalInput | null;
  /** Item de mero fornecimento → BDI reduzido */
  isSupplyItem?: boolean;
}

export interface BudgetStageInput {
  kind: "STAGE";
  id: string;
  description: string;
  children: BudgetNodeInput[];
}

export type BudgetNodeInput = BudgetStageInput | BudgetServiceInput;

export interface BudgetParams {
  /** BDI em percentual com 2 casas, ex.: "23.86" */
  bdiPercent: DecimalInput;
  /** BDI de mero fornecimento (Súmula TCU 253); se ausente, usa o principal */
  supplyBdiPercent?: DecimalInput | null;
}

export interface BudgetLine {
  id: string;
  code: string;
  level: number;
  kind: "STAGE" | "SERVICE";
  description: string;
  unit: string | null;
  quantity: Dec | null;
  unitCost: Dec | null;
  totalCost: Dec | null;
  unitPrice: Dec | null;
  totalPrice: Dec | null;
  /** serviço sem custo */
  incomplete: boolean;
}

export interface BudgetResult {
  lines: BudgetLine[];
  directCost: Dec;
  salePrice: Dec;
  /** Diferença preço − custo (BDI efetivo em R$) */
  bdiAmount: Dec;
  incompleteServices: number;
}

export function unitPriceWithBdi(unitCost: DecimalInput, bdiPercent: DecimalInput): Dec {
  return truncMoney(D(unitCost).times(ONE.plus(pct(bdiPercent))));
}

export function computeBudget(roots: BudgetNodeInput[], params: BudgetParams): BudgetResult {
  const lines: BudgetLine[] = [];
  let incompleteServices = 0;

  const visit = (node: BudgetNodeInput, code: string, level: number): { cost: Dec; price: Dec } => {
    if (node.kind === "SERVICE") {
      const quantity = D(node.quantity);
      if (node.unitCost === null) {
        incompleteServices++;
        lines.push({ id: node.id, code, level, kind: "SERVICE", description: node.description, unit: node.unit, quantity, unitCost: null, totalCost: null, unitPrice: null, totalPrice: null, incomplete: true });
        return { cost: ZERO, price: ZERO };
      }
      const bdi = node.isSupplyItem && params.supplyBdiPercent != null ? params.supplyBdiPercent : params.bdiPercent;
      const unitCost = D(node.unitCost);
      const totalCost = serviceTotal(quantity, unitCost);
      const unitPrice = unitPriceWithBdi(unitCost, bdi);
      const totalPrice = truncMoney(quantity.times(unitPrice));
      lines.push({ id: node.id, code, level, kind: "SERVICE", description: node.description, unit: node.unit, quantity, unitCost, totalCost, unitPrice, totalPrice, incomplete: false });
      return { cost: totalCost, price: totalPrice };
    }
    const line: BudgetLine = { id: node.id, code, level, kind: "STAGE", description: node.description, unit: null, quantity: null, unitCost: null, totalCost: ZERO, unitPrice: null, totalPrice: ZERO, incomplete: false };
    lines.push(line);
    let cost = ZERO, price = ZERO;
    node.children.forEach((child, i) => {
      const r = visit(child, `${code}.${i + 1}`, level + 1);
      cost = cost.plus(r.cost); price = price.plus(r.price);
    });
    line.totalCost = cost; line.totalPrice = price;
    return { cost, price };
  };

  let directCost = ZERO, salePrice = ZERO;
  roots.forEach((root, i) => {
    const r = visit(root, `${i + 1}`, 1);
    directCost = directCost.plus(r.cost); salePrice = salePrice.plus(r.price);
  });

  return { lines, directCost, salePrice, bdiAmount: salePrice.minus(directCost), incompleteServices };
}

/** Rebuilds the tree from flat rows (parentId + position), in position order. */
export function buildTree<T extends { id: string; parentId: string | null; position: number }>(
  rows: T[],
  toNode: (row: T, children: BudgetNodeInput[]) => BudgetNodeInput,
): BudgetNodeInput[] {
  const byParent = new Map<string | null, T[]>();
  for (const r of rows) {
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }
  const build = (parentId: string | null): BudgetNodeInput[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((r) => toNode(r, build(r.id)));
  return build(null);
}
