// src/core/money.ts
// Decimal helpers. All monetary values and quantities flow through decimal.js;
// `number` is never used for money (decision #2 / spec §7).
import Decimal from "decimal.js";

// High internal precision; rounding only happens at explicit boundaries.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type Dec = Decimal;
export type DecimalInput = Decimal | string | number;

export const D = (v: DecimalInput): Decimal => new Decimal(v);
export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
export const HUNDRED = new Decimal(100);

/** Scale of unit costs and totals (2 places). */
export const MONEY_SCALE = 2;
/** Scale of quantities and coefficients (spec: up to 4 places; SINAPI coefficients go to 7). */
export const QUANTITY_SCALE = 4;

/**
 * Truncates to 2 places (decision #5, revised 2026-11-13): SINAPI computes
 * TRUNC(coefficient × price, 2) per item and sums — verified against the
 * official "Analítico com Custo" sheet (ref. 10/2026). This is the rule for
 * composition items and service totals.
 */
export function truncMoney(v: DecimalInput): Decimal {
  return D(v).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_DOWN);
}

/** Rounds to 2 places, half up. Used for display and for values that are not SINAPI item costs (e.g. BDI). */
export function roundMoney(v: DecimalInput): Decimal {
  return D(v).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

export function roundQuantity(v: DecimalInput): Decimal {
  return D(v).toDecimalPlaces(QUANTITY_SCALE, Decimal.ROUND_HALF_UP);
}

/** Percent (e.g. "5" or "5.00") → fraction (0.05). */
export function pct(v: DecimalInput): Decimal {
  return D(v).div(HUNDRED);
}

export function sum(values: Iterable<DecimalInput>): Decimal {
  let acc = ZERO;
  for (const v of values) acc = acc.plus(v);
  return acc;
}

/** Formats as "R$ 1.234,56" (pt-BR). */
export function formatBRL(v: DecimalInput): string {
  const fixed = roundMoney(v).toFixed(MONEY_SCALE); // "-1234.56"
  const negative = fixed.startsWith("-");
  const [intPart, fracPart] = fixed.replace("-", "").split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}R$ ${grouped},${fracPart}`;
}

/** Parses "1.234,56" or "1234.56" into a Decimal. Throws on invalid input. */
export function parseBRL(text: string): Decimal {
  const cleaned = text.replace(/R\$\s?/g, "").trim();
  const normalized = /,\d{1,2}$/.test(cleaned)
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  const d = new Decimal(normalized);
  if (d.isNaN()) throw new Error(`Valor monetário inválido: "${text}"`);
  return d;
}
