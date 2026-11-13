// src/lib/pricing/recalculate-budget.ts
// Recomputes a whole budget: composition costs (core engine, from the DB
// items), WBS codes, per-line totals, direct cost and sale price. Writes the
// results back to WbsNode and Budget.
import type { PrismaClient } from "@/generated/prisma/client";
import { calculateCompositionCost, type CompositionCost } from "@/core/composition";
import { buildTree, computeBudget, type BudgetNodeInput, type BudgetResult } from "@/core/budget";
import { loadCatalogSubset } from "./catalog";

export async function recalculateBudget(prisma: PrismaClient, budgetId: string): Promise<BudgetResult> {
  const budget = await prisma.budget.findUniqueOrThrow({
    where: { id: budgetId },
    include: { bdi: true, supplyBdi: true, nodes: true },
  });

  // 1. Composition costs (decision #18: always recomputed from items)
  const compositionIds = [...new Set(budget.nodes.flatMap((n) => (n.compositionId ? [n.compositionId] : [])))];
  const costs = new Map<string, CompositionCost>();
  if (compositionIds.length) {
    const catalog = await loadCatalogSubset(prisma, budget.priceTableId, compositionIds);
    const cache = new Map<string, CompositionCost>();
    for (const id of compositionIds) {
      if (catalog.getComposition(id)) costs.set(id, calculateCompositionCost(id, catalog, cache));
    }
  }

  // 2. Tree → core
  const tree = buildTree(budget.nodes, (row, children): BudgetNodeInput => {
    if (row.kind === "STAGE") return { kind: "STAGE", id: row.id, description: row.description, children };
    const cost = row.compositionId ? costs.get(row.compositionId) : undefined;
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
