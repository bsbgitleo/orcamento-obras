// src/lib/actions/calc-memory.ts
// Memória de cálculo (parâmetros, fórmulas, vínculo de quantidades) e
// especificação de materiais do orçamento (decisões #80–#83).
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth/require";
import { checkbox, optionalDecimalString, optionalText, parseForm, type ActionState } from "@/lib/forms";
import { recalculateBudget } from "@/lib/pricing/recalculate-budget";
import { CODE_RE, FormulaError, normCode, parseFormula, references } from "@/core/calc-memory";

async function latestBudget(companyId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, companyId }, include: { budgets: { orderBy: { revision: "desc" }, take: 1, select: { id: true } } } });
  if (!p?.budgets[0]) throw new Error("Orçamento não encontrado.");
  return { projectId: p.id, budgetId: p.budgets[0].id };
}
const done = async (projectId: string, budgetId: string, recalc = true) => {
  if (recalc) await recalculateBudget(prisma, budgetId);
  revalidatePath(`/orcamentos/${projectId}`, "layout");
};
const FUNC_NAMES = new Set(["ROUND", "ARRED", "ROUNDUP", "ROUNDDOWN", "TRUNC", "TRUNCAR", "MAX", "MIN", "SUM", "SOMA", "ABS", "SQRT", "RAIZ"]);

/* ---------- memória de cálculo ---------- */

const rowSchema = z.object({
  kind: z.enum(["SECTION", "PARAM"]),
  code: optionalText, description: z.string().trim().min(1, "Descrição é obrigatória").max(500),
  unit: optionalText, value: optionalDecimalString({ label: "Valor" }), formula: optionalText, source: optionalText, estimated: checkbox,
});

export async function saveCalcRow(projectId: string, rowId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(rowSchema, fd);
  if (!r.ok) return r.state;
  const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
  const d = r.data;
  const values = Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const fail = (field: string, message: string): ActionState => ({ status: "error", message: "Corrija os campos indicados.", fieldErrors: { [field]: message }, values });
  const existing = rowId ? await prisma.calcRow.findFirst({ where: { id: rowId, budgetId } }) : null;
  if (rowId && !existing) return { status: "error", message: "Linha não encontrada." };

  let code: string | null = null;
  if (d.kind === "PARAM") {
    if (!d.code) return fail("code", "Informe a sigla");
    if (!CODE_RE.test(d.code)) return fail("code", "Sigla: letra seguida de letras, números ou _ (até 12)");
    code = normCode(d.code);
    if (FUNC_NAMES.has(code)) return fail("code", "Essa sigla é nome de função");
    const clash = await prisma.calcRow.findFirst({ where: { budgetId, code, NOT: rowId ? { id: rowId } : undefined } });
    if (clash) return fail("code", `A sigla ${code} já existe`);
    if (!d.formula && d.value === null) return fail("value", "Informe o valor ou a fórmula");
    if (d.formula) {
      try {
        const refs = references(parseFormula(d.formula));
        if (refs.has(code)) return fail("formula", "A fórmula não pode usar a própria sigla");
      } catch (e) { return fail("formula", e instanceof FormulaError ? e.message : "Fórmula inválida"); }
    }
  }
  const data = {
    kind: d.kind, code, description: d.description, unit: d.kind === "PARAM" ? d.unit : null,
    value: d.kind === "PARAM" && !d.formula ? d.value : null, formula: d.kind === "PARAM" ? d.formula : null,
    source: d.kind === "PARAM" ? d.source : null, estimated: d.kind === "PARAM" && d.estimated,
  };
  if (existing) {
    await prisma.calcRow.update({ where: { id: existing.id }, data });
    // Sigla trocada: atualiza as fórmulas que a usavam
    if (existing.code && code && existing.code !== code) {
      const re = new RegExp(`(?<![A-Za-z0-9_.])${existing.code}(?![A-Za-z0-9_.(])`, "gi");
      const users = await prisma.calcRow.findMany({ where: { budgetId, formula: { not: null } } });
      for (const u of users) if (u.formula && re.test(u.formula)) await prisma.calcRow.update({ where: { id: u.id }, data: { formula: u.formula.replace(re, code) } });
    }
  } else {
    const last = await prisma.calcRow.findFirst({ where: { budgetId }, orderBy: { position: "desc" }, select: { position: true } });
    await prisma.calcRow.create({ data: { ...data, budgetId, position: (last?.position ?? -1) + 1 } });
  }
  await done(pid, budgetId);
  return { status: "ok", message: existing ? "Linha salva." : "Linha incluída." };
}

