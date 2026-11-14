// src/lib/proposals/load.ts
// Itens do orçamento (referência) e propostas gravadas, para a comparação
// na tela e no Excel (decisões #76–#79).
import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { compareProposals, type Comparison, type ProposalIn, type RefItem } from "@/core/proposals/compare";

export interface StageHead { kind: "STAGE"; item: string; description: string; level: number }
export type MapEntry = StageHead | { kind: "SERVICE"; index: number; level: number };

export interface BudgetProposals {
  budgetId: string;
  projectId: string;
  rules: { maxExecutionDays: number | null; minValidityDays: number | null };
  ref: RefItem[];
  /** Ordem de exibição: etapas e índices dos serviços em `ref` */
  layout: MapEntry[];
  proposals: { id: string; name: string; document: string | null; technicalLead: string | null; fileName: string; fileKind: string; createdAt: Date }[];
  comparison: Comparison;
}

export async function loadReferenceItems(prisma: PrismaClient, budgetId: string): Promise<{ ref: RefItem[]; layout: MapEntry[] }> {
  const nodes = await prisma.wbsNode.findMany({ where: { budgetId } });
  const byParent = new Map<string | null, typeof nodes>();
  for (const n of nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
  const ref: RefItem[] = [];
  const layout: MapEntry[] = [];
  const walk = (p: string | null, level: number) => {
    for (const n of (byParent.get(p) ?? []).sort((a, b) => a.position - b.position)) {
      if (n.kind === "STAGE") { layout.push({ kind: "STAGE", item: n.code, description: n.description, level }); walk(n.id, level + 1); continue; }
      layout.push({ kind: "SERVICE", index: ref.length, level });
      ref.push({ nodeId: n.id, item: n.code, description: n.description, unit: n.unit, quantity: n.quantity?.toString() ?? null, unitPrice: n.unitPrice?.toString() ?? null });
    }
  };
  walk(null, 1);
  return { ref, layout };
}

export async function loadBudgetProposals(prisma: PrismaClient, companyId: string, projectId: string): Promise<BudgetProposals | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    include: { budgets: { orderBy: { revision: "desc" }, take: 1, include: { proposals: { orderBy: { createdAt: "asc" }, include: { items: { orderBy: { position: "asc" } } } } } } },
  });
  const b = project?.budgets[0];
  if (!project || !b) return null;
  const { ref, layout } = await loadReferenceItems(prisma, b.id);
  const rules = { maxExecutionDays: b.bidderMaxDays, minValidityDays: b.bidderMinValidityDays };
  const inputs: ProposalIn[] = b.proposals.map((p) => ({
    id: p.id, name: p.bidderName, executionDays: p.executionDays, validityDays: p.validityDays, declaredTotal: p.declaredTotal?.toString() ?? null,
    lines: p.items.map((i) => ({
      id: i.id, nodeId: i.nodeId, item: i.item, description: i.description, unit: i.unit,
      quantity: i.quantity?.toString() ?? null, unitPrice: i.unitPrice?.toString() ?? null, totalPrice: i.totalPrice?.toString() ?? null,
    })),
  }));
  return {
    budgetId: b.id, projectId: project.id, rules, ref, layout,
    proposals: b.proposals.map((p) => ({ id: p.id, name: p.bidderName, document: p.document, technicalLead: p.technicalLead, fileName: p.fileName, fileKind: p.fileKind, createdAt: p.createdAt })),
    comparison: compareProposals(ref, inputs, rules),
  };
}
