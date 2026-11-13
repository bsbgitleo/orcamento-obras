// src/import/sinapi/cell.ts
// Helpers to normalise exceljs cell values coming from the SINAPI workbooks.
import type { CellValue } from "exceljs";
import Decimal from "decimal.js";

export function cellText(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("result" in v && v.result !== undefined && v.result !== null) return cellText(v.result as CellValue);
    if ("formula" in v && typeof v.formula === "string") return v.formula;
    if ("text" in v && typeof v.text === "string") return v.text.trim();
  }
  return String(v).trim();
}

/**
 * Numeric cell → exact decimal string. exceljs hands us JS floats; `String(n)`
 * is the shortest round-trip form, which for SINAPI's ≤7-place values is the
 * published value (0.9464285 → "0.9464285"). Blank/non-numeric → null.
 */
export function cellDecimal(v: CellValue): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? new Decimal(String(v)).toString() : null;
  if (typeof v === "object" && "result" in v) return cellDecimal(v.result as CellValue);
  const t = cellText(v).replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return new Decimal(t).toString();
}

/** Composition code cells in CSD/CCD/CSE are HYPERLINK formulas ending in ",104658)". */
export function compositionCode(v: CellValue): string {
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "formula" in v && typeof v.formula === "string") {
    const m = /,\s*(\d+)\s*\)\s*$/.exec(v.formula);
    if (m) return m[1];
    if ("result" in v && v.result !== undefined) return cellText(v.result as CellValue);
  }
  return cellText(v);
}

/** "10/2026" → "2026-10" */
export function parseReferenceMonth(text: string): string {
  const m = /^(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) throw new Error(`Mês de referência inesperado: "${text}"`);
  return `${m[2]}-${m[1]}`;
}
