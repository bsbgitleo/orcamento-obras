// src/lib/pricing/cache-composition-costs.ts
// Computes every composition's unit cost of a price table with the core engine
// and stores it in Composition.unitCost (null when incomplete). Run after an
// import and whenever an own composition changes.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { calculateCompositionCost, type CompositionCost } from "@/core/composition";
import { loadWholeCatalog } from "./catalog";

export interface CacheResult { computed: number; incomplete: number; mismatches: { code: string; computed: string; published: string }[] }

export async function cacheCompositionCosts(prisma: PrismaClient, priceTableId: string): Promise<CacheResult> {
  const catalog = await loadWholeCatalog(prisma, priceTableId);
  const cache = new Map<string, CompositionCost>();
  const rows: { id: string; unitCost: string | null }[] = [];
  let incomplete = 0;
  for (const id of catalog.compositionIds) {
    const r = calculateCompositionCost(id, catalog, cache);
    if (r.incomplete) incomplete++;
    rows.push({ id, unitCost: r.incomplete ? null : r.unitCost.toFixed(2) });
  }

  // Bulk update in chunks: UPDATE ... FROM (VALUES ...)
  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = Prisma.join(chunk.map((r) => Prisma.sql`(${r.id}, ${r.unitCost}::numeric)`));
    await prisma.$executeRaw`UPDATE "Composition" AS c SET "unitCost" = v.cost FROM (VALUES ${values}) AS v(id, cost) WHERE c.id = v.id`;
  }

  // Conferência contra o custo publicado (quando houver)
  const published = await prisma.composition.findMany({ where: { priceTableId, referenceCost: { not: null } }, select: { id: true, code: true, referenceCost: true } });
  const byId = new Map(rows.map((r) => [r.id, r.unitCost]));
  const mismatches = published
    .filter((p) => byId.get(p.id) !== p.referenceCost!.toFixed(2))
    .map((p) => ({ code: p.code, computed: byId.get(p.id) ?? "null", published: p.referenceCost!.toFixed(2) }));

  return { computed: rows.length, incomplete, mismatches };
}
