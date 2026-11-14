// src/lib/schemas/budget.ts
import { z } from "zod";
import { checkbox, optionalText, requiredText } from "@/lib/forms";
import { UFS } from "@/lib/format";

const CATEGORIES = ["RESIDENTIAL_BUILDING","COMMERCIAL_BUILDING","SCHOOL","HEALTH_UNIT","PAVING","DRAINAGE","SANITATION","RENOVATION","OTHER"] as const;

const intOrNull = z.string().optional().transform((raw, ctx) => {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) { ctx.addIssue({ code: "custom", message: "Informe um número inteiro de dias" }); return z.NEVER; }
  return n;
});

const dateTimeOrNull = z.string().optional().transform((raw, ctx) => {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) { ctx.addIssue({ code: "custom", message: "Data inválida" }); return z.NEVER; }
  return d;
});

export const newBudgetSchema = z.object({
  // Passo 1 — dados gerais
  type: z.enum(["PUBLIC", "PRIVATE"], { message: "Escolha o tipo de obra" }),
  name: requiredText("Descrição"),
  clientId: optionalText,
  category: z.enum(CATEGORIES, { message: "Escolha a categoria" }),
  uf: z.enum(UFS as [string, ...string[]], { message: "UF inválida" }),
  address: optionalText,
  deadlineDays: intOrNull,
  biddingModality: optionalText,
  biddingNumber: optionalText,
  biddingAgency: optionalText,
  biddingOpensAt: dateTimeOrNull,
  // Passo 2 — encargos e BDI
  /** Obrigatória nas bases SINAPI; nas SICRO os encargos vêm por profissional do DNIT (decisão #70) */
  socialChargesId: optionalText,
  bdiId: requiredText("BDI"),
  supplyBdiId: optionalText,
  useSupplyBdi: checkbox,
  // Passo 3 — base de preços
  priceTableId: requiredText("Base de preços"),
  /** Depois de criar, abrir a importação da EAP de uma planilha .xlsx (decisão #62) */
  importSheet: checkbox,
}).superRefine((d, ctx) => {
  if (d.type === "PUBLIC") {
    if (!d.biddingAgency) ctx.addIssue({ code: "custom", path: ["biddingAgency"], message: "Informe o órgão licitante" });
  }
  if (d.useSupplyBdi && !d.supplyBdiId) {
    ctx.addIssue({ code: "custom", path: ["supplyBdiId"], message: "Escolha o BDI de mero fornecimento" });
  }
});
