// src/lib/pricing/maintenance-alerts.ts
// Collects every composition and input a budget uses (services + auxiliary
// compositions, recursively) and checks them against the SINAPI maintenance
// log published after the budget's reference month (decisão #33).
import type { PrismaClient } from "@/generated/prisma/client";
import { maintenanceAlerts, type MaintenanceAlert, type MaintenanceRecord, type UsedItem } from "@/core/maintenance";
import { isMissingKey, isOwnCompositionKey, isOwnInputKey, ownCompositionKey } from "@/core/own-composition";
import { loadBudgetCatalog } from "./budget-catalog";

export interface BudgetMaintenanceCheck {
  /** Mês do relatório de manutenções gravado; null se nunca foi importado */
  reportMonth: string | null;
  budgetMonth: string;
  alerts: MaintenanceAlert[];
}

export async function checkBudgetMaintenance(
  prisma: PrismaClient,
  budget: { priceTableId: string; companyId: string; nodes: { kind: string; code: string; compositionId: string | null; ownCompositionId: string | null }[] },
): Promise<BudgetMaintenanceCheck | null> {
  const table = await prisma.priceTable.findUniqueOrThrow({ where: { id: budget.priceTableId } });
  if (table.origin !== "SINAPI" || table.companyId !== null) return null; // só bases oficiais SINAPI

  const report = await prisma.sourceMaintenance.findFirst({ where: { origin: "SINAPI" }, orderBy: { fileMonth: "desc" }, select: { fileMonth: true } });
  const result: BudgetMaintenanceCheck = { reportMonth: report?.fileMonth ?? null, budgetMonth: table.referenceMonth, alerts: [] };
  if (!report || report.fileMonth <= table.referenceMonth) return result; // nada publicado depois

  const services = budget.nodes.filter((n) => n.kind === "SERVICE" && (n.compositionId || n.ownCompositionId));
  if (!services.length) return result;
  const { catalog } = await loadBudgetCatalog(prisma, budget.priceTableId, budget.companyId, {
    official: services.flatMap((s) => (s.compositionId ? [s.compositionId] : [])),
    own: services.flatMap((s) => (s.ownCompositionId ? [s.ownCompositionId] : [])),
  });

  // item → serviços (códigos da EAP) que o usam
  const used = new Map<string, UsedItem>();
  const mark = (itemType: UsedItem["itemType"], code: string, description: string, service: string) => {
    const k = `${itemType}:${code}`;
    const u = used.get(k) ?? { itemType, code, description, usedBy: [] };
    if (!u.usedBy.includes(service)) u.usedBy.push(service);
    used.set(k, u);
  };
  for (const s of services) {
    const seen = new Set<string>();
    const walk = (compositionId: string) => {
      if (seen.has(compositionId)) return;
      seen.add(compositionId);
      const c = catalog.getComposition(compositionId);
      if (!c) return;
      // Own compositions/inputs are not in the SINAPI log; their official items are
      if (!isOwnCompositionKey(compositionId)) mark("COMPOSICAO", c.code, c.description, s.code);
      for (const it of c.items) {
        if (it.type === "INSUMO") {
          const i = catalog.getInput(it.inputId);
          if (i && !isOwnInputKey(it.inputId) && !isMissingKey(it.inputId)) mark("INSUMO", i.code, i.description, s.code);
        } else walk(it.compositionId);
      }
    };
    walk(s.ownCompositionId ? ownCompositionKey(s.ownCompositionId) : s.compositionId!);
  }

  const items = [...used.values()];
  const codes = (t: UsedItem["itemType"]) => items.filter((u) => u.itemType === t).map((u) => u.code);
  const records = await prisma.sourceMaintenance.findMany({
    where: {
      origin: "SINAPI", referenceMonth: { gt: table.referenceMonth },
      OR: [{ itemType: "COMPOSICAO", code: { in: codes("COMPOSICAO") } }, { itemType: "INSUMO", code: { in: codes("INSUMO") } }],
    },
    select: { referenceMonth: true, itemType: true, code: true, description: true, maintenance: true },
  });
  result.alerts = maintenanceAlerts(items, records as MaintenanceRecord[], table.referenceMonth);
  for (const a of result.alerts) a.usedBy.sort((x, y) => x.localeCompare(y, "pt-BR", { numeric: true }));
  return result;
}
