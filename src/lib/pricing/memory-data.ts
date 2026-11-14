// src/lib/pricing/memory-data.ts
// Dados da memória de cálculo e da especificação de materiais de um orçamento,
// para as telas e as exportações (decisões #80–#83).
import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { formatItemList } from "@/core/item-list";

export interface MemoryRow {
  id: string; kind: "SECTION" | "PARAM"; code: string | null; description: string; unit: string | null;
  value: string | null; formula: string | null; result: string | null; error: string | null; source: string | null; estimated: boolean;
  /** Serviços com a quantidade vinculada */
  linked: string[];
}
export interface TreeEntry { id: string; code: string; description: string; stage: boolean; level: number; unit: string | null; quantity: string | null; quantityParamId: string | null; auto: boolean }
export interface MaterialRow { id: string; material: string; specification: string | null; references: string | null; standards: string | null; nodeIds: string[]; items: string }

export interface MemoryData {
  calcMemoryNote: string | null;
  materialsNote: string | null;
  rows: MemoryRow[];
  tree: TreeEntry[];
  materials: MaterialRow[];
}

export async function loadMemoryData(prisma: PrismaClient, budgetId: string): Promise<MemoryData> {
  const [b, rows, nodes, specs] = await Promise.all([
    prisma.budget.findUniqueOrThrow({ where: { id: budgetId }, select: { calcMemoryNote: true, materialsNote: true } }),
    prisma.calcRow.findMany({ where: { budgetId }, orderBy: { position: "asc" }, include: { linkedNodes: { select: { code: true } } } }),
    prisma.wbsNode.findMany({ where: { budgetId } }),
    prisma.materialSpec.findMany({ where: { budgetId }, orderBy: { position: "asc" }, include: { items: { select: { nodeId: true } } } }),
  ]);
  const byParent = new Map<string | null, typeof nodes>();
  for (const n of nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
  const tree: TreeEntry[] = [];
  const walk = (p: string | null, level: number) => {
    for (const n of (byParent.get(p) ?? []).sort((a, b) => a.position - b.position)) {
      tree.push({ id: n.id, code: n.code, description: n.description, stage: n.kind === "STAGE", level, unit: n.unit, quantity: n.quantity?.toString() ?? null, quantityParamId: n.quantityParamId, auto: !!n.autoKind });
      if (n.kind === "STAGE") walk(n.id, level + 1);
    }
  };
  walk(null, 1);
  const services = tree.filter((t) => !t.stage);
  const codeOf = new Map(services.map((s) => [s.id, s.code]));
  return {
    calcMemoryNote: b.calcMemoryNote, materialsNote: b.materialsNote,
    rows: rows.map((r) => ({
      id: r.id, kind: r.kind === "SECTION" ? "SECTION" : "PARAM", code: r.code, description: r.description, unit: r.unit,
      value: r.value?.toString() ?? null, formula: r.formula, result: r.result?.toString() ?? null, error: r.error, source: r.source, estimated: r.estimated,
      linked: r.linkedNodes.map((n) => n.code),
    })),
    tree,
    materials: specs.map((s) => {
      const ids = s.items.map((i) => i.nodeId).filter((id) => codeOf.has(id));
      return { id: s.id, material: s.material, specification: s.specification, references: s.references, standards: s.standards, nodeIds: ids, items: formatItemList(services.map((x) => x.code), ids.map((id) => codeOf.get(id)!)) };
    }),
  };
}
