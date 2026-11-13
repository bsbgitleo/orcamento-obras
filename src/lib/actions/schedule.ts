// src/lib/actions/schedule.ts
"use server";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/lib/forms";

const MAX_MONTHS = 60;

function parsePct(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return "0";
  const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d+)?$/.test(n)) return null;
  const d = new Decimal(n);
  if (d.gt(100)) return null;
  return d.toFixed(4);
}

/**
 * Saves the whole schedule grid. Fields: `months` and `p_<nodeId>_<month>`.
 * Rows that do not sum to 100 % are saved and flagged on the page (public
 * works need 100 %, but partial saving is useful while editing).
 */
export async function saveSchedule(budgetId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: budgetId }, select: { projectId: true } });
  const months = Number(fd.get("months"));
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return { status: "error", message: `Duração deve ser um número inteiro de 1 a ${MAX_MONTHS} meses.` };
  }
  const roots = await prisma.wbsNode.findMany({ where: { budgetId, parentId: null, kind: "STAGE" }, select: { id: true } });
  const rootIds = new Set(roots.map((r) => r.id));

  const entries: { nodeId: string; month: number; percent: string }[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    const m = /^p_(.+)_(\d+)$/.exec(key);
    if (!m || typeof value !== "string") continue;
    const [, nodeId, monthStr] = m;
    const month = Number(monthStr);
    if (!rootIds.has(nodeId) || month < 1 || month > months) continue;
    const pct = parsePct(value);
    if (pct === null) { fieldErrors[key] = "Percentual inválido (0 a 100)"; continue; }
    if (pct !== "0.0000") entries.push({ nodeId, month, percent: pct });
  }
  if (Object.keys(fieldErrors).length) return { status: "error", message: "Corrija os percentuais indicados.", fieldErrors };

  await prisma.$transaction([
    prisma.scheduleEntry.deleteMany({ where: { budgetId } }),
    prisma.scheduleEntry.createMany({ data: entries.map((e) => ({ budgetId, ...e })) }),
    prisma.budget.update({ where: { id: budgetId }, data: { scheduleMonths: months } }),
  ]);
  revalidatePath(`/orcamentos/${budget.projectId}/cronograma`);
  return { status: "ok", message: "Cronograma salvo." };
}
