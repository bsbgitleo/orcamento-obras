// src/lib/actions/wbs.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decimalString, parseForm, requiredText, type ActionState } from "@/lib/forms";
import { recalculateBudget } from "@/lib/pricing/recalculate-budget";
import { searchCompositions, type SearchHit, type SearchMode } from "@/lib/compositions/search";

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

/** Composition search for the "add service" picker (callable from client components). */
export async function searchCompositionsAction(budgetId: string, query: string, mode: SearchMode): Promise<SearchHit[]> {
  const b = await prisma.budget.findUniqueOrThrow({ where: { id: budgetId }, select: { priceTableId: true } });
  return searchCompositions(prisma, { priceTableIds: [b.priceTableId], query, mode, limit: 40 });
}

// ─── Etapas ───

const stageSchema = z.object({ description: requiredText("Descrição") });

export async function addStage(budgetId: string, parentId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
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
  compositionId: requiredText("Composição"),
  quantity: decimalString({ min: 0, label: "Quantidade" }),
  description: z.string().optional(),
  isSupplyItem: z.string().optional().transform((s) => s === "on"),
});

export async function addService(budgetId: string, parentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = parseForm(serviceSchema, fd);
  if (!r.ok) return r.state;
  const [parent, budget, comp] = await Promise.all([
    prisma.wbsNode.findUnique({ where: { id: parentId } }),
    prisma.budget.findUniqueOrThrow({ where: { id: budgetId }, select: { priceTableId: true } }),
    prisma.composition.findUnique({ where: { id: r.data.compositionId } }),
  ]);
  if (!parent || parent.budgetId !== budgetId || parent.kind !== "STAGE") return { status: "error", message: "Serviços só podem ser adicionados dentro de uma etapa." };
  if (!comp) return { status: "error", message: "Composição não encontrada." };
  if (comp.priceTableId !== budget.priceTableId) return { status: "error", message: "A composição não pertence à base de preços deste orçamento." };
  await prisma.wbsNode.create({
    data: {
      budgetId, parentId, kind: "SERVICE", position: await nextPosition(budgetId, parentId), code: "",
      description: r.data.description?.trim() || comp.description,
      compositionId: comp.id, unit: comp.unit, quantity: r.data.quantity, isSupplyItem: r.data.isSupplyItem,
    },
  });
  return finish(budgetId);
}

const quantitySchema = z.object({ quantity: decimalString({ min: 0, label: "Quantidade" }) });

export async function updateQuantity(nodeId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = parseForm(quantitySchema, fd);
  if (!r.ok) return r.state;
  const node = await prisma.wbsNode.findUniqueOrThrow({ where: { id: nodeId } });
  if (node.kind !== "SERVICE") return { status: "error", message: "Só serviços têm quantidade." };
  await prisma.wbsNode.update({ where: { id: nodeId }, data: { quantity: r.data.quantity } });
  return finish(node.budgetId);
}

const descriptionSchema = z.object({ description: requiredText("Descrição") });

export async function updateDescription(nodeId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = parseForm(descriptionSchema, fd);
  if (!r.ok) return r.state;
  const node = await prisma.wbsNode.update({ where: { id: nodeId }, data: { description: r.data.description } });
  return finish(node.budgetId);
}

export async function toggleSupplyItem(nodeId: string): Promise<void> {
  const node = await prisma.wbsNode.findUniqueOrThrow({ where: { id: nodeId } });
  await prisma.wbsNode.update({ where: { id: nodeId }, data: { isSupplyItem: !node.isSupplyItem } });
  await finish(node.budgetId);
}

// ─── Mover / excluir ───

export async function moveNode(nodeId: string, direction: "UP" | "DOWN"): Promise<void> {
  const node = await prisma.wbsNode.findUniqueOrThrow({ where: { id: nodeId } });
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
  const node = await prisma.wbsNode.findUniqueOrThrow({ where: { id: nodeId } });
  await prisma.wbsNode.delete({ where: { id: nodeId } }); // children cascade
  // Close the gap in positions
  const siblings = await prisma.wbsNode.findMany({ where: { budgetId: node.budgetId, parentId: node.parentId }, orderBy: { position: "asc" } });
  await prisma.$transaction(siblings.map((s, i) => prisma.wbsNode.update({ where: { id: s.id }, data: { position: i } })));
  await finish(node.budgetId);
}

export async function recalculate(budgetId: string): Promise<void> {
  await finish(budgetId);
}
