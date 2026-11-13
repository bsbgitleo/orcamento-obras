// src/lib/own-base.ts
// Server helpers for the company's own base: reference price table for cost
// previews and the priced view of one own composition (decisão #51).
import "server-only";
import { prisma } from "@/lib/prisma";
import { calculateCompositionCost, itemCost, type CompositionCost } from "@/core/composition";
import { missingKey, ownCompositionKey, ownInputKey } from "@/core/own-composition";
import { D, type Dec } from "@/core/money";
import { loadBudgetCatalog } from "@/lib/pricing/budget-catalog";

export interface ReferenceTable { id: string; origin: string; uf: string; referenceMonth: string; regime: string }

/**
 * Official tables the company can price against, and the one to use: the
 * requested id, else the base of the company's latest budget, else the most
 * recent "sem desoneração" table (decisão #14).
 */
export async function referenceTables(companyId: string, requested?: string | null): Promise<{ tables: ReferenceTable[]; current: ReferenceTable | null }> {
  const tables = await prisma.priceTable.findMany({
    where: { OR: [{ companyId: null }, { companyId }] },
    orderBy: [{ referenceMonth: "desc" }, { uf: "asc" }, { regime: "asc" }],
    select: { id: true, origin: true, uf: true, referenceMonth: true, regime: true },
  });
  let current = tables.find((t) => t.id === requested) ?? null;
  if (!current) {
    const last = await prisma.budget.findFirst({ where: { project: { companyId } }, orderBy: { updatedAt: "desc" }, select: { priceTableId: true } });
    current = tables.find((t) => t.id === last?.priceTableId) ?? tables.find((t) => t.regime === "NAO_DESONERADO") ?? tables[0] ?? null;
  }
  return { tables, current };
}

export interface PricedItem {
  id: string;
  position: number;
  type: "OFFICIAL_INPUT" | "OFFICIAL_COMPOSITION" | "OWN_INPUT" | "OWN_COMPOSITION";
  code: string;
  description: string;
  unit: string;
  coefficient: string;
  /** Preço unitário na base de referência (null = sem preço / não existe na base) */
  unitPrice: Dec | null;
  /** TRUNC(coef × preço, 2) */
  cost: Dec | null;
  /** Item oficial cujo código não existe na base de referência */
  missing: boolean;
  /** Link para a ficha (insumo/composição própria) */
  href: string | null;
}

export interface PricedComposition {
  cost: CompositionCost | null;
  items: PricedItem[];
}

/** Prices one own composition (and shows each item) in the given official table. */
export async function priceOwnComposition(companyId: string, compositionId: string, tableId: string | null): Promise<PricedComposition> {
  const row = await prisma.ownComposition.findFirstOrThrow({
    where: { id: compositionId, companyId },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: { ownInput: true, ownComposition: { select: { id: true, code: true, description: true, unit: true } } },
      },
    },
  });
  if (!tableId) {
    return {
      cost: null,
      items: row.items.map((it) => ({
        id: it.id, position: it.position, type: it.type, coefficient: it.coefficient.toString(), unitPrice: null, cost: null, missing: false,
        code: it.officialCode ?? it.ownInput?.code ?? it.ownComposition?.code ?? "?",
        description: it.officialDescription ?? it.ownInput?.description ?? it.ownComposition?.description ?? "",
        unit: it.officialUnit ?? it.ownInput?.unit ?? it.ownComposition?.unit ?? "",
        href: it.ownInputId ? `/insumos-proprios/${it.ownInputId}` : it.ownCompositionId ? `/composicoes-proprias/${it.ownCompositionId}` : null,
      })),
    };
  }

  const { catalog } = await loadBudgetCatalog(prisma, tableId, companyId, { own: [compositionId] });
  const table = await prisma.priceTable.findUniqueOrThrow({ where: { id: tableId }, select: { origin: true } });
  const codes = row.items.flatMap((it) => (it.officialCode ? [it.officialCode] : []));
  const [inputs, comps] = await Promise.all([
    prisma.input.findMany({ where: { priceTableId: tableId, code: { in: codes } }, select: { id: true, code: true } }),
    prisma.composition.findMany({ where: { priceTableId: tableId, code: { in: codes } }, select: { id: true, code: true } }),
  ]);
  const inputId = new Map(inputs.map((i) => [i.code, i.id]));
  const compId = new Map(comps.map((c) => [c.code, c.id]));
  const cache = new Map<string, CompositionCost>();

  const items: PricedItem[] = row.items.map((it) => {
    let key: string | null = null;
    let isComposition = false;
    let missing = false;
    if (it.type === "OFFICIAL_INPUT" || it.type === "OFFICIAL_COMPOSITION") {
      const sameOrigin = (it.officialOrigin ?? "SINAPI") === table.origin;
      const found = sameOrigin ? (it.type === "OFFICIAL_INPUT" ? inputId : compId).get(it.officialCode ?? "") : undefined;
      if (found) { key = found; isComposition = it.type === "OFFICIAL_COMPOSITION"; } else { key = missingKey(it.officialOrigin ?? "SINAPI", it.officialCode ?? ""); missing = true; }
    } else if (it.type === "OWN_INPUT" && it.ownInputId) {
      key = ownInputKey(it.ownInputId);
    } else if (it.type === "OWN_COMPOSITION" && it.ownCompositionId) {
      key = ownCompositionKey(it.ownCompositionId);
      isComposition = true;
    }
    let unitPrice: Dec | null = null;
    if (key && isComposition) {
      const c = calculateCompositionCost(key, catalog, cache);
      unitPrice = c.incomplete ? null : c.unitCost;
    } else if (key) {
      const p = catalog.getInput(key)?.unitPrice;
      unitPrice = p === null || p === undefined ? null : D(p);
    }
    const official = key && !missing ? (isComposition ? catalog.getComposition(key) : catalog.getInput(key)) : undefined;
    return {
      id: it.id, position: it.position, type: it.type, coefficient: it.coefficient.toString(),
      code: it.officialCode ?? it.ownInput?.code ?? it.ownComposition?.code ?? "?",
      description: (it.officialCode ? official?.description : undefined) ?? it.officialDescription ?? it.ownInput?.description ?? it.ownComposition?.description ?? "",
      unit: (it.officialCode ? official?.unit : undefined) ?? it.officialUnit ?? it.ownInput?.unit ?? it.ownComposition?.unit ?? "",
      unitPrice, cost: unitPrice === null ? null : itemCost(it.coefficient.toString(), unitPrice), missing,
      href: it.ownInputId ? `/insumos-proprios/${it.ownInputId}` : it.ownCompositionId ? `/composicoes-proprias/${it.ownCompositionId}` : null,
    };
  });
  const cost = calculateCompositionCost(ownCompositionKey(compositionId), catalog, cache);
  return { cost, items };
}
