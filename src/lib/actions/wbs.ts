// src/lib/actions/wbs.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decimalString, parseForm, requiredText, type ActionState } from "@/lib/forms";
import { recalculateBudget } from "@/lib/pricing/recalculate-budget";
import { searchCompositions, searchOwnCompositions, type SearchHit, type SearchMode } from "@/lib/compositions/search";
import { calculateCompositionCost } from "@/core/composition";
import { ownCompositionKey } from "@/core/own-composition";
import { loadBudgetCatalog } from "@/lib/pricing/budget-catalog";
import { requireActionAuth, requireEditor } from "@/lib/auth/require";

/** Budget of the signed-in company, or throws. */
async function ownBudget(budgetId: string, edit = true) {
  const ctx = edit ? await requireEditor() : await requireActionAuth();
  const b = await prisma.budget.findFirst({ where: { id: budgetId, project: { companyId: ctx.company.id } }, select: { id: true, projectId: true, priceTableId: true } });
  if (!b) throw new Error("Orçamento não encontrado.");
  return { ...b, companyId: ctx.company.id };
}

/** Node of a budget of the signed-in company, or throws. */
async function ownNode(nodeId: string) {
  const ctx = await requireEditor();
  const n = await prisma.wbsNode.findFirst({ where: { id: nodeId, budget: { project: { companyId: ctx.company.id } } } });
  if (!n) throw new Error("Item não encontrado.");
  // Linhas geradas pelo app (transporte do SICRO) mudam pela aba Transporte (decisão #67)
  if (n.autoKind) throw new Error("Este item é calculado pelo app (momento de transporte). Altere as DMTs na aba Transporte.");
  return n;
}

async function assertEditableParent(parentId: string | null) {
  if (!parentId) return;
  const p = await prisma.wbsNode.findUnique({ where: { id: parentId }, select: { autoKind: true } });
  if (p?.autoKind) throw new Error("A etapa de transportes é calculada pelo app; crie outra etapa para seus serviços.");
}

async function projectIdOf(budgetId: string): Promise<string> {
  const b = await prisma.budget.findUniqueOrThrow({ where: { id: budgetId }, select: { projectId: true } });
  return b.projectId;
}

async function finish(budgetId: string): Promise<ActionState> {
  await recalculateBudget(prisma, budgetId);
  revalidatePath(`/orcamentos/${await projectIdOf(budgetId)}`);
  return { status: "ok" };
}

