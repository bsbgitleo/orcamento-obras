// src/lib/forms.ts
// Shared helpers for server actions driven by <form action> + useActionState.
import { z } from "zod";

export type FieldErrors = Record<string, string>;

export type ActionState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: FieldErrors; values?: Record<string, string> }
  | { status: "ok"; message?: string };

export const idle: ActionState = { status: "idle" };

/** FormData → plain record of trimmed strings (empty → ""). Repeated keys keep the last value. */
export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v.trim();
  return out;
}

export function zodErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Parses a FormData with a zod schema. Returns { data } or an error ActionState (with the submitted values). */
export function parseForm<T extends z.ZodTypeAny>(schema: T, fd: FormData):
  | { ok: true; data: z.infer<T>; values: Record<string, string> }
  | { ok: false; state: ActionState } {
  const values = formValues(fd);
  const r = schema.safeParse(values);
  if (r.success) return { ok: true, data: r.data, values };
  return { ok: false, state: { status: "error", message: "Corrija os campos indicados.", fieldErrors: zodErrors(r.error), values } };
}

// ─── Reusable zod pieces (inputs come as strings from FormData) ───

const ptNumber = (s: string) => s.replace(/\./g, "").replace(",", ".");

function parseDecimal(raw: string, ctx: z.RefinementCtx, opts: { min?: number; max?: number; label?: string }): string {
  // "1.234,56" → "1234.56"; "4.5" stays "4.5" (single dot, no comma)
  const normalized = raw.includes(",") ? ptNumber(raw) : raw;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    ctx.addIssue({ code: "custom", message: `Número inválido${opts.label ? ` em ${opts.label}` : ""}` });
    return z.NEVER;
  }
  const n = Number(normalized);
  if (opts.min !== undefined && n < opts.min) { ctx.addIssue({ code: "custom", message: `Mínimo ${opts.min}` }); return z.NEVER; }
  if (opts.max !== undefined && n > opts.max) { ctx.addIssue({ code: "custom", message: `Máximo ${opts.max}` }); return z.NEVER; }
  return normalized;
}

/** Required number. Accepts "4,5", "4.5" or "1.234,56"; normalises to a decimal string ("4.5"). */
export const decimalString = (opts: { min?: number; max?: number; label?: string } = {}) =>
  z.string().transform((s, ctx) => {
    const raw = s.trim();
    if (raw === "") { ctx.addIssue({ code: "custom", message: "Obrigatório" }); return z.NEVER; }
    return parseDecimal(raw, ctx, opts);
  });

/** Optional number: blank → null. */
export const optionalDecimalString = (opts: { min?: number; max?: number; label?: string } = {}) =>
  z.string().optional().transform((s, ctx) => {
    const raw = (s ?? "").trim();
    if (raw === "") return null;
    return parseDecimal(raw, ctx, opts);
  });

export const requiredText = (label = "Campo") => z.string().trim().min(1, `${label} é obrigatório`);
/** Optional text: blank or absent (field not rendered) → null. */
export const optionalText = z.string().optional().transform((s) => { const t = (s ?? "").trim(); return t === "" ? null : t; });
export const checkbox = z.string().optional().transform((s) => s === "on" || s === "true" || s === "1");
