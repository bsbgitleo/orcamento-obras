// src/lib/actions/bdi.ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseForm, type ActionState } from "@/lib/forms";
import { bdiSchema } from "@/lib/schemas/bdi";
import { calculateBdi } from "@/core/bdi";

export async function saveBdi(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = parseForm(bdiSchema, fd);
  if (!r.ok) return r.state;
  const d = r.data;
  let percent: string;
  try {
    percent = calculateBdi({
      centralAdministration: d.centralAdministration, insurance: d.insurance, risk: d.risk, guarantee: d.guarantee,
      financialExpenses: d.financialExpenses, profit: d.profit,
      taxes: { pis: d.pis, cofins: d.cofins, iss: d.iss, cprb: d.cprb },
    }).percent.toString();
  } catch (e) {
    return { status: "error", message: (e as Error).message, values: r.values };
  }
  const data = { ...d, percent };
  if (id) await prisma.bdiProfile.update({ where: { id }, data });
  else await prisma.bdiProfile.create({ data });
  revalidatePath("/bdi");
  redirect("/bdi");
}

export async function deleteBdi(id: string): Promise<void> {
  const used = await prisma.budget.count({ where: { OR: [{ bdiId: id }, { supplyBdiId: id }] } });
  if (used > 0) throw new Error("BDI vinculado a orçamentos; não pode ser excluído.");
  await prisma.bdiProfile.delete({ where: { id } });
  revalidatePath("/bdi");
  redirect("/bdi");
}