async function nextPosition(budgetId: string, parentId: string | null): Promise<number> {
  const last = await prisma.wbsNode.findFirst({ where: { budgetId, parentId }, orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? -1) + 1;
}

export type CompositionBase = "ALL" | "OFFICIAL" | "OWN";

/**
 * Composition search for the "add service" picker (callable from client
 * components): the budget's official base and/or the company's own
 * compositions, whose cost is computed in the budget's base (decisões #36, #51).
 */
export async function searchCompositionsAction(budgetId: string, query: string, mode: SearchMode, base: CompositionBase = "ALL"): Promise<SearchHit[]> {
  const b = await ownBudget(budgetId, false);
  const [official, own] = await Promise.all([
    base === "OWN" ? [] : searchCompositions(prisma, { priceTableIds: [b.priceTableId], query, mode, limit: 40 }),
    base === "OFFICIAL" ? [] : searchOwnCompositions(prisma, { companyId: b.companyId, query, mode, limit: 20 }),
  ]);
  if (own.length) {
    const { catalog } = await loadBudgetCatalog(prisma, b.priceTableId, b.companyId, { own: own.map((h) => h.id) });
    for (const h of own) {
      const r = calculateCompositionCost(ownCompositionKey(h.id), catalog);
      h.unitCost = r.incomplete ? null : r.unitCost.toFixed(2);
    }
  }
  return [...own, ...official];
}

// ─── Etapas ───

const stageSchema = z.object({ description: requiredText("Descrição") });

export async function addStage(budgetId: string, parentId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await ownBudget(budgetId);
  await assertEditableParent(parentId);
  const r = parseForm(stageSchema, fd);
  if (!r.ok) return r.state;
  if (parentId) {
    const parent = await prisma.wbsNode.findUnique({ where: { id: parentId } });
    if (!parent || parent.budgetId !== budgetId || parent.kind !== "STAGE") return { status: "error", message: "Etapa-pai inválida." };
  }
  await prisma.wbsNode.create({
    data: { budgetId, parentId, kind: "STAGE", position: await nextPosition(budgetId, parentId), code: "", description: r.data.description },
  });
  return finish(budgetId);
}

// ─── Serviços ───

const serviceSchema = z.object({
  compositionId: z.string().optional(),
  ownCompositionId: z.string().optional(),
  quantity: decimalString({ min: 0, label: "Quantidade" }),
  description: z.string().optional(),
  isSupplyItem: z.string().optional().transform((s) => s === "on"),
});

export async function addService(budgetId: string, parentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const budget = await ownBudget(budgetId);
  await assertEditableParent(parentId);
  const r = parseForm(serviceSchema, fd);
  if (!r.ok) return r.state;
  const parent = await prisma.wbsNode.findUnique({ where: { id: parentId } });
  if (!parent || parent.budgetId !== budgetId || parent.kind !== "STAGE") return { status: "error", message: "Serviços só podem ser adicionados dentro de uma etapa." };
  let link: { compositionId: string } | { ownCompositionId: string };
  let comp: { description: string; unit: string } | null;
  if (r.data.ownCompositionId) {
    // Own composition of this company, priced in the budget's base (decisão #51)
    comp = await prisma.ownComposition.findFirst({ where: { id: r.data.ownCompositionId, companyId: budget.companyId } });
    if (!comp) return { status: "error", message: "Composição própria não encontrada." };
    link = { ownCompositionId: r.data.ownCompositionId };
  } else if (r.data.compositionId) {
    const official = await prisma.composition.findUnique({ where: { id: r.data.compositionId } });
    if (!official) return { status: "error", message: "Composição não encontrada." };
    if (official.priceTableId !== budget.priceTableId) return { status: "error", message: "A composição não pertence à base de preços deste orçamento." };
    comp = official;
    link = { compositionId: official.id };
  } else {
    return { status: "error", message: "Escolha uma composição." };
  }
  await prisma.wbsNode.create({
    data: {
      budgetId, parentId, kind: "SERVICE", position: await nextPosition(budgetId, parentId), code: "",
      description: r.data.description?.trim() || comp.description,
      ...link, unit: comp.unit, quantity: r.data.quantity, isSupplyItem: r.data.isSupplyItem,
    },
  });
  return finish(budgetId);
}

const quantitySchema = z.object({ quantity: decimalString({ min: 0, label: "Quantidade" }) });

export async function updateQuantity(nodeId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = parseForm(quantitySchema, fd);
  if (!r.ok) return r.state;
  const node = await ownNode(nodeId);
  if (node.kind !== "SERVICE") return { status: "error", message: "Só serviços têm quantidade." };
  await prisma.wbsNode.update({ where: { id: nodeId }, data: { quantity: r.data.quantity } });
  return finish(node.budgetId);
}

const descriptionSchema = z.object({ description: requiredText("Descrição") });

export async function updateDescription(nodeId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = parseForm(descriptionSchema, fd);
  if (!r.ok) return r.state;
  await ownNode(nodeId);
  const node = await prisma.wbsNode.update({ where: { id: nodeId }, data: { description: r.data.description } });
  return finish(node.budgetId);
}

export async function toggleSupplyItem(nodeId: string): Promise<void> {
  const node = await ownNode(nodeId);
  await prisma.wbsNode.update({ where: { id: nodeId }, data: { isSupplyItem: !node.isSupplyItem } });
  await finish(node.budgetId);
}

// ─── Mover / excluir ───

export async function moveNode(nodeId: string, direction: "UP" | "DOWN"): Promise<void> {
  const node = await ownNode(nodeId);
  const siblings = await prisma.wbsNode.findMany({ where: { budgetId: node.budgetId, parentId: node.parentId }, orderBy: { position: "asc" } });
  const i = siblings.findIndex((s) => s.id === nodeId);
  const j = direction === "UP" ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return;
  const other = siblings[j];
  // Unique (budgetId, parentId, position): go through a temporary position
  await prisma.$transaction([
    prisma.wbsNode.update({ where: { id: node.id }, data: { position: -1 } }),
    prisma.wbsNode.update({ where: { id: other.id }, data: { position: node.position } }),
    prisma.wbsNode.update({ where: { id: node.id }, data: { position: other.position } }),
  ]);
  await finish(node.budgetId);
}

export async function deleteNode(nodeId: string): Promise<void> {
  const node = await ownNode(nodeId);
  await prisma.wbsNode.delete({ where: { id: nodeId } }); // children cascade
  // Close the gap in positions
  const siblings = await prisma.wbsNode.findMany({ where: { budgetId: node.budgetId, parentId: node.parentId }, orderBy: { position: "asc" } });
  await prisma.$transaction(siblings.map((s, i) => prisma.wbsNode.update({ where: { id: s.id }, data: { position: i } })));
  await finish(node.budgetId);
}

export async function recalculate(budgetId: string): Promise<void> {
  await ownBudget(budgetId);
  await finish(budgetId);
}