export async function deleteCalcRow(projectId: string, rowId: string): Promise<ActionState> {
  const ctx = await requireEditor();
  const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
  const row = await prisma.calcRow.findFirst({ where: { id: rowId, budgetId } });
  if (!row) return { status: "error", message: "Linha não encontrada." };
  if (row.code) {
    const users = (await prisma.calcRow.findMany({ where: { budgetId, formula: { not: null } } }))
      .filter((u) => { try { return references(parseFormula(u.formula!)).has(row.code!); } catch { return false; } });
    if (users.length) return { status: "error", message: `Usada nas fórmulas de ${users.map((u) => u.code).join(", ")}: ajuste-as antes de excluir.` };
  }
  await prisma.calcRow.delete({ where: { id: row.id } }); // quantidades vinculadas ficam com o último valor
  await done(pid, budgetId);
  return { status: "ok", message: "Linha excluída." };
}

export async function moveCalcRow(projectId: string, rowId: string, dir: -1 | 1): Promise<void> {
  const ctx = await requireEditor();
  const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
  const rows = await prisma.calcRow.findMany({ where: { budgetId }, orderBy: { position: "asc" }, select: { id: true, position: true } });
  const i = rows.findIndex((r) => r.id === rowId), j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  await prisma.$transaction([
    prisma.calcRow.update({ where: { id: rows[i].id }, data: { position: rows[j].position } }),
    prisma.calcRow.update({ where: { id: rows[j].id }, data: { position: rows[i].position } }),
  ]);
  await done(pid, budgetId, false);
}

export async function linkQuantity(projectId: string, nodeId: string, paramId: string | null): Promise<ActionState> {
  const ctx = await requireEditor();
  const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
  const node = await prisma.wbsNode.findFirst({ where: { id: nodeId, budgetId, kind: "SERVICE", autoKind: null } });
  if (!node) return { status: "error", message: "Serviço não encontrado." };
  if (paramId && !(await prisma.calcRow.findFirst({ where: { id: paramId, budgetId, kind: "PARAM" } }))) return { status: "error", message: "Parâmetro não encontrado." };
  await prisma.wbsNode.update({ where: { id: node.id }, data: { quantityParamId: paramId } });
  await done(pid, budgetId);
  return { status: "ok", message: paramId ? "Quantidade vinculada." : "Vínculo removido: a quantidade fica com o último valor." };
}

const noteSchema = z.object({ note: optionalText });

export async function saveCalcNote(projectId: string, field: "calcMemoryNote" | "materialsNote", _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(noteSchema, fd);
  if (!r.ok) return r.state;
  const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
  await prisma.budget.update({ where: { id: budgetId }, data: { [field]: r.data.note } });
  await done(pid, budgetId, false);
  return { status: "ok", message: "Aviso salvo." };
}

/* ---------- especificação de materiais ---------- */

const specSchema = z.object({
  material: z.string().trim().min(1, "Informe o material").max(300),
  specification: optionalText, references: optionalText, standards: optionalText,
});

export async function saveMaterialSpec(projectId: string, specId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(specSchema, fd);
  if (!r.ok) return r.state;
  const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
  const nodeIds = [...new Set(fd.getAll("nodeIds").map(String))];
  const valid = (await prisma.wbsNode.findMany({ where: { budgetId, kind: "SERVICE", id: { in: nodeIds } }, select: { id: true } })).map((n) => n.id);
  if (specId) {
    const s = await prisma.materialSpec.findFirst({ where: { id: specId, budgetId } });
    if (!s) return { status: "error", message: "Material não encontrado." };
    await prisma.$transaction([
      prisma.materialSpec.update({ where: { id: s.id }, data: r.data }),
      prisma.materialSpecItem.deleteMany({ where: { materialSpecId: s.id } }),
      prisma.materialSpecItem.createMany({ data: valid.map((nodeId) => ({ materialSpecId: s.id, nodeId })) }),
    ]);
  } else {
    const last = await prisma.materialSpec.findFirst({ where: { budgetId }, orderBy: { position: "desc" }, select: { position: true } });
    await prisma.materialSpec.create({ data: { ...r.data, budgetId, position: (last?.position ?? -1) + 1, items: { create: valid.map((nodeId) => ({ nodeId })) } } });
  }
  await done(pid, budgetId, false);
  return { status: "ok", message: specId ? "Material salvo." : "Material incluído." };
}

export async function deleteMaterialSpec(projectId: string, specId: string): Promise<ActionState> {
  const ctx = await requireEditor();
  const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
  await prisma.materialSpec.deleteMany({ where: { id: specId, budgetId } });
  await done(pid, budgetId, false);
  return { status: "ok", message: "Material excluído." };
}

export async function moveMaterialSpec(projectId: string, specId: string, dir: -1 | 1): Promise<void> {
  const ctx = await requireEditor();
  const { budgetId, projectId: pid } = await latestBudget(ctx.company.id, projectId);
  const rows = await prisma.materialSpec.findMany({ where: { budgetId }, orderBy: { position: "asc" }, select: { id: true, position: true } });
  const i = rows.findIndex((r) => r.id === specId), j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  await prisma.$transaction([
    prisma.materialSpec.update({ where: { id: rows[i].id }, data: { position: rows[j].position } }),
    prisma.materialSpec.update({ where: { id: rows[j].id }, data: { position: rows[i].position } }),
  ]);
  await done(pid, budgetId, false);
}
