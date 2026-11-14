// src/lib/actions/proposals.ts
// Propostas recebidas: ler o arquivo (para conferência), gravar, excluir e as
// exigências de prazo e validade (decisões #76–#79).
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth/require";
import { parseForm, type ActionState } from "@/lib/forms";
import { MAX_PROPOSAL_BYTES, readProposalFile } from "@/lib/proposals/read-file";
import { loadReferenceItems } from "@/lib/proposals/load";
import { matchLines, type RefItem } from "@/core/proposals/compare";
import type { ParsedProposal } from "@/core/proposals/types";

async function latestBudget(companyId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, companyId }, include: { budgets: { orderBy: { revision: "desc" }, take: 1, select: { id: true } } } });
  if (!p?.budgets[0]) throw new Error("Orçamento não encontrado.");
  return { projectId: p.id, budgetId: p.budgets[0].id };
}

export interface ReviewLine {
  item: string | null; description: string; unit: string | null; quantity: string | null; unitPrice: string | null; totalPrice: string | null;
  nodeId: string | null; matchedBy: "item" | "description" | null;
}
export type ReadProposalResult =
  | { ok: true; fileName: string; fileKind: "XLSX" | "PDF"; header: Omit<ParsedProposal, "lines" | "warnings">; warnings: string[]; lines: ReviewLine[]; ref: Pick<RefItem, "nodeId" | "item" | "description" | "unit" | "quantity">[] }
  | { ok: false; message: string };

export async function readProposalAction(projectId: string, fd: FormData): Promise<ReadProposalResult> {
  const ctx = await requireEditor();
  try {
    const { budgetId } = await latestBudget(ctx.company.id, projectId);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Escolha o arquivo da proposta (.xlsx ou PDF)." };
    if (file.size > MAX_PROPOSAL_BYTES) return { ok: false, message: "Arquivo grande demais (limite de 10 MB)." };
    const parsed = await readProposalFile(file.name, Buffer.from(await file.arrayBuffer()));
    const { ref } = await loadReferenceItems(prisma, budgetId);
    if (!ref.length) return { ok: false, message: "A planilha do orçamento está vazia: não há itens para comparar." };
    const services = parsed.lines.filter((l) => l.kind === "SERVICE");
    if (!services.length) return { ok: false, message: parsed.warnings[0] ?? "Não achei itens com preço no arquivo." };
    const { lines: _l, warnings, fileKind, ...header } = parsed;
    void _l;
    return {
      ok: true, fileName: file.name, fileKind, header, warnings,
      lines: matchLines(services, ref).map(({ kind: _k, ...l }) => { void _k; return l; }),
      ref: ref.map(({ nodeId, item, description, unit, quantity }) => ({ nodeId, item, description, unit, quantity })),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Não foi possível ler o arquivo." };
  }
}

const num = z.string().regex(/^-?\d+(\.\d+)?$/).nullable();
const saveSchema = z.object({
  bidderName: z.string().trim().min(1, "Informe o nome da proponente").max(200),
  document: z.string().trim().max(40).nullable(),
  technicalLead: z.string().trim().max(200).nullable(),
  executionDays: z.number().int().min(0).max(5000).nullable(),
  validityDays: z.number().int().min(0).max(5000).nullable(),
  declaredTotal: num,
  fileName: z.string().max(300),
  fileKind: z.enum(["XLSX", "PDF", "MANUAL"]),
  lines: z.array(z.object({
    nodeId: z.string().nullable(), item: z.string().max(40).nullable(), description: z.string().max(4000),
    unit: z.string().max(40).nullable(), quantity: num, unitPrice: num, totalPrice: num,
  })).min(1).max(3000),
});

export async function saveProposalAction(projectId: string, payload: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireEditor();
  const r = saveSchema.safeParse(payload);
  if (!r.success) return { ok: false, message: r.error.issues[0]?.message ?? "Dados inválidos." };
  const d = r.data;
  try {
    const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
    const valid = new Set((await prisma.wbsNode.findMany({ where: { budgetId, kind: "SERVICE" }, select: { id: true } })).map((n) => n.id));
    await prisma.proposal.create({
      data: {
        budgetId, bidderName: d.bidderName, document: d.document || null, technicalLead: d.technicalLead || null,
        executionDays: d.executionDays, validityDays: d.validityDays, declaredTotal: d.declaredTotal, fileName: d.fileName, fileKind: d.fileKind,
        items: { create: d.lines.map((l, position) => ({ ...l, position, nodeId: l.nodeId && valid.has(l.nodeId) ? l.nodeId : null })) },
      },
    });
    revalidatePath(`/orcamentos/${pid}/propostas`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Não foi possível gravar a proposta." };
  }
}

export async function deleteProposalAction(projectId: string, proposalId: string): Promise<ActionState> {
  const ctx = await requireEditor();
  const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
  await prisma.proposal.deleteMany({ where: { id: proposalId, budgetId } });
  revalidatePath(`/orcamentos/${pid}/propostas`);
  return { status: "ok", message: "Proposta excluída." };
}

const days = (label: string) => z.string().optional().transform((s, c) => {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (!/^\d{1,4}$/.test(t)) { c.addIssue({ code: "custom", message: `${label}: informe um número de dias` }); return z.NEVER; }
  return Number(t);
});
const rulesSchema = z.object({ bidderMaxDays: days("Prazo"), bidderMinValidityDays: days("Validade") });

export async function saveProposalRulesAction(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(rulesSchema, fd);
  if (!r.ok) return r.state;
  const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
  await prisma.budget.update({ where: { id: budgetId }, data: { bidderMaxDays: r.data.bidderMaxDays, bidderMinValidityDays: r.data.bidderMinValidityDays } });
  revalidatePath(`/orcamentos/${pid}/propostas`);
  return { status: "ok", message: "Exigências salvas." };
}
