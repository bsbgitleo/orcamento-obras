// src/lib/compositions/search.ts
// Single search box over compositions: by code (exact / prefix) or by
// description (all keywords in any order, or exact phrase), accent-insensitive
// (PostgreSQL `unaccent`).
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export type SearchMode = "KEYWORDS" | "EXACT";

export interface SearchParams {
  priceTableIds: string[];
  query: string;
  mode?: SearchMode;
  limit?: number;
  /** Omit "SEM CUSTO" compositions (default: include, flagged). */
  onlyWithCost?: boolean;
}

export interface SearchHit {
  id: string;
  code: string;
  description: string;
  unit: string;
  group: string | null;
  unitCost: string | null;
  sourceStatus: string | null;
  priceTable: { id: string; origin: string; uf: string; referenceMonth: string; regime: string };
}

/** Splits a query into keywords, ignoring 1-char tokens. "PAREDE 14CM" → ["PAREDE", "14CM"] */
export function tokenize(q: string): string[] {
  return q.trim().split(/\s+/).filter((t) => t.length > 1);
}

/** Escapes LIKE wildcards in user input. */
export function likePattern(term: string, mode: "contains" | "prefix"): string {
  const esc = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  return mode === "prefix" ? `${esc}%` : `%${esc}%`;
}

/** Builds the WHERE clause (exported for tests). */
export function buildConditions(p: SearchParams): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [Prisma.sql`c."priceTableId" IN (${Prisma.join(p.priceTableIds)})`];
  if (p.onlyWithCost) conds.push(Prisma.sql`c."unitCost" IS NOT NULL`);
  const q = p.query.trim();
  if (!q) return conds;
  if (/^\d+$/.test(q)) {
    conds.push(Prisma.sql`c.code LIKE ${likePattern(q, "prefix")}`);
  } else if (p.mode === "EXACT") {
    conds.push(Prisma.sql`unaccent(c.description) ILIKE unaccent(${likePattern(q, "contains")})`);
  } else {
    for (const t of tokenize(q)) conds.push(Prisma.sql`unaccent(c.description) ILIKE unaccent(${likePattern(t, "contains")})`);
  }
  return conds;
}

interface Row {
  id: string; code: string; description: string; unit: string; group: string | null;
  unitCost: Prisma.Decimal | null; sourceStatus: string | null;
  ptId: string; origin: string; uf: string; referenceMonth: string; regime: string;
}

export async function searchCompositions(db: Pick<PrismaClient, "$queryRaw">, p: SearchParams): Promise<SearchHit[]> {
  if (p.priceTableIds.length === 0) return [];
  const where = Prisma.join(buildConditions(p), " AND ");
  const q = p.query.trim();
  const rows = await db.$queryRaw<Row[]>`
    SELECT c.id, c.code, c.description, c.unit, c."group", c."unitCost", c."sourceStatus",
           t.id AS "ptId", t.origin::text AS origin, t.uf, t."referenceMonth", t.regime::text AS regime
    FROM "Composition" c
    JOIN "PriceTable" t ON t.id = c."priceTableId"
    WHERE ${where}
    ORDER BY (c.code = ${q}) DESC, c.code ASC
    LIMIT ${p.limit ?? 50}`;
  return rows.map((r) => ({
    id: r.id, code: r.code, description: r.description, unit: r.unit, group: r.group,
    unitCost: r.unitCost?.toString() ?? null, sourceStatus: r.sourceStatus,
    priceTable: { id: r.ptId, origin: r.origin, uf: r.uf, referenceMonth: r.referenceMonth, regime: r.regime },
  }));
}
