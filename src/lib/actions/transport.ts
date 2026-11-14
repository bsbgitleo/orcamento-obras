// src/lib/actions/transport.ts
// DMT padrão por via, FIT e DMT por material de um orçamento SICRO (decisões #66–#68, #71–#74).
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkbox, decimalString, optionalDecimalString, optionalText, parseForm, type ActionState } from "@/lib/forms";
import { requireEditor } from "@/lib/auth/require";
import { recalculateBudget } from "@/lib/pricing/recalculate-budget";

const km = optionalDecimalString({ min: 0, max: 5000, label: "DMT" });

async function sicroBudget(companyId: string, budgetId: string) {
  const b = await prisma.budget.findFirst({ where: { id: budgetId, project: { companyId } }, include: { priceTable: { select: { origin: true } } } });
  if (!b) throw new Error("Orçamento não encontrado.");
  if (b.priceTable.origin !== "SICRO") throw new Error("O momento de transporte só se aplica a bases SICRO.");
  return b;
}

const defaultsSchema = z.object({ dmtNatural: km, dmtPrimary: km, dmtPaved: km, dmtUrban: km });

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

const materialSchema = z.object({ dmtNatural: km, dmtPrimary: km, dmtPaved: km, dmtUrban: km, passesWorksite: checkbox, applyFit: checkbox, note: optionalText });

export async function saveMaterialDmt(budgetId: string, materialCode: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(materialSchema, fd);
  if (!r.ok) return r.state;
  const b = await sicroBudget(ctx.company.id, budgetId);
  const code = materialCode.slice(0, 40);
  const empty = r.data.dmtNatural === null && r.data.dmtPrimary === null && r.data.dmtPaved === null && r.data.dmtUrban === null
    && r.data.passesWorksite && r.data.applyFit && !r.data.note;
  if (empty) await prisma.transportDmt.deleteMany({ where: { budgetId: b.id, materialCode: code } });
  else await prisma.transportDmt.upsert({ where: { budgetId_materialCode: { budgetId: b.id, materialCode: code } }, create: { budgetId: b.id, materialCode: code, ...r.data }, update: r.data });
  await recalculateBudget(prisma, b.id);
  revalidatePath(`/orcamentos/${b.projectId}`, "layout");
  return { status: "ok", message: empty ? "Ajuste removido: vale a DMT padrão." : "Salvo." };
}

// FIT (Volume 05, 2025 — decisões #71–#74)
const fitSchema = z.object({
  fitMode: z.enum(["CALCULATED", "MANUAL"]),
  fit: optionalDecimalString({ min: 1, max: 5, label: "FIT" }),
  stopGo: checkbox,
  urbanSpeed: optionalDecimalString({ min: 5, max: 59, label: "Velocidade urbana" }),
  trafficSource: optionalText,
});

export async function saveFitSettings(budgetId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(fitSchema, fd);
  if (!r.ok) return r.state;
  const b = await sicroBudget(ctx.company.id, budgetId);
  await prisma.budget.update({ where: { id: b.id }, data: r.data });
  await recalculateBudget(prisma, b.id);
  revalidatePath(`/orcamentos/${b.projectId}`, "layout");
  return { status: "ok", message: "FIT salvo; a etapa de transportes foi recalculada." };
}

const segmentSchema = z.object({
  description: optionalText,
  lengthKm: decimalString({ min: 0.001, max: 5000, label: "Extensão" }),
  vmdPerLane: decimalString({ min: 0, max: 200000, label: "VMD por faixa" }),
});

export async function addTrafficSegment(budgetId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(segmentSchema, fd);
  if (!r.ok) return r.state;
  const b = await sicroBudget(ctx.company.id, budgetId);
  const last = await prisma.trafficSegment.findFirst({ where: { budgetId: b.id }, orderBy: { position: "desc" }, select: { position: true } });
  await prisma.trafficSegment.create({ data: { budgetId: b.id, position: (last?.position ?? -1) + 1, ...r.data } });
  await recalculateBudget(prisma, b.id);
  revalidatePath(`/orcamentos/${b.projectId}`, "layout");
  return { status: "ok", message: "Segmento incluído." };
}

export async function removeTrafficSegment(budgetId: string, segmentId: string): Promise<void> {
  const ctx = await requireEditor();
  const b = await sicroBudget(ctx.company.id, budgetId);
  await prisma.trafficSegment.deleteMany({ where: { id: segmentId, budgetId: b.id } });
  await recalculateBudget(prisma, b.id);
  revalidatePath(`/orcamentos/${b.projectId}`, "layout");
}
