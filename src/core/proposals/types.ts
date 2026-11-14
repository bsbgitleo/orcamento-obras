// src/core/proposals/types.ts
// Proposta recebida de uma proponente, lida de .xlsx ou PDF (decisões #76–#79).

export interface ParsedProposalLine {
  /** Numeração da proponente (1.1, 2.10…) */
  item: string | null;
  kind: "STAGE" | "SERVICE";
  description: string;
  unit: string | null;
  quantity: string | null;
  /** Preço unitário com BDI; null = sem preço ("-", vazio) */
  unitPrice: string | null;
  /** Total declarado pela proponente na linha */
  totalPrice: string | null;
}

export interface ParsedProposal {
  company: string | null;
  document: string | null;
  technicalLead: string | null;
  /** Validade da proposta (dias) */
  validityDays: number | null;
  /** Prazo de execução (dias) */
  executionDays: number | null;
  lines: ParsedProposalLine[];
  /** Total geral declarado no fim da proposta, quando achado */
  declaredTotal: string | null;
  /** Avisos da leitura (colunas não achadas etc.) */
  warnings: string[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export { norm as normText };

/** "R$ 1.234,56" / "1234,5" / "1,234.56" / "-" → "1234.56" | null */
export function parseMoney(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : null;
  let t = raw.replace(/R\$\s*/gi, "").replace(/\s/g, "");
  if (!t || /^[-–—]+$/.test(t)) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
}

/** "30 DIAS", "45", "90 dias corridos" → 30 / 45 / 90 */
export function parseDays(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
  const m = /(\d{1,4})/.exec(raw);
  return m ? Number(m[1]) : null;
}

export const ITEM_NUMBER = /^\d{1,3}(\.\d{1,3}){0,4}\.?$/;

/**
 * Cabeçalho da proposta em texto corrido ("Empresa: X Validade: 30 RT / CREA: …
 * Prazo: 45 Acesso: CNPJ 00.000…"). Cada rótulo vai até o próximo rótulo.
 */
export function parseHeaderText(text: string): Pick<ParsedProposal, "company" | "document" | "technicalLead" | "validityDays" | "executionDays"> {
  const labels = [
    { key: "company", re: /empresa\s*:?/i },
    { key: "document", re: /cnpj\s*:?/i },
    { key: "technicalLead", re: /rt\s*\/\s*crea\s*:?|respons[aá]vel t[eé]cnico\s*:?/i },
    { key: "validity", re: /validade(?: da proposta)?\s*:?/i },
    { key: "execution", re: /prazo(?: de execu[cç][aã]o)?\s*:?/i },
    { key: "access", re: /acesso\s*:?/i },
  ] as const;
  const hits: { key: string; start: number; end: number }[] = [];
  for (const l of labels) {
    const m = new RegExp(l.re.source, "gi").exec(text);
    if (m) hits.push({ key: l.key, start: m.index, end: m.index + m[0].length });
  }
  hits.sort((a, b) => a.start - b.start);
  const val = (key: string) => {
    const i = hits.findIndex((h) => h.key === key);
    if (i < 0) return null;
    const v = text.slice(hits[i].end, hits[i + 1]?.start ?? text.length).replace(/^[\s:]+/, "").trim();
    return v || null;
  };
  const doc = val("document");
  return {
    company: val("company"),
    document: doc ? (/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.exec(doc)?.[0] ?? doc) : null,
    technicalLead: val("technicalLead"),
    validityDays: parseDays(val("validity")),
    executionDays: parseDays(val("execution")),
  };
}
