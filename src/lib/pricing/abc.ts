// src/lib/pricing/abc.ts
// Curva ABC de serviços (por composição) e de insumos (explosão das composições),
// a partir do orçamento gravado. Ver 02-modelo-dados-e-regras.md §2 e 06-tcu §3.
import type { PrismaClient } from "@/generated/prisma/client";
import { buildAbcCurve, type AbcRow } from "@/core/abc-curve";
import { explodeInputs } from "@/core/composition";
import { D, ZERO, truncMoney, type Dec } from "@/core/money";
import { isOwnInputKey, ownCompositionKey } from "@/core/own-composition";
import { loadBudgetCatalog } from "./budget-catalog";
import { serviceCompositionKey } from "./recalculate-budget";

export interface ServiceAbcItem { compositionId: string | null; code: string; description: string; unit: string; quantity: Dec; unitCost: Dec | null; lines: number; own: boolean }
export interface InputAbcItem { inputId: string; code: string; description: string; unit: string; kind: string; quantity: Dec; unitPrice: Dec | null; priceFallbackUf: string | null; own: boolean }

export interface AbcReport {
  services: AbcRow<ServiceAbcItem>[];
  inputs: AbcRow<InputAbcItem>[];
  servicesTotal: Dec;
  inputsTotal: Dec;
  directCost: Dec;
  /** Serviços sem custo ignorados. */
  skipped: number;
}

export async function buildAbcReport(prisma: PrismaClient, budgetId: string): Promise<AbcReport> {
  const budget = await prisma.budget.findUniqueOrThrow({
    where: { id: budgetId },
    include: {
      project: { select: { companyId: true } },
      nodes: {
        where: { kind: "SERVICE" },
        include: {
          composition: { select: { id: true, code: true, description: true, unit: true } },
          ownComposition: { select: { id: true, code: true, description: true, unit: true } },
        },
      },
    },
  });

  // ── Serviços: agrupados por composição, custo total = Σ totalCost das linhas ──
  const byComp = new Map<string, ServiceAbcItem & { total: Dec }>();
  let skipped = 0;
  for (const n of budget.nodes) {
    if (n.totalCost === null || n.unitCost === null) { skipped++; continue; }
    const key = serviceCompositionKey(n) ?? n.id;
    const comp = n.ownComposition ?? n.composition;
    const cur = byComp.get(key) ?? {
      compositionId: n.ownCompositionId ?? n.compositionId, code: comp?.code ?? "—", description: comp?.description ?? n.description,
      unit: n.unit ?? "", quantity: ZERO, unitCost: D(n.unitCost.toString()), lines: 0, total: ZERO, own: !!n.ownCompositionId,
    };
    cur.quantity = cur.quantity.plus(n.quantity?.toString() ?? 0);
    cur.total = cur.total.plus(n.totalCost.toString());
    cur.lines++;
    byComp.set(key, cur);
  }
  const services = buildAbcCurve([...byComp.values()].map(({ total, ...item }) => ({ item, total })));
  const servicesTotal = services.reduce((a, r) => a.plus(r.total), ZERO);

  // ── Insumos: explosão de cada serviço (qtd × coeficientes agregados) ──
  const priced = budget.nodes.filter((n) => n.unitCost !== null && (n.compositionId || n.ownCompositionId));
  const official = [...new Set(priced.flatMap((n) => (n.compositionId ? [n.compositionId] : [])))];
  const own = [...new Set(priced.flatMap((n) => (n.ownCompositionId ? [n.ownCompositionId] : [])))];
  const inputs: AbcRow<InputAbcItem>[] = [];
  let inputsTotal = ZERO;
  if (priced.length) {
    const { catalog } = await loadBudgetCatalog(prisma, budget.priceTableId, budget.project.companyId, { official, own });
    const qtyByInput = new Map<string, Dec>();
    for (const n of priced) {
      const key = n.ownCompositionId ? ownCompositionKey(n.ownCompositionId) : n.compositionId!;
      const exploded = explodeInputs(key, catalog, n.quantity?.toString() ?? 0);
      for (const [inputId, q] of exploded) qtyByInput.set(inputId, (qtyByInput.get(inputId) ?? ZERO).plus(q));
    }
    const rows = [...qtyByInput.entries()].map(([inputId, quantity]) => {
      const i = catalog.getInput(inputId);
      const unitPrice = i?.unitPrice != null ? D(i.unitPrice) : null;
      const total = unitPrice ? truncMoney(quantity.times(unitPrice)) : ZERO;
      const item: InputAbcItem = {
        inputId, code: i?.code ?? "?", description: i?.description ?? "(insumo não encontrado)", unit: i?.unit ?? "", kind: i?.kind ?? "",
        quantity, unitPrice, priceFallbackUf: null, own: isOwnInputKey(inputId),
      };
      return { item, total };
    });
    inputs.push(...buildAbcCurve(rows));
    inputsTotal = inputs.reduce((a, r) => a.plus(r.total), ZERO);
  }

  return { services, inputs, servicesTotal, inputsTotal, directCost: D(budget.directCost.toString()), skipped };
}
