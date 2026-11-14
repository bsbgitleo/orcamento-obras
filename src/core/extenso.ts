// src/core/extenso.ts
// Valor em reais por extenso (proposta comercial): 1234,56 → "mil, duzentos e
// trinta e quatro reais e cinquenta e seis centavos".
import { D, type DecimalInput } from "./money";

const UNITS = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
const SCALES: [string, string][] = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"], ["trilhão", "trilhões"]];

/** 0–999 */
function triple(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const h = Math.floor(n / 100), rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest) parts.push(rest < 20 ? UNITS[rest] : [TENS[Math.floor(rest / 10)], UNITS[rest % 10]].filter(Boolean).join(" e "));
  return parts.join(" e ");
}

/** Inteiro por extenso ("zero" para 0). */
export function integerInWords(value: bigint): string {
  if (value === BigInt(0)) return "zero";
  const groups: number[] = [];
  let v = value;
  while (v > BigInt(0)) { groups.push(Number(v % BigInt(1000))); v /= BigInt(1000); }
  const words: { text: string; n: number; scale: number }[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const n = groups[i];
    if (!n) continue;
    const [one, many] = SCALES[i] ?? ["", ""];
    const t = i === 1 && n === 1 ? "mil" : `${triple(n)}${i ? ` ${n === 1 ? one : many}` : ""}`;
    words.push({ text: t, n, scale: i });
  }
  // Junção: "e" antes do último grupo quando ele é < 100 ou centena redonda; vírgula nos demais
  return words.map((w, idx) => {
    if (idx === 0) return w.text;
    const last = idx === words.length - 1;
    const useE = last && w.scale === 0 && (w.n < 100 || w.n % 100 === 0);
    return `${useE ? " e " : ", "}${w.text}`;
  }).join("");
}

export function brlInWords(amount: DecimalInput): string {
  const v = D(amount).toDecimalPlaces(2);
  if (v.isNegative()) return `menos ${brlInWords(v.negated())}`;
  const reais = BigInt(v.floor().toFixed(0));
  const centavos = v.minus(v.floor()).times(100).round().toNumber();
  const parts: string[] = [];
  if (reais > BigInt(0)) {
    const words = integerInWords(reais);
    // "um milhão de reais", "dois milhões de reais"
    const de = reais % BigInt(1000000) === BigInt(0) ? " de" : "";
    parts.push(`${words}${de} ${reais === BigInt(1) ? "real" : "reais"}`);
  }
  if (centavos > 0) parts.push(`${integerInWords(BigInt(centavos))} ${centavos === 1 ? "centavo" : "centavos"}`);
  return parts.length ? parts.join(" e ") : "zero real";
}
