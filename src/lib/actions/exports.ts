// src/lib/actions/exports.ts
// Dados da empresa, da proposta e da planilha para proponentes (decisões #59–#61).
"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseForm, type ActionState } from "@/lib/forms";
import { requireEditor, requireManager } from "@/lib/auth/require";
import { bidderSchema, companySchema, proposalSchema, serviceSpecSchema } from "@/lib/schemas/exports";

export async function saveCompanyData(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireManager();
  const r = parseForm(companySchema, fd);
  if (!r.ok) return r.state;
  await prisma.company.update({ where: { id: ctx.company.id }, data: r.data });
  revalidatePath("/", "layout");
  return { status: "ok", message: "Dados da empresa salvos." };
}

async function budgetOf(companyId: string, budgetId: string) {
  const b = await prisma.budget.findFirst({ where: { id: budgetId, project: { companyId } }, select: { id: true, projectId: true } });
  if (!b) throw new Error("Orçamento não encontrado.");
  return b;
}

export async function saveProposalData(budgetId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(proposalSchema, fd);
  if (!r.ok) return r.state;
  const b = await budgetOf(ctx.company.id, budgetId);
  await prisma.budget.update({ where: { id: b.id }, data: r.data });
  revalidatePath(`/orcamentos/${b.projectId}/exportar`);
  return { status: "ok", message: "Dados da proposta salvos." };
}

export async function saveBidderData(budgetId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(bidderSchema, fd);
  if (!r.ok) return r.state;
  const b = await budgetOf(ctx.company.id, budgetId);
  await prisma.budget.update({ where: { id: b.id }, data: r.data });
  revalidatePath(`/orcamentos/${b.projectId}/exportar`);
  return { status: "ok", message: "Textos para as proponentes salvos." };
}

export async function saveServiceSpec(nodeId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(serviceSpecSchema, fd);
  if (!r.ok) return r.state;
  const node = await prisma.wbsNode.findFirst({ where: { id: nodeId, kind: "SERVICE", budget: { project: { companyId: ctx.company.id } } }, select: { id: true, budget: { select: { projectId: true } } } });
  if (!node) return { status: "error", message: "Serviço não encontrado." };
  await prisma.wbsNode.update({ where: { id: nodeId }, data: r.data });
  revalidatePath(`/orcamentos/${node.budget.projectId}/especificacoes`);
  return { status: "ok", message: "Salvo." };
}
