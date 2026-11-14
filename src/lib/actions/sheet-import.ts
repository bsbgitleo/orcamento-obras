// src/lib/actions/sheet-import.ts
// Importação de planilha orçamentária .xlsx para um orçamento NOVO (vazio):
// lê o arquivo, procura os códigos na base do orçamento e grava a EAP.
// Itens sem composição na base, com preço, viram composição própria com um
// insumo próprio com esse preço (decisões #62–#64).
"use server";
import { z } from "zod";
import Decimal from "decimal.js";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requireEditor } from "@/lib/auth/require";
import { readWorkbookGrids, type SheetGrid } from "@/lib/imports/sheet-grid";
import { recalculateBudget } from "@/lib/pricing/recalculate-budget";
import { nextSequentialCode, OWN_COMPOSITION_PREFIX, OWN_INPUT_PREFIX } from "@/lib/project-code";
import { sourceOrigin } from "@/core/sheet-import";

const MAX_BYTES = 8 * 1024 * 1024;

async function emptyBudget(companyId: string, budgetId: string) {
  const b = await prisma.budget.findFirst({
    where: { id: budgetId, project: { companyId } },
    include: { priceTable: true, bdi: true, _count: { select: { nodes: true } } },
  });
  if (!b) throw new Error("Orçamento não encontrado.");
  if (b._count.nodes > 0) throw new Error("A importação só é feita em orçamento novo, com a planilha vazia.");
  return b;
}

export async function readSheetAction(budgetId: string, fd: FormData): Promise<{ ok: true; fileName: string; sheets: SheetGrid[] } | { ok: false; message: string }> {
  const ctx = await requireEditor();
  try {
    await emptyBudget(ctx.company.id, budgetId);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Escolha o arquivo .xlsx." };
    if (file.size > MAX_BYTES) return { ok: false, message: "Arquivo grande demais (limite de 8 MB)." };
    if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, message: "Envie um arquivo .xlsx (Excel). Arquivos .xls antigos: abra e salve como .xlsx." };
    const sheets = await readWorkbookGrids(Buffer.from(await file.arrayBuffer()));
    if (!sheets.some((s) => s.rows.length)) return { ok: false, message: "A planilha está vazia." };
    return { ok: true, fileName: file.name, sheets };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Não foi possível ler o arquivo." };
  }
}

export interface CodeMatch { kind: "OFFICIAL" | "OWN"; code: string; description: string; unit: string; unitCost: string | null }

/** Which codes exist in the budget's base (official) or in the company's own base. */
export async function lookupCodesAction(budgetId: string, codes: string[]): Promise<Record<string, CodeMatch>> {
  const ctx = await requireEditor();
  const b = await prisma.budget.findFirst({ where: { id: budgetId, project: { companyId: ctx.company.id } }, select: { priceTableId: true } });
  if (!b) return {};
  const unique = [...new Set(codes.filter(Boolean))].slice(0, 5000);
  const [official, own] = await Promise.all([
    prisma.composition.findMany({ where: { priceTableId: b.priceTableId, code: { in: unique } }, select: { code: true, description: true, unit: true, unitCost: true } }),
    prisma.ownComposition.findMany({ where: { companyId: ctx.company.id, code: { in: unique } }, select: { code: true, description: true, unit: true } }),
  ]);
  const out: Record<string, CodeMatch> = {};
  for (const c of own) out[`OWN:${c.code}`] = { kind: "OWN", code: c.code, description: c.description, unit: c.unit, unitCost: null };
  for (const c of official) out[`OFFICIAL:${c.code}`] = { kind: "OFFICIAL", code: c.code, description: c.description, unit: c.unit, unitCost: c.unitCost?.toString() ?? null };
  return out;
}

const lineSchema = z.object({
  row: z.number().int(),
  kind: z.enum(["STAGE", "SERVICE"]),
  item: z.string().max(40).nullable(),
  parent: z.number().int().min(0).nullable(),
  description: z.string().trim().min(1).max(2000),
  code: z.string().max(40).nullable(),
  source: z.string().max(60).nullable(),
  unit: z.string().max(20).nullable(),
  quantity: z.string().regex(/^-?\d+(\.\d+)?$/).nullable(),
  price: z.string().regex(/^-?\d+(\.\d+)?$/).nullable(),
  specification: z.string().max(8000).nullable(),
  criteria: z.string().max(8000).nullable(),
  requiresBrand: z.boolean(),
});
const payloadSchema = z.object({
  fileName: z.string().max(200),
  priceMode: z.enum(["COST", "WITH_BDI", "IGNORE"]),
  lines: z.array(lineSchema).min(1).max(3000),
});

