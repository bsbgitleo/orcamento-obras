// src/lib/pricing/budget-catalog.ts
// Catalog for one price table plus the company's own compositions used from it
// (decisão #51). Official items of own compositions are resolved BY CODE in
// that table; own inputs keep their quoted price.
import type { PrismaClient } from "@/generated/prisma/client";
import type { Catalog, InputItem, PriceSource } from "@/core/composition";
import { withOwnCompositions, type OwnCompositionDef, type OwnInputDef, type OwnItemDef } from "@/core/own-composition";
import { loadCatalogSubset } from "./catalog";

type OwnRow = {
  id: string; code: string; description: string; unit: string;
  items: { type: string; officialOrigin: string | null; officialCode: string | null; officialDescription: string | null; officialUnit: string | null;
    ownInputId: string | null; ownCompositionId: string | null; coefficient: { toString(): string }; position: number }[];
};

export function ownDefFromRow(row: OwnRow): OwnCompositionDef {
  const items = [...row.items].sort((a, b) => a.position - b.position).flatMap((it): OwnItemDef[] => {
    const coefficient = it.coefficient.toString();
    switch (it.type) {
      case "OFFICIAL_INPUT":
        return it.officialCode ? [{ type: "OFFICIAL_INPUT", origin: it.officialOrigin ?? "SINAPI", code: it.officialCode, coefficient, description: it.officialDescription, unit: it.officialUnit }] : [];
      case "OFFICIAL_COMPOSITION":
        return it.officialCode ? [{ type: "OFFICIAL_COMPOSITION", origin: it.officialOrigin ?? "SINAPI", code: it.officialCode, coefficient, description: it.officialDescription, unit: it.officialUnit }] : [];
      case "OWN_INPUT":
        return it.ownInputId ? [{ type: "OWN_INPUT", ownInputId: it.ownInputId, coefficient }] : [];
      case "OWN_COMPOSITION":
        return it.ownCompositionId ? [{ type: "OWN_COMPOSITION", ownCompositionId: it.ownCompositionId, coefficient }] : [];
      default:
        return [];
    }
  });
  return { id: row.id, code: row.code, description: row.description, unit: row.unit, items };
}

export interface BudgetCatalog {
  catalog: Catalog;
  source: PriceSource;
  /** Own compositions loaded (the roots and everything nested), by id */
  own: Map<string, OwnCompositionDef>;
}

export async function loadBudgetCatalog(
  prisma: PrismaClient,
  priceTableId: string,
  companyId: string,
  roots: { official?: string[]; own?: string[] },
): Promise<BudgetCatalog> {
  const table = await prisma.priceTable.findUniqueOrThrow({ where: { id: priceTableId } });
  const source: PriceSource = { origin: table.origin as PriceSource["origin"], uf: table.uf, referenceMonth: table.referenceMonth, regime: table.regime as PriceSource["regime"] };

  // 1. Own compositions, transitively (only this company's)
  const own = new Map<string, OwnCompositionDef>();
  let pending = [...new Set(roots.own ?? [])];
  while (pending.length) {
    const rows = await prisma.ownComposition.findMany({ where: { id: { in: pending }, companyId }, include: { items: true } });
    pending = [];
    for (const r of rows) {
      const def = ownDefFromRow(r);
      own.set(def.id, def);
      for (const it of def.items) if (it.type === "OWN_COMPOSITION" && !own.has(it.ownCompositionId)) pending.push(it.ownCompositionId);
    }
    pending = [...new Set(pending)].filter((id) => !own.has(id));
  }

  // 2. Official codes and own inputs they reference. Codes of another origin
  //    (e.g. SICRO in a SINAPI budget) are never resolved: TCU forbids mixing.
  const inputCodes = new Set<string>();
  const compCodes = new Set<string>();
  const ownInputIds = new Set<string>();
  for (const c of own.values()) {
    for (const it of c.items) {
      if (it.type === "OFFICIAL_INPUT" && it.origin === table.origin) inputCodes.add(it.code);
      else if (it.type === "OFFICIAL_COMPOSITION" && it.origin === table.origin) compCodes.add(it.code);
      else if (it.type === "OWN_INPUT") ownInputIds.add(it.ownInputId);
    }
  }

  const [compRows, inputRows, ownInputRows] = await Promise.all([
    compCodes.size ? prisma.composition.findMany({ where: { priceTableId, code: { in: [...compCodes] } }, select: { id: true, code: true } }) : [],
    inputCodes.size ? prisma.input.findMany({ where: { priceTableId, code: { in: [...inputCodes] } } }) : [],
    ownInputIds.size ? prisma.ownInput.findMany({ where: { id: { in: [...ownInputIds] }, companyId } }) : [],
  ]);
  const officialCompositionIdByCode = new Map(compRows.map((c) => [c.code, c.id]));
  const officialInputsByCode = new Map<string, InputItem>(inputRows.map((i) => [i.code, {
    id: i.id, code: i.code, description: i.description, unit: i.unit, kind: i.kind, unitPrice: i.unitPrice?.toString() ?? null, source,
  }]));
  const ownInputs: OwnInputDef[] = ownInputRows.map((i) => ({ id: i.id, code: i.code, description: i.description, unit: i.unit, kind: i.kind, unitPrice: i.unitPrice.toString() }));

  // 3. Official subtree (services' compositions + official compositions used by own ones)
  const officialRoots = [...new Set([...(roots.official ?? []), ...officialCompositionIdByCode.values()])];
  const base = officialRoots.length ? await loadCatalogSubset(prisma, priceTableId, officialRoots) : { getInput: () => undefined, getComposition: () => undefined };

  // Items pointing to own records that were not loaded (deleted, or of another
  // company) would break the engine: drop them.
  const knownOwnInputs = new Set(ownInputs.map((i) => i.id));
  for (const c of own.values()) {
    c.items = c.items.filter((it) =>
      (it.type !== "OWN_INPUT" || knownOwnInputs.has(it.ownInputId)) && (it.type !== "OWN_COMPOSITION" || own.has(it.ownCompositionId)));
  }

  const catalog = withOwnCompositions({ base, officialInputsByCode, officialCompositionIdByCode, ownCompositions: [...own.values()], ownInputs, source });
  return { catalog, source, own };
}
