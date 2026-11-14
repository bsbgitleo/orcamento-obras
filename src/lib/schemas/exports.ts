// src/lib/schemas/exports.ts
import { z } from "zod";
import { checkbox, optionalText, requiredText } from "@/lib/forms";

export const companySchema = z.object({
  name: requiredText("Razão social"),
  document: optionalText,
  address: optionalText,
  phone: optionalText,
  email: z.string().trim().transform((s) => (s === "" ? null : s)).pipe(z.string().email("E-mail inválido").nullable()),
  technicalLead: optionalText,
  technicalRegistry: optionalText,
});

const days = z.string().optional().transform((raw, ctx) => {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > 3650) { ctx.addIssue({ code: "custom", message: "Informe um número de dias entre 1 e 3650" }); return z.NEVER; }
  return n;
});

export const proposalSchema = z.object({
  proposalValidityDays: days,
  executionTerm: optionalText,
  paymentTerms: optionalText,
  proposalNotes: optionalText,
});

export const bidderSchema = z.object({
  bidderInstructions: optionalText,
  bidderPremises: optionalText,
});

export const serviceSpecSchema = z.object({
  specification: optionalText,
  measurementCriteria: optionalText,
  requiresBrand: checkbox,
});
