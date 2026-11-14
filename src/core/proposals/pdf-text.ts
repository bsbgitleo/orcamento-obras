// src/core/proposals/pdf-text.ts
// Leitura de proposta em PDF com texto (não escaneado), a partir das palavras
// e das suas posições (x, y) na página — decisão #76.
//
//   1. acha o cabeçalho da tabela (Item … Quant. …) e a posição de cada coluna:
//      item, descrição, especificação, unidade, quantidade, preço unitário, total;
//   2. acima da tabela, lê os campos da proposta (Empresa, CNPJ, RT / CREA,
//      Validade, Prazo) pelo que está à direita de cada rótulo, na mesma altura;
//   3. cada numeração (1, 1.1, 2.10) na coluna do item ancora um item; unidade,
//      quantidade e preços são as palavras à direita mais perto dessa altura
//      (num mesmo item, as colunas podem estar alguns pontos acima ou abaixo);
//   4. a descrição junta as palavras da coluna de descrição mais próximas do
//      item (o texto quebra acima e abaixo da linha dos números); o título da
//      etapa fica com a etapa.
import { ITEM_NUMBER, normText, parseDays, parseHeaderText, parseMoney, type ParsedProposal, type ParsedProposalLine } from "./types";

export interface TextItem { str: string; x: number; y: number }

type Tok = TextItem & { page: number };
const RIGHT_COLS = ["unit", "qty", "pu", "total"] as const;
type RightCol = (typeof RIGHT_COLS)[number];

/** Mesma altura para o cabeçalho: tolerância maior, porque os títulos quebram em duas linhas */
const HEAD_BAND = 14;
/** Distância máxima (pontos) entre a numeração e os números do item */
const ROW_BAND = 9;

const LABELS: { key: "company" | "document" | "technicalLead" | "validity" | "execution" | "other"; re: RegExp }[] = [
  { key: "company", re: /^(empresa|proponente|razao social)\s*:?$/ },
  { key: "document", re: /^cnpj\s*:?$/ },
  { key: "technicalLead", re: /^(rt\s*\/\s*crea|responsavel tecnico)\s*:?$/ },
  { key: "validity", re: /^validade( da proposta)?\s*:?$/ },
  { key: "execution", re: /^prazo( de execucao)?\s*:?$/ },
  { key: "other", re: /^(acesso|data|telefone|e-?mail)\s*:?$/ },
];
const labelOf = (s: string) => LABELS.find((l) => l.re.test(normText(s)))?.key ?? null;

