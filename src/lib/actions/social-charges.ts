// src/lib/actions/social-charges.ts
"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { decimalString, optionalText, parseForm, requiredText, type ActionState } from "@/lib/forms";
import { REGIME_LABEL, refMonth } from "@/lib/format";

const schema = z.object({
  name: requiredText("Nome"),
  regime: z.enum(["NAO_DESONERADO", "DESONERADO", "SEM_ENCARGOS"], { message: "Regime inválido" }),
  hourlyPct: decimalString({ min: 0, max: 500, label: "Horista" }),
  monthlyPct: decimalString({ min: 0, max: 500, label: "Mensalista" }),
  source: optionalText,
});

export async function saveSocialCharges(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = parseForm(schema, fd);
  if (!r.ok) return r.state;
  if (id) await prisma.socialChargesProfile.update({ where: { id }, data: r.data });
  else await prisma.socialChargesProfile.create({ data: r.data });
  revalidatePath("/encargos");
  redirect("/encargos");
}

export async function deleteSocialCharges(id: string): Promise<void> {
  const used = await prisma.budget.count({ where: { socialChargesId: id } });
  if (used > 0) throw new Error("Tabela vinculada a orçamentos; não pode ser excluída.");
  await prisma.socialChargesProfile.delete({ where: { id } });
  revalidatePath("/encargos");
  redirect("/encargos");
}

/** Creates a profile from the percentages published with a SINAPI price table. */
export async function createSocialChargesFromTable(priceTableId: string): Promise<void> {
  const t = await prisma.priceTable.findUnique({ where: { id: priceTableId } });
  if (!t || t.socialChargesHourly === null || t.socialChargesMonthly === null) {
    throw new Error("Esta tabela não publica encargos sociais.");
  }
  const toPct = (f: Decimal) => new Decimal(f.toString()).times(100).toFixed(2);
  await prisma.socialChargesProfile.create({
    data: {
      name: `SINAPI ${t.uf} ${refMonth(t.referenceMonth)} — ${REGIME_LABEL[t.regime]}`,
      regime: t.regime,
      hourlyPct: toPct(t.socialChargesHourly),
      monthlyPct: toPct(t.socialChargesMonthly),
      source: `SINAPI ${t.uf} ${refMonth(t.referenceMonth)} (${t.sourceFile ?? "planilha de referência"})`,
    },
  });
  revalidatePath("/encargos");
  redirect("/encargos");
}
