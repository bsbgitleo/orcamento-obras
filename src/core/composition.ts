// src/core/composition.ts
// Custo unitário de composição, seguindo exatamente o método do SINAPI
// (verificado contra a planilha "Analítico com Custo", ref. 10/2026):
//
//   custo_item      = TRUNC(coeficiente × preço_unitário_do_item, 2)
//   custo_unitário  = Σ custo_item
//
// Composições auxiliares entram pelo seu custo unitário já calculado (que, por
// construção, já é uma soma de valores truncados). Preço de mão de obra já
// inclui encargos sociais conforme o regime (padrão SINAPI).
import { D, ZERO, truncMoney, type Dec, type DecimalInput } from "./money";

export type InputKind = "MATERIAL" | "MAO_DE_OBRA" | "EQUIPAMENTO" | "SERVICO";

export interface PriceSource {
  origin: "SINAPI" | "SICRO" | "PROPRIA" | "COTACAO";
  uf: string; // "DF"
  referenceMonth: string; // "2026-10"
  regime: "DESONERADO" | "NAO_DESONERADO" | "SEM_ENCARGOS";
}

export interface InputItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  kind: InputKind;
  /** null = insumo sem preço na UF (situação "SEM PREÇO" do SINAPI). */
  unitPrice: DecimalInput | null;
  source: PriceSource;
}

export type CompositionChild =
  | { type: "INSUMO"; inputId: string; coefficient: DecimalInput }
  | { type: "COMPOSICAO_AUXILIAR"; compositionId: string; coefficient: DecimalInput };

export interface Composition {
  id: string;
  code: string;
  description: string;
  unit: string;
  source: PriceSource;
  items: CompositionChild[];
}

export interface Catalog {
  getInput(id: string): InputItem | undefined;
  getComposition(id: string): Composition | undefined;
}

export interface CostBreakdown {
  material: Dec;
  labor: Dec;
  equipment: Dec;
  service: Dec;
  total: Dec;
}

export interface ItemCost {
  item: CompositionChild;
  /** Preço unitário usado (null quando o item não tem preço). */
  unitPrice: Dec | null;
  /** TRUNC(coef × preço, 2); ZERO quando sem preço. */
  cost: Dec;
}

export interface CompositionCost {
  compositionId: string;
  /** Custo unitário = Σ TRUNC(coef × preço, 2). Já com 2 casas. */
  unitCost: Dec;
  breakdown: CostBreakdown;
  items: ItemCost[];
  /** true quando algum insumo/composição da árvore está sem preço ("SEM CUSTO" no SINAPI). */
  incomplete: boolean;
}

export class CompositionCycleError extends Error {
  constructor(public readonly path: string[]) {
    super(`Composição com referência circular: ${path.join(" → ")}`);
  }
}

export class MissingReferenceError extends Error {
  constructor(kind: "insumo" | "composição", id: string) {
    super(`${kind === "insumo" ? "Insumo" : "Composição"} não encontrado(a): ${id}`);
  }
}

const emptyBreakdown = (): CostBreakdown => ({
  material: ZERO, labor: ZERO, equipment: ZERO, service: ZERO, total: ZERO,
});

function kindToField(kind: InputKind): keyof Omit<CostBreakdown, "total"> {
  switch (kind) {
    case "MATERIAL": return "material";
    case "MAO_DE_OBRA": return "labor";
    case "EQUIPAMENTO": return "equipment";
    case "SERVICO": return "service";
  }
}

/** Custo de um item da composição: TRUNC(coef × preço, 2). */
export function itemCost(coefficient: DecimalInput, unitPrice: DecimalInput): Dec {
  return truncMoney(D(coefficient).times(unitPrice));
}

export function calculateCompositionCost(
  compositionId: string,
  catalog: Catalog,
  cache: Map<string, CompositionCost> = new Map(),
  stack: string[] = [],
): CompositionCost {
  const cached = cache.get(compositionId);
  if (cached) return cached;
  if (stack.includes(compositionId)) {
    throw new CompositionCycleError([...stack, compositionId]);
  }

  const composition = catalog.getComposition(compositionId);
  if (!composition) throw new MissingReferenceError("composição", compositionId);

  const breakdown = emptyBreakdown();
  const items: ItemCost[] = [];
  let incomplete = false;
  const nextStack = [...stack, compositionId];

  for (const item of composition.items) {
    if (item.type === "INSUMO") {
      const input = catalog.getInput(item.inputId);
      if (!input) throw new MissingReferenceError("insumo", item.inputId);
      if (input.unitPrice === null) {
        incomplete = true;
        items.push({ item, unitPrice: null, cost: ZERO });
        continue;
      }
      const cost = itemCost(item.coefficient, input.unitPrice);
      const field = kindToField(input.kind);
      breakdown[field] = breakdown[field].plus(cost);
      breakdown.total = breakdown.total.plus(cost);
      items.push({ item, unitPrice: D(input.unitPrice), cost });
    } else {
      const child = calculateCompositionCost(item.compositionId, catalog, cache, nextStack);
      if (child.incomplete) incomplete = true;
      const cost = itemCost(item.coefficient, child.unitCost);
      // Distribui o custo truncado na mesma proporção da auxiliar (só para relatório).
      if (!child.unitCost.isZero()) {
        const ratio = cost.div(child.unitCost);
        breakdown.material = breakdown.material.plus(child.breakdown.material.times(ratio));
        breakdown.labor = breakdown.labor.plus(child.breakdown.labor.times(ratio));
        breakdown.equipment = breakdown.equipment.plus(child.breakdown.equipment.times(ratio));
        breakdown.service = breakdown.service.plus(child.breakdown.service.times(ratio));
      }
      breakdown.total = breakdown.total.plus(cost);
      items.push({ item, unitPrice: child.unitCost, cost });
    }
  }

  const result: CompositionCost = {
    compositionId,
    unitCost: breakdown.total,
    breakdown,
    items,
    incomplete,
  };
  cache.set(compositionId, result);
  return result;
}

/** Custo total do serviço = TRUNC(quantidade × custo unitário, 2) — mesma regra dos itens. */
export function serviceTotal(quantity: DecimalInput, unitCost: DecimalInput): Dec {
  return truncMoney(D(quantity).times(unitCost));
}

/**
 * Explode uma composição até os insumos: coeficiente agregado por insumo
 * (Σ dos caminhos, coeficientes multiplicados ao atravessar auxiliares).
 * Base da curva ABC de insumos e do levantamento de quantitativos.
 */
export function explodeInputs(
  compositionId: string,
  catalog: Catalog,
  factor: DecimalInput = 1,
  acc: Map<string, Dec> = new Map(),
  stack: string[] = [],
): Map<string, Dec> {
  if (stack.includes(compositionId)) throw new CompositionCycleError([...stack, compositionId]);
  const composition = catalog.getComposition(compositionId);
  if (!composition) throw new MissingReferenceError("composição", compositionId);
  const f = D(factor);
  for (const item of composition.items) {
    const coef = f.times(item.coefficient);
    if (item.type === "INSUMO") {
      acc.set(item.inputId, (acc.get(item.inputId) ?? ZERO).plus(coef));
    } else {
      explodeInputs(item.compositionId, catalog, coef, acc, [...stack, compositionId]);
    }
  }
  return acc;
}
