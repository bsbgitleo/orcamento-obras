// src/lib/schemas/own.ts
// Validation of the company's own base: inputs, compositions and items.
import { z } from "zod";
import { decimalString, optionalText, requiredText } from "@/lib/forms";

export const INPUT_KINDS = ["MATERIAL", "MAO_DE_OBRA", "EQUIPAMENTO", "SERVICO"] as const;
export const OWN_ITEM_TYPES = ["OFFICIAL_INPUT", "OFFICIAL_COMPOSITION", "OWN_INPUT", "OWN_COMPOSITION"] as const;

const isoDate = z.string().trim().transform((s, ctx) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) { ctx.addIssue({ code: "custom", message: "Data inválida" }); return z.NEVER; }
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) { ctx.addIssue({ code: "custom", message: "Data inválida" }); return z.NEVER; }
  if (d.getTime() > Date.now() + 86_400_000) { ctx.addIssue({ code: "custom", message: "A data do preço não pode estar no futuro" }); return z.NEVER; }
  return d;
});

const code = z.string().trim().min(1, "Código é obrigatório").max(30, "Máximo de 30 caracteres")
  .regex(/^[\w.\-/]+$/, "Use letras, números, ponto, hífen ou barra (sem espaços)");

export const ownInputSchema = z.object({
  code,
  description: requiredText("Descrição"),
  unit: requiredText("Unidade"),
  kind: z.enum(INPUT_KINDS, { message: "Escolha o tipo" }),
  unitPrice: decimalString({ min: 0, label: "Preço" }),
  priceDate: isoDate,
  source: requiredText("Fonte do preço"),
  notes: optionalText,
});

export const ownCompositionSchema = z.object({
  code,
  description: optionalText,
  unit: optionalText,
  group: optionalText,
  justification: optionalText,
  /** Criação por cópia de uma composição oficial: descrição e unidade em branco são copiadas */
  copyFromTableId: optionalText,
  copyFromCode: optionalText,
}).superRefine((d, ctx) => {
  if (d.copyFromCode) return;
  if (!d.description) ctx.addIssue({ code: "custom", message: "Descrição é obrigatória", path: ["description"] });
  if (!d.unit) ctx.addIssue({ code: "custom", message: "Unidade é obrigatória", path: ["unit"] });
});

/** Coeficiente > 0 com até 7 casas (como o SINAPI publica). */
const coefficient = decimalString({ min: 0, label: "Coeficiente" }).transform((s, ctx) => {
  if (Number(s) <= 0) { ctx.addIssue({ code: "custom", message: "O coeficiente deve ser maior que zero" }); return z.NEVER; }
  if ((s.split(".")[1] ?? "").length > 7) { ctx.addIssue({ code: "custom", message: "Use no máximo 7 casas decimais" }); return z.NEVER; }
  return s;
});

export const ownItemSchema = z.object({
  type: z.enum(OWN_ITEM_TYPES, { message: "Tipo de item inválido" }),
  ref: requiredText("Item"),
  coefficient,
});

export const coefficientSchema = z.object({ coefficient });