export interface ImportReport {
  projectId: string;
  stages: number; services: number;
  linkedOfficial: number; linkedOwn: number; createdOwn: number; withoutCost: number;
  /** Serviços vinculados por código cujo custo na base difere do preço da planilha */
  priceDiffs: { item: string | null; code: string; sheet: string; base: string }[];
}

export async function importSheetAction(budgetId: string, payload: unknown): Promise<{ ok: true; report: ImportReport } | { ok: false; message: string }> {
  const ctx = await requireEditor();
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, message: "Dados da importação inválidos." };
  const { fileName, priceMode, lines } = parsed.data;
  for (const [i, l] of lines.entries()) {
    if (l.parent !== null && (l.parent >= i || lines[l.parent]?.kind !== "STAGE")) return { ok: false, message: `Linha ${l.row}: etapa-pai inválida.` };
    if (l.kind === "SERVICE" && l.parent === null) return { ok: false, message: `Linha ${l.row}: serviço fora de etapa.` };
  }

  let budget: Awaited<ReturnType<typeof emptyBudget>>;
  try { budget = await emptyBudget(ctx.company.id, budgetId); } catch (e) { return { ok: false, message: (e as Error).message }; }
  const tableOrigin = budget.priceTable.origin;
  const bdiFactor = new Decimal(1).plus(new Decimal(budget.bdi.percent.toString()).div(100));
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

  // Códigos existentes
  const codes = [...new Set(lines.flatMap((l) => (l.kind === "SERVICE" && l.code ? [l.code] : [])))];
  const [official, ownComps, ownCodes, inputCodes] = await Promise.all([
    prisma.composition.findMany({ where: { priceTableId: budget.priceTableId, code: { in: codes } }, select: { id: true, code: true, unit: true, unitCost: true } }),
    prisma.ownComposition.findMany({ where: { companyId: ctx.company.id, code: { in: codes } }, select: { id: true, code: true, unit: true } }),
    prisma.ownComposition.findMany({ where: { companyId: ctx.company.id }, select: { code: true } }),
    prisma.ownInput.findMany({ where: { companyId: ctx.company.id }, select: { code: true } }),
  ]);
  const officialByCode = new Map(official.map((c) => [c.code, c]));
  const ownByCode = new Map(ownComps.map((c) => [c.code, c]));
  const compCodes = ownCodes.map((c) => c.code);
  const inCodes = inputCodes.map((c) => c.code);

  const report: ImportReport = { projectId: budget.projectId, stages: 0, services: 0, linkedOfficial: 0, linkedOwn: 0, createdOwn: 0, withoutCost: 0, priceDiffs: [] };
  const ids = lines.map(() => createId());
  const position = new Map<string | null, number>();
  const nextPos = (parent: string | null) => { const p = position.get(parent) ?? 0; position.set(parent, p + 1); return p; };
  const newOwn = new Map<string, string>(); // "descrição|un|custo" → id da composição criada
  const ownInputs: Prisma.OwnInputCreateManyInput[] = [];
  const ownCompositions: { id: string; code: string; description: string; unit: string; justification: string; inputId: string }[] = [];
  const nodes: Prisma.WbsNodeCreateManyInput[] = [];

  for (const [i, l] of lines.entries()) {
    const parentId = l.parent === null ? null : ids[l.parent];
    if (l.kind === "STAGE") {
      report.stages++;
      nodes.push({ id: ids[i], budgetId, parentId, kind: "STAGE", position: nextPos(parentId), code: "", description: l.description });
      continue;
    }
    report.services++;
    const origin = sourceOrigin(l.source);
    let link: { compositionId?: string; ownCompositionId?: string } = {};
    let unit = l.unit;
    const off = l.code && origin !== "PROPRIA" && (origin === null || origin === tableOrigin) ? officialByCode.get(l.code) : undefined;
    const own = l.code && !off ? ownByCode.get(l.code) : undefined;
    if (off) {
      link = { compositionId: off.id }; unit ??= off.unit; report.linkedOfficial++;
      if (l.price && priceMode !== "IGNORE" && off.unitCost) {
        const sheetCost = priceMode === "WITH_BDI" ? new Decimal(l.price).div(bdiFactor) : new Decimal(l.price);
        if (sheetCost.minus(off.unitCost.toString()).abs().gt(0.01)) report.priceDiffs.push({ item: l.item, code: l.code!, sheet: sheetCost.toFixed(2), base: off.unitCost.toFixed(2) });
      }
    } else if (own) {
      link = { ownCompositionId: own.id }; unit ??= own.unit; report.linkedOwn++;
    } else if (l.price && priceMode !== "IGNORE" && Number(l.price) > 0) {
      // Composição própria com o preço da planilha (custo = preço ÷ (1 + BDI) quando o preço tem BDI)
      const cost = (priceMode === "WITH_BDI" ? new Decimal(l.price).div(bdiFactor) : new Decimal(l.price)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const u = unit ?? "un";
      const key = `${l.description.toLowerCase()}|${u.toLowerCase()}|${cost.toFixed(2)}`;
      let compId = newOwn.get(key);
      if (!compId) {
        const inputCode = nextSequentialCode(OWN_INPUT_PREFIX, inCodes); inCodes.push(inputCode);
        const compCode = nextSequentialCode(OWN_COMPOSITION_PREFIX, compCodes); compCodes.push(compCode);
        const inputId = createId();
        compId = createId();
        const ref = `${fileName}, linha ${l.row}${l.item ? ` (item ${l.item})` : ""}`;
        ownInputs.push({
          id: inputId, companyId: ctx.company.id, code: inputCode, description: l.description.slice(0, 500), unit: u, kind: "SERVICO",
          unitPrice: cost.toFixed(2), priceDate: today, source: `Planilha importada: ${ref}`.slice(0, 300),
          notes: priceMode === "WITH_BDI" ? `Preço da planilha R$ ${l.price} com BDI de ${budget.bdi.percent.toString()} %; custo = preço ÷ (1 + BDI).` : null,
        });
        ownCompositions.push({
          id: compId, code: compCode, description: l.description.slice(0, 500), unit: u, inputId,
          justification: `Importada da planilha ${ref}: serviço sem composição na base ${tableOrigin}; custo unitário igual ao preço informado${priceMode === "WITH_BDI" ? " sem o BDI" : ""}.`,
        });
        newOwn.set(key, compId);
        report.createdOwn++;
      }
      link = { ownCompositionId: compId };
    } else {
      report.withoutCost++;
    }
    nodes.push({
      id: ids[i], budgetId, parentId, kind: "SERVICE", position: nextPos(parentId), code: "", description: l.description.slice(0, 2000),
      unit: unit ?? "un", quantity: l.quantity ?? "0", ...link,
      specification: l.specification, measurementCriteria: l.criteria, requiresBrand: l.requiresBrand,
    });
  }

  await prisma.$transaction(async (tx) => {
    if (ownInputs.length) await tx.ownInput.createMany({ data: ownInputs });
    for (const c of ownCompositions) {
      await tx.ownComposition.create({
        data: {
          id: c.id, companyId: ctx.company.id, code: c.code, description: c.description, unit: c.unit, group: "Importadas", justification: c.justification,
          items: { create: [{ position: 0, type: "OWN_INPUT", ownInputId: c.inputId, coefficient: "1" }] },
        },
      });
    }
    // Etapas antes dos serviços; as linhas já vêm com o pai antes do filho
    await tx.wbsNode.createMany({ data: nodes.filter((n) => n.kind === "STAGE") });
    await tx.wbsNode.createMany({ data: nodes.filter((n) => n.kind === "SERVICE") });
    await tx.budget.update({ where: { id: budgetId }, data: { notes: `EAP importada de ${fileName} em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` } });
  }, { timeout: 60_000 });

  await recalculateBudget(prisma, budgetId);
  // Sem revalidatePath: recarregar a página de importação esconderia o resumo
  // (ela passa a ver um orçamento com itens). As páginas do orçamento são dinâmicas.
  return { ok: true, report };
}
