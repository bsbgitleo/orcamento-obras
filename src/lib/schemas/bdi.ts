// src/lib/schemas/bdi.ts
import { z } from "zod";
import { decimalString, optionalDecimalString, optionalText, requiredText } from "@/lib/forms";
import { TCU_BDI_RANGES, type WorkType } from "@/core/bdi";

const pctField = (label: string) => decimalString({ min: 0, max: 100, label });

export const bdiSchema = z.object({
  name: requiredText("Nome"),
  workType: z.enum(Object.keys(TCU_BDI_RANGES) as [WorkType, ...WorkType[]], { message: "Tipo de obra inválido" }),
  centralAdministration: pctField("Administração central"),
  insurance: pctField("Seguro"),
  risk: pctField("Risco"),
  guarantee: pctField("Garantia"),
  financialExpenses: pctField("Despesas financeiras"),
  profit: pctField("Lucro"),
  pis: pctField("PIS"),
  cofins: pctField("COFINS"),
  iss: pctField("ISS"),
  cprb: optionalDecimalString({ min: 0, max: 100, label: "CPRB" }).transform((v) => v ?? "0"),
  notes: optionalText,
});
