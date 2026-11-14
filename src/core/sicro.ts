// src/core/sicro.ts
// Custo unitário de composição pelo método do SICRO (DNIT), verificado contra
// as 6.619 composições do DF, 07/2026 (Relatório Analítico de Composições):
//
//   A  equipamento   = ROUND4(qtd × (util.operativa × custo produtivo + util.improdutiva × custo improdutivo))
//   B  mão de obra   = ROUND4(qtd × custo horário)
//      linhas "(x%)" = ROUND4(soma do grupo até ali × x/100)          (grupos B, C, D)
//   custo unitário de execução = ROUND4((ΣA + ΣB) / produção da equipe)
//   custo do FIC               = ROUND4(FIC × (Σ ROUND4(qtd × custo improdutivo) + ΣB) / produção)
//      (na chuva o equipamento fica parado e a equipe é paga — NÃO é execução × FIC)
//   C  material      = ROUND4(qtd × preço)
//   D  auxiliar      = ROUND4(qtd × custo unitário da auxiliar)        (já com 2 casas)
//   E  tempo fixo    = ROUND4(qtd × custo da composição de tempo fixo)
//   F  transporte    = depende da DMT do projeto; o custo publicado não o inclui
//   custo unitário direto total = ROUND2(execução + FIC + ΣC + ΣD + ΣE)   (meio para cima)
import Decimal from "decimal.js";
import type { Catalog, Composition, CompositionCost, CostBreakdown, ItemCost } from "./composition";
import { MissingReferenceError } from "./composition";
import { D, ZERO, type Dec } from "./money";

const r4 = (v: Decimal.Value): Dec => new Decimal(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
const r2 = (v: Decimal.Value): Dec => new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function calculateSicroCost(
  composition: Composition,
  catalog: Catalog,
  child: (compositionId: string) => CompositionCost,
): CompositionCost {
  const production = composition.production && !D(composition.production).isZero() ? D(composition.production) : D(1);
  const fic = composition.fic ? D(composition.fic) : ZERO;
  const sums: Record<"A" | "B" | "C" | "D" | "E", Dec> = { A: ZERO, B: ZERO, C: ZERO, D: ZERO, E: ZERO };
  let unproductive = ZERO;
  let incomplete = false;
  let transportPending = false;
  const items: ItemCost[] = [];

  for (const item of composition.items) {
    if (item.type === "TRANSPORTE") {
      transportPending = true;
      items.push({ item, unitPrice: null, cost: ZERO });
      continue;
    }
    if (item.type === "PERCENTUAL") {
      const g = item.group as keyof typeof sums;
      const add = r4(sums[g].times(item.percent).div(100));
      sums[g] = sums[g].plus(add);
      items.push({ item, unitPrice: null, cost: add });
      continue;
    }
    if (item.type === "COMPOSICAO_AUXILIAR") {
      const c = child(item.compositionId);
      if (c.incomplete) incomplete = true;
      if (c.transportPending) transportPending = true;
      const cost = r4(D(item.coefficient).times(c.unitCost));
      const g = item.group === "E" ? "E" : "D";
      sums[g] = sums[g].plus(cost);
      items.push({ item, unitPrice: c.unitCost, cost });
      continue;
    }
    const input = catalog.getInput(item.inputId);
    if (!input) throw new MissingReferenceError("insumo", item.inputId);
    if (item.group === "A") {
      if (input.productiveCost == null || input.unproductiveCost == null) { incomplete = true; items.push({ item, unitPrice: null, cost: ZERO }); continue; }
      const op = D(item.operativeUse ?? 0);
      const imp = D(item.unproductiveUse ?? 0);
      const cost = r4(D(item.coefficient).times(op.times(input.productiveCost).plus(imp.times(input.unproductiveCost))));
      unproductive = unproductive.plus(r4(D(item.coefficient).times(input.unproductiveCost)));
      sums.A = sums.A.plus(cost);
      items.push({ item, unitPrice: D(input.productiveCost), cost });
      continue;
    }
    if (input.unitPrice === null) { incomplete = true; items.push({ item, unitPrice: null, cost: ZERO }); continue; }
    const cost = r4(D(item.coefficient).times(input.unitPrice));
    const g = item.group === "B" ? "B" : "C"; // mão de obra; demais insumos são material
    sums[g] = sums[g].plus(cost);
    items.push({ item, unitPrice: D(input.unitPrice), cost });
  }

  const execution = r4(sums.A.plus(sums.B).div(production));
  const ficCost = r4(fic.times(unproductive.plus(sums.B)).div(production));
  const unitCost = r2(execution.plus(ficCost).plus(sums.C).plus(sums.D).plus(sums.E));
  const breakdown: CostBreakdown = {
    equipment: r4(sums.A.div(production)),
    labor: r4(sums.B.div(production)).plus(ficCost),
    material: sums.C,
    service: sums.D.plus(sums.E),
    total: unitCost,
  };
  return { compositionId: composition.id, unitCost, breakdown, items, incomplete, transportPending };
}