const join = (toks: Tok[]) => toks.map((t) => t.str.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

function readHeader(toks: Tok[]): Pick<ParsedProposal, "company" | "document" | "technicalLead" | "validityDays" | "executionDays"> {
  const labels = toks.filter((t) => labelOf(t.str));
  if (!labels.length) {
    const lines = [...toks].sort((a, b) => b.y - a.y || a.x - b.x);
    return parseHeaderText(join(lines));
  }
  const value = (label: Tok) => {
    const right = toks.filter((t) => t !== label && t.x > label.x && Math.abs(t.y - label.y) <= 8).sort((a, b) => a.x - b.x);
    const out: Tok[] = [];
    for (const t of right) { if (labelOf(t.str)) break; out.push(t); }
    return join(out).replace(/^[:\s]+/, "") || null;
  };
  const get = (key: string) => { const l = labels.find((x) => labelOf(x.str) === key); return l ? value(l) : null; };
  const doc = get("document");
  return {
    company: get("company"),
    document: doc ? (/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.exec(doc)?.[0] ?? doc) : null,
    technicalLead: get("technicalLead"),
    validityDays: parseDays(get("validity")),
    executionDays: parseDays(get("execution")),
  };
}

export function parseProposalText(pages: TextItem[][]): ParsedProposal {
  const warnings: string[] = [];
  const empty: ParsedProposal = { company: null, document: null, technicalLead: null, validityDays: null, executionDays: null, lines: [], declaredTotal: null, warnings };
  const toks: Tok[] = pages.flatMap((items, page) => items.filter((i) => i.str.trim()).map((i) => ({ ...i, page })));

  // 1. Cabeçalho da tabela: "Item" com "Quant." na mesma altura
  const itemHead = toks.find((t) => /^item$/i.test(t.str.trim()) && toks.some((u) => u.page === t.page && Math.abs(u.y - t.y) <= 3 && /quant|qtd/i.test(u.str)));
  if (!itemHead) { warnings.push("Não achei o cabeçalho da tabela (colunas Item e Quant.)."); return empty; }
  const band = toks.filter((t) => t.page === itemHead.page && Math.abs(t.y - itemHead.y) <= HEAD_BAND);
  const colX = (re: RegExp) => band.find((t) => re.test(normText(t.str)))?.x ?? null;
  const itemX = itemHead.x;
  const descX = colX(/descri/);
  const specX = colX(/especifica/);
  const right: Record<RightCol, number | null> = {
    unit: colX(/^(und|unid\.?|unidade|un\.?)$/), qty: colX(/quant|qtd/), pu: colX(/unit/), total: colX(/total/),
  };
  if (right.pu === null) warnings.push("Coluna de preço unitário não achada.");
  if (right.unit === null) warnings.push("Coluna de unidade não achada.");
  const rightCols = RIGHT_COLS.filter((c) => right[c] !== null);
  const rightStart = Math.min(...rightCols.map((c) => right[c]!)) - 12;
  const itemLimit = Math.min(descX !== null ? descX - 20 : Infinity, itemX + 28);
  const headTop = Math.max(...band.map((t) => t.y));
  const headBottom = Math.min(...band.map((t) => t.y));
  // O cabeçalho da tabela se repete no alto das páginas seguintes: fica fora do corpo
  const repeated = new Set<Tok>();
  for (const h of toks) {
    if (h === itemHead || !/^item$/i.test(h.str.trim()) || h.page === itemHead.page) continue;
    if (!toks.some((u) => u.page === h.page && Math.abs(u.y - h.y) <= 3 && /quant|qtd/i.test(u.str))) continue;
    for (const u of toks) if (u.page === h.page && Math.abs(u.y - h.y) <= HEAD_BAND) repeated.add(u);
  }
  const body = toks.filter((t) => (t.page > itemHead.page || (t.page === itemHead.page && t.y < headBottom - 1)) && !band.includes(t) && !repeated.has(t));

  // Fim da descrição: a posição x mais frequente onde começa a especificação
  let descEnd = rightStart;
  if (specX !== null && descX !== null) {
    const counts = new Map<number, number>();
    for (const t of body) { const x = Math.round(t.x); if (x > descX + 30 && x <= specX + 5) counts.set(x, (counts.get(x) ?? 0) + 1); }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    descEnd = best ? best[0] - 3 : specX - 3;
  }

  // 2. Campos da proposta, acima da tabela
  const header = readHeader(toks.filter((t) => t.page === itemHead.page && t.y > headTop + 1));

  // Total geral ("VALOR GLOBAL…", "TOTAL…"): o número à direita na mesma altura
  let declaredTotal: string | null = null;
  const used = new Set<Tok>();
  for (const t of body) {
    if (!/total|valor global|preco global/.test(normText(t.str)) || parseMoney(t.str)) continue;
    if (ITEM_NUMBER.test(t.str.trim())) continue;
    const v = body.filter((u) => u.page === t.page && u.x > t.x && Math.abs(u.y - t.y) <= 6 && parseMoney(u.str)).sort((a, b) => b.x - a.x)[0];
    if (v && parseMoney(v.str)) { declaredTotal = parseMoney(v.str); used.add(v); }
    used.add(t);
    for (const u of body) if (u.page === t.page && Math.abs(u.y - t.y) <= 3 && u.x < rightStart) used.add(u);
  }

  // 3. Itens ancorados na numeração
  type Row = { anchor: Tok; item: string; right: Partial<Record<RightCol, Tok[]>>; desc: Tok[] };
  const rows: Row[] = body
    .filter((t) => t.x < itemLimit && ITEM_NUMBER.test(t.str.trim()) && !used.has(t))
    .sort((a, b) => a.page - b.page || b.y - a.y)
    .map((t) => ({ anchor: t, item: t.str.trim().replace(/\.$/, ""), right: {}, desc: [] }));
  const nearest = (t: Tok, pool: Row[]) => {
    let best: Row | null = null;
    for (const r of pool) if (r.anchor.page === t.page && (!best || Math.abs(r.anchor.y - t.y) < Math.abs(best.anchor.y - t.y))) best = r;
    return best;
  };
  for (const t of body) {
    if (used.has(t) || t.x < rightStart) continue;
    const r = nearest(t, rows);
    if (!r || Math.abs(r.anchor.y - t.y) > ROW_BAND) continue;
    const col = rightCols.reduce((a, c) => (Math.abs(right[c]! - t.x) < Math.abs(right[a]! - t.x) ? c : a), rightCols[0]);
    (r.right[col] ??= []).push(t);
  }
  const isService = (r: Row) => !!(r.right.unit?.length || r.right.qty?.length);
  const services = rows.filter(isService);
  const stages = rows.filter((r) => !isService(r));
  const descToks = body.filter((t) => !used.has(t) && t.x >= itemLimit && t.x < Math.min(descEnd, rightStart) && !rows.some((r) => r.anchor === t));
  // Alinhamento da numeração: no meio da descrição ou no alto. Sinal: num item
  // logo depois de uma etapa, há texto de descrição entre a etapa e a numeração?
  let centered = 0, top = 0;
  rows.forEach((r, k) => {
    const prev = rows[k - 1];
    if (!isService(r) || !prev || isService(prev) || prev.anchor.page !== r.anchor.page) return;
    const between = descToks.some((t) => t.page === r.anchor.page && t.y > r.anchor.y + 3 && t.y < prev.anchor.y - 7);
    if (between) centered++; else top++;
  });
  const topAligned = top > centered;
  for (const t of descToks) {
    const st = nearest(t, stages);
    if (st && Math.abs(st.anchor.y - t.y) <= 7) { st.desc.push(t); continue; }
    let target: Row | null;
    if (topAligned) {
      // a descrição começa na altura da numeração e desce até o próximo item
      const above = services.filter((r) => r.anchor.page === t.page && r.anchor.y >= t.y - 3).sort((a, b) => a.anchor.y - b.anchor.y)[0];
      const prevPage = services.filter((r) => r.anchor.page < t.page).at(-1) ?? null;
      target = above ?? prevPage;
    } else target = nearest(t, services);
    target?.desc.push(t);
  }

  const val = (r: Row, c: RightCol) => (r.right[c] ? join([...r.right[c]!].sort((a, b) => a.x - b.x)) : null);
  const out: ParsedProposalLine[] = rows.map((r) => {
    const service = isService(r);
    const description = join(r.desc.sort((a, b) => b.y - a.y || a.x - b.x));
    return {
      item: r.item, kind: service ? "SERVICE" : "STAGE", description,
      unit: service ? val(r, "unit") : null,
      quantity: service ? parseMoney(val(r, "qty")) : null,
      unitPrice: service ? parseMoney(val(r, "pu")) : null,
      totalPrice: parseMoney(val(r, "total")),
    };
  });
  if (!out.some((l) => l.kind === "SERVICE")) warnings.push("Nenhum item com unidade e quantidade foi achado.");
  return { ...header, lines: out, declaredTotal, warnings };
}
