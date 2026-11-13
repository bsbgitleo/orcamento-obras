// src/core/composition.ts
// Custo unitário de composição = Σ (coeficiente × preço unitário do item),
// com composições auxiliares resolvidas recursivamente (02-modelo-dados-e-regras.md §2).
// Preço de mão de obra já inclui encargos sociais (padrão SINAPI).
import { D, ZERO, roundMoney, type Dec, type DecimalInput } from "./money";

export type InputKind = "MATERIAL" | "MAO_DE_OBRA" | "EQUIPAMENTO" | "SERVICO";

export interface PriceSource {
  origin: "SINAPI" | "SICRO" | "PROPRIA" | "COTACAO";
  uf: string; // "DF"
  referenceMonth: string; // "2026-10"
  regime: "DESONERADO" | "NAO_DESONERADO";
}

export interface InputItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  kind: InputKind;
  unitPrice: DecimalInput;
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

export interface CompositionCost {
  compositionId: string;
  /** Custo unitário sem arredondar (precisão interna). */
  rawUnitCost: Dec;
  /** Custo unitário arredondado a 2 casas (ROUND_HALF_UP). */
  unitCost: Dec;
  breakdown: CostBreakdown;
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

function addBreakdown(a: CostBreakdown, b: CostBreakdown, factor: Dec): CostBreakdown {
  return {
    material: a.material.plus(b.material.times(factor)),
    labor: a.labor.plus(b.labor.times(factor)),
    equipment: a.equipment.plus(b.equipment.times(factor)),
    service: a.service.plus(b.service.times(factor)),
    total: a.total.plus(b.total.times(factor)),
  };
}

function kindToField(kind: InputKind): keyof Omit<CostBreakdown, "total"> {
  switch (kind) {
    case "MATERIAL": return "material";
    case "MAO_DE_OBRA": return "labor";
    case "EQUIPAMENTO": return "equipment";
    case "SERVICO": return "service";
  }
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

  let breakdown = emptyBreakdown();
  const nextStack = [...stack, compositionId];

  for (const item of composition.items) {
    const coef = D(item.coefficient);
    if (item.type === "INSUMO") {
      const input = catalog.getInput(item.inputId);
      if (!input) throw new MissingReferenceError("insumo", item.inputId);
      const cost = coef.times(input.unitPrice);
      const field = kindToField(input.kind);
      breakdown = { ...breakdown, [field]: breakdown[field].plus(cost), total: breakdown.total.plus(cost) };
    } else {
      const child = calculateCompositionCost(item.compositionId, catalog, cache, nextStack);
      // Auxiliary compositions enter with their *rounded* unit cost, as SINAPI does.
      const childUnit = child.unitCost;
      const share = child.rawUnitCost.isZero()
        ? emptyBreakdown()
        : {
            material: child.breakdown.material.div(child.rawUnitCost).times(childUnit),
            labor: child.breakdown.labor.div(child.rawUnitCost).times(childUnit),
            equipment: child.breakdown.equipment.div(child.rawUnitCost).times(childUnit),
            service: child.breakdown.service.div(child.rawUnitCost).times(childUnit),
            total: childUnit,
          };
      breakdown = addBreakdown(breakdown, share, coef);
    }
  }

  const result: CompositionCost = {
    compositionId,
    rawUnitCost: breakdown.total,
    unitCost: roundMoney(breakdown.total),
    breakdown,
  };
  cache.set(compositionId, result);
  return result;
}

/** Custo total do serviço = quantidade × custo unitário (arredondado a 2 casas). */
export function serviceTotal(quantity: DecimalInput, unitCost: DecimalInput): Dec {
  return roundMoney(D(quantity).times(unitCost));
}
