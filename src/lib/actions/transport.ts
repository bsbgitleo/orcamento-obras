// src/lib/actions/transport.ts
// DMT padrão por via, FIT e DMT por material de um orçamento SICRO (decisões #66–#68).
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { optionalDecimalString, optionalText, parseForm, type ActionState } from "@/lib/forms";
import { requireEditor } from "@/lib/auth/require";
import { recalculateBudget } from "@/lib/pricing/recalculate-budget";

const km = optionalDecimalString({ min: 0, max: 5000, label: "DMT" });

async function sicroBudget(companyId: string, budgetId: string) {
  const b = await prisma.budget.findFirst({ where: { id: budgetId, project: { companyId } }, include: { priceTable: { select: { origin: true } } } });
  if (!b) throw new Error("Orçamento não encontrado.");
  if (b.priceTable.origin !== "SICRO") throw new Error("O momento de transporte só se aplica a bases SICRO.");
  return b;
}

const defaultsSchema = z.object({
  dmtNatural: km, dmtPrimary: km, dmtPaved: km,
  fit: optionalDecimalString({ min: 1, max: 5, label: "FIT" }),
});

export async function saveTransportDefaults(budgetId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(defaultsSchema, fd);
  if (!r.ok) return r.state;
  const b = await sicroBudget(ctx.company.id, budgetId);
  await prisma.budget.update({ where: { id: b.id }, data: r.data });
  await recalculateBudget(prisma, b.id);
  revalidatePath(`/orcamentos/${b.projectId}`, "layout");
  return { status: "ok", message: "Distâncias salvas; a etapa de transportes foi recalculada." };
}

const materialSchema = z.object({ dmtNatural: km, dmtPrimary: km, dmtPaved: km, note: optionalText });

export async function saveMaterialDmt(budgetId: string, materialCode: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(materialSchema, fd);
  if (!r.ok) return r.state;
  const b = await sicroBudget(ctx.company.id, budgetId);
  const code = materialCode.slice(0, 40);
  const empty = r.data.dmtNatural === null && r.data.dmtPrimary === null && r.data.dmtPaved === null && !r.data.note;
  if (empty) await prisma.transportDmt.deleteMany({ where: { budgetId: b.id, materialCode: code } });
  else await prisma.transportDmt.upsert({ where: { budgetId_materialCode: { budgetId: b.id, materialCode: code } }, create: { budgetId: b.id, materialCode: code, ...r.data }, update: r.data });
  await recalculateBudget(prisma, b.id);
  revalidatePath(`/orcamentos/${b.projectId}`, "layout");
  return { status: "ok", message: empty ? "Ajuste removido: vale a DMT padrão." : "Salvo." };
}
