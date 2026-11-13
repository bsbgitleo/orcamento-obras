// src/lib/pricing/catalog.ts
// Builds an in-memory core Catalog from the database, for one price table.
// `loadCatalogSubset` fetches only the compositions reachable from the given
// ids (recursively), which is what a budget recalculation needs.
import type { PrismaClient } from "@/generated/prisma/client";
import type { Catalog, Composition, InputItem, PriceSource } from "@/core/composition";

type Db = Pick<PrismaClient, "priceTable" | "input" | "composition">;

export interface LoadedCatalog extends Catalog {
  source: PriceSource;
  compositionIds: string[];
}

function toSource(t: { origin: string; uf: string; referenceMonth: string; regime: string }): PriceSource {
  return { origin: t.origin as PriceSource["origin"], uf: t.uf, referenceMonth: t.referenceMonth, regime: t.regime as PriceSource["regime"] };
}

async function fetchCompositions(db: Db, ids: string[]) {
  return db.composition.findMany({ where: { id: { in: ids } }, include: { items: true } });
}

function toComposition(c: Awaited<ReturnType<typeof fetchCompositions>>[number], source: PriceSource): Composition {
  return {
    id: c.id, code: c.code, description: c.description, unit: c.unit, source,
    items: c.items.map((it) => it.type === "INSUMO"
      ? { type: "INSUMO" as const, inputId: it.inputId ?? `missing:${it.id}`, coefficient: it.coefficient.toString() }
      : { type: "COMPOSICAO_AUXILIAR" as const, compositionId: it.childCompositionId ?? `missing:${it.id}`, coefficient: it.coefficient.toString() }),
  };
}

export async function loadCatalogSubset(db: Db, priceTableId: string, rootCompositionIds: string[]): Promise<LoadedCatalog> {
  const table = await db.priceTable.findUniqueOrThrow({ where: { id: priceTableId } });
  const source = toSource(table);
  const comps = new Map<string, Composition>();
  const inputIds = new Set<string>();

  let pending = [...new Set(rootCompositionIds)];
  while (pending.length) {
    const rows = await fetchCompositions(db, pending);
    pending = [];
    for (const row of rows) {
      const c = toComposition(row, source);
      comps.set(c.id, c);
      for (const it of c.items) {
        if (it.type === "INSUMO") inputIds.add(it.inputId);
        else if (!comps.has(it.compositionId)) pending.push(it.compositionId);
      }
    }
  }

  const inputs = new Map<string, InputItem>();
  const inputRows = await db.input.findMany({ where: { id: { in: [...inputIds] } } });
  for (const i of inputRows) {
    inputs.set(i.id, { id: i.id, code: i.code, description: i.description, unit: i.unit, kind: i.kind, unitPrice: i.unitPrice?.toString() ?? null, source });
  }

  return { source, compositionIds: [...comps.keys()], getInput: (id) => inputs.get(id), getComposition: (id) => comps.get(id) };
}

/** Whole table in memory (used at import time to cache every composition's cost). */
export async function loadWholeCatalog(db: Db, priceTableId: string): Promise<LoadedCatalog> {
  const table = await db.priceTable.findUniqueOrThrow({ where: { id: priceTableId } });
  const source = toSource(table);
  const [inputRows, compRows] = await Promise.all([
    db.input.findMany({ where: { priceTableId } }),
    db.composition.findMany({ where: { priceTableId }, include: { items: true } }),
  ]);
  const inputs = new Map<string, InputItem>(inputRows.map((i) => [i.id, {
    id: i.id, code: i.code, description: i.description, unit: i.unit, kind: i.kind, unitPrice: i.unitPrice?.toString() ?? null, source,
  }]));
  const comps = new Map<string, Composition>(compRows.map((c) => [c.id, toComposition(c, source)]));
  return { source, compositionIds: [...comps.keys()], getInput: (id) => inputs.get(id), getComposition: (id) => comps.get(id) };
}
