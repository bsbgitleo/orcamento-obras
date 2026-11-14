// src/lib/pricing/recalculate-budget.ts
// Recomputes a whole budget: composition costs (core engine, from the DB
// items), WBS codes, per-line totals, direct cost and sale price. Writes the
// results back to WbsNode and Budget.
import type { PrismaClient } from "@/generated/prisma/client";
import { calculateCompositionCost, type CompositionCost } from "@/core/composition";
import { buildTree, computeBudget, type BudgetNodeInput, type BudgetResult } from "@/core/budget";
import { ownCompositionKey } from "@/core/own-composition";
import { loadBudgetCatalog } from "./budget-catalog";
import { syncTransportNodes } from "./transport";
import { syncCalcMemory } from "./calc-memory";

/** Catalog key of the composition a service uses (official id or own key). */
export function serviceCompositionKey(n: { compositionId: string | null; ownCompositionId: string | null }): string | null {
  return n.ownCompositionId ? ownCompositionKey(n.ownCompositionId) : n.compositionId;
}

export async function recalculateBudget(prisma: PrismaClient, budgetId: string): Promise<BudgetResult> {
  // Quantidades vinculadas à memória de cálculo (decisão #81), antes do transporte, que depende delas
  await syncCalcMemory(prisma, budgetId);
  // SICRO: a etapa "Transportes" segue as quantidades e as DMTs (decisão #67)
  const table = await prisma.budget.findUniqueOrThrow({ where: { id: budgetId }, select: { priceTable: { select: { origin: true } } } });
  if (table.priceTable.origin === "SICRO") await syncTransportNodes(prisma, budgetId);

  const budget = await prisma.budget.findUniqueOrThrow({
    where: { id: budgetId },
    include: { bdi: true, supplyBdi: true, nodes: true, project: { select: { companyId: true } } },
  });

  // 1. Composition costs (decision #18: always recomputed from items; own
  //    compositions priced in this budget's base, decision #51)
  const official = [...new Set(budget.nodes.flatMap((n) => (n.compositionId ? [n.compositionId] : [])))];
  const own = [...new Set(budget.nodes.flatMap((n) => (n.ownCompositionId ? [n.ownCompositionId] : [])))];
  const costs = new Map<string, CompositionCost>();
  if (official.length || own.length) {
    const { catalog } = await loadBudgetCatalog(prisma, budget.priceTableId, budget.project.companyId, { official, own });
    const cache = new Map<string, CompositionCost>();
    for (const key of [...official, ...own.map(ownCompositionKey)]) {
      if (catalog.getComposition(key)) costs.set(key, calculateCompositionCost(key, catalog, cache));
    }
  }

  // 2. Tree → core
  const tree = buildTree(budget.nodes, (row, children): BudgetNodeInput => {
    if (row.kind === "STAGE") return { kind: "STAGE", id: row.id, description: row.description, children };
    const key = serviceCompositionKey(row);
    const cost = key ? costs.get(key) : undefined;
    return {
      kind: "SERVICE", id: row.id, description: row.description, unit: row.unit ?? "",
      quantity: row.quantity?.toString() ?? "0",
      unitCost: cost && !cost.incomplete ? cost.unitCost.toString() : null,
      isSupplyItem: row.isSupplyItem,
    };
  });
  const result = computeBudget(tree, {
    bdiPercent: budget.bdi.percent.toString(),
    supplyBdiPercent: budget.supplyBdi?.percent.toString() ?? null,
  });

  // 3. Persist
  await prisma.$transaction([
    ...result.lines.map((l) => prisma.wbsNode.update({
      where: { id: l.id },
      data: {
        code: l.code,
        unitCost: l.unitCost?.toFixed(2) ?? null,
        totalCost: l.totalCost?.toFixed(2) ?? null,
        unitPrice: l.unitPrice?.toFixed(2) ?? null,
        totalPrice: l.totalPrice?.toFixed(2) ?? null,
      },
    })),
    prisma.budget.update({
      where: { id: budgetId },
      data: { directCost: result.directCost.toFixed(2), salePrice: result.salePrice.toFixed(2) },
    }),
  ]);

  return result;
}
