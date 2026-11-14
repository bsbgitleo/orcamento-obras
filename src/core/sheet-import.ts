// src/core/sheet-import.ts
// Importação de planilha orçamentária (.xlsx) — parte pura, usada no navegador
// (pré-visualização) e no servidor (gravação). Decisões #62–#64.
//
//   1. detectLayout: acha a linha de cabeçalho e sugere o papel de cada coluna
//      (item, código, fonte, descrição, unidade, quantidade, preço…), conhecendo
//      a exportação do próprio app e o modelo de homogeneização das proponentes;
//   2. interpretRows: transforma as linhas em etapas e serviços. A hierarquia vem
//      da numeração do item (1, 1.1, 1.1.1); sem numeração, serviços ficam na
//      última etapa vista.

export type Cell = string | number | null;

export type ColumnRole =
  | "item" | "code" | "source" | "description" | "unit" | "quantity" | "price"
  | "specification" | "criteria" | "brand" | "ignore";

export const ROLE_LABEL: Record<ColumnRole, string> = {
  item: "Item (numeração)", code: "Código da composição", source: "Fonte / banco", description: "Descrição",
  unit: "Unidade", quantity: "Quantidade", price: "Preço ou custo unitário",
  specification: "Especificação técnica", criteria: "Critério de medição", brand: "Marca / produto", ignore: "— ignorar —",
};

export type PriceMode = "COST" | "WITH_BDI" | "IGNORE";

export interface Layout {
  headerRow: number; // índice (0-based) da linha de cabeçalho
  roles: ColumnRole[]; // um papel por coluna
  /** Sugestão a partir do título da coluna de preço */
  priceMode: PriceMode;
  /** Pontuação do cabeçalho (quantos papéis reconhecidos) — escolhe a melhor aba */
  score: number;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function cellText(c: Cell): string {
  if (c === null || c === undefined) return "";
  return typeof c === "number" ? String(c) : c.trim();
}

/** "1.234,56" / "1234.56" / 1234.56 / "R$ 12,50" → "1234.56"; vazio ou texto → null */
export function parseNumber(c: Cell): string | null {
  if (c === null || c === undefined || c === "") return null;
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : null;
  let t = c.replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (!t) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
}

/** Papel de uma coluna pelo título (null = não reconhecido). */
export function roleFromHeader(text: string): ColumnRole | null {
  const t = norm(text);
  if (!t) return null;
  if (/^(item|it|n[ºo°.]?|numero)$/.test(t) || /^item\b/.test(t)) return "item";
  if (/especifica/.test(t)) return "specification";
  if (/criterio|medicao e aceita/.test(t)) return "criteria";
  if (/marca|produto ofertado/.test(t)) return "brand";
  if (/^(fonte|banco|base|origem)\b/.test(t)) return "source";
  if (/^(codigo|cod\.?|cod |composicao|ref\.?$|referencia$)/.test(t)) return "code";
  if (/descri|discrimina|^servico|^especificacao do servico/.test(t)) return "description";
  if (/^(und|unid|unidade|un\.?)$/.test(t)) return "unit";
  if (/^(quant|qtd|qtde|quantidade)/.test(t)) return "quantity";
  if (/total|peso|%|bdi \(|acum/.test(t) && !/unit/.test(t)) return "ignore";
  if (/(preco|valor|custo|p\.)\s*unit|unitario/.test(t)) return "price";
  return null;
}

/**
 * Procura, nas primeiras 40 linhas, a linha com mais papéis reconhecidos (exige
 * descrição e pelo menos mais dois). Com duas colunas de preço (custo e preço
 * com BDI, como na exportação do app), fica a de custo.
 */
export function detectLayout(rows: Cell[][]): Layout | null {
  let best: Layout | null = null;
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r] ?? [];
    const roles: ColumnRole[] = row.map((c) => roleFromHeader(cellText(c)) ?? "ignore");
    const found = new Set(roles.filter((x) => x !== "ignore"));
    if (!found.has("description") || found.size < 3) continue;
    // Preço: uma coluna só; prefere custo (sem BDI)
    const priceCols = roles.map((x, i) => (x === "price" ? i : -1)).filter((i) => i >= 0);
    let priceMode: PriceMode = "COST";
    if (priceCols.length) {
      const costCol = priceCols.find((i) => /custo/.test(norm(cellText(row[i]))) && !/bdi/.test(norm(cellText(row[i]))));
      const keep = costCol ?? priceCols[0];
      for (const i of priceCols) if (i !== keep) roles[i] = "ignore";
      priceMode = /c\/?\s*bdi|com bdi|preco/.test(norm(cellText(row[keep]))) && costCol === undefined ? "WITH_BDI" : "COST";
    }
    // Papéis repetidos: fica a primeira coluna
    const seen = new Set<ColumnRole>();
    roles.forEach((x, i) => { if (x !== "ignore") { if (seen.has(x)) roles[i] = "ignore"; seen.add(x); } });
    const score = found.size;
    if (!best || score > best.score) best = { headerRow: r, roles, priceMode, score };
  }
  return best;
}

export interface ImportLine {
  /** Posição da linha na planilha (1-based, para mostrar) */
  row: number;
  kind: "STAGE" | "SERVICE";
  /** Numeração original (1, 1.1…) */
  item: string | null;
  /** Índice da etapa-pai em `lines` (null = raiz) */
  parent: number | null;
  description: string;
  code: string | null;
  source: string | null;
  unit: string | null;
  quantity: string | null;
  price: string | null;
  specification: string | null;
  criteria: string | null;
  /** true quando a coluna de marca está vazia (a proponente deve informar) */
  requiresBrand: boolean;
}

const STOP = /^(total|valor global|preco global|custo direto|subtotal geral|bdi\b|preco de venda)/;
const ITEM_RE = /^\d+(\.\d+)*\.?$/;

/** Código da composição: "87879", "SINAPI 87879", "87879/SINAPI", "CP-0001", "0307731". */
export function normalizeCode(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const digits = /^(?:sinapi|sicro)?\s*[-:/]?\s*(\d{4,7})(?:\s*[-/]\s*(?:sinapi|sicro))?$/i.exec(t);
  if (digits) return digits[1];
  return /^[\w.\-/]{2,30}$/.test(t) ? t : null;
}

export function interpretRows(rows: Cell[][], layout: Pick<Layout, "headerRow" | "roles">): ImportLine[] {
  const col = (role: ColumnRole) => layout.roles.indexOf(role);
  const c = {
    item: col("item"), code: col("code"), source: col("source"), description: col("description"), unit: col("unit"),
    quantity: col("quantity"), price: col("price"), specification: col("specification"), criteria: col("criteria"), brand: col("brand"),
  };
  const get = (row: Cell[], i: number) => (i >= 0 ? cellText(row[i] ?? null) : "");
  const lines: ImportLine[] = [];
  const stageByItem = new Map<string, number>();
  let lastStage: number | null = null;
  let blanks = 0;

  for (let r = layout.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const description = get(row, c.description);
    const itemRaw = get(row, c.item).replace(/\.$/, "");
    const unit = get(row, c.unit);
    const quantity = c.quantity >= 0 ? parseNumber(row[c.quantity] ?? null) : null;
    const firstText = norm([itemRaw, description, ...row.map((x) => cellText(x))].find((x) => x) ?? "");
    if (!description && !itemRaw) {
      if (row.every((x) => !cellText(x))) { if (++blanks >= 5 && lines.length) break; continue; }
      if (STOP.test(firstText)) break;
      continue;
    }
    blanks = 0;
    const item = itemRaw && ITEM_RE.test(itemRaw) ? itemRaw : null;
    // "TOTAL…" / "VALOR GLOBAL…" na coluna do item ou da descrição encerra a planilha
    if (!item && STOP.test(firstText)) break;
    const isService = (quantity !== null && Number(quantity) > 0) || (!!unit && !!description && quantity !== null);
    // Pai: pela numeração (1.2.3 → 1.2); sem numeração, a última etapa
    let parent: number | null = lastStage;
    if (item) {
      const parts = item.split(".");
      parent = null;
      for (let k = parts.length - 1; k >= 1 && parent === null; k--) parent = stageByItem.get(parts.slice(0, k).join(".")) ?? null;
    }
    if (isService) {
      const brandText = norm(get(row, c.brand));
      lines.push({
        row: r + 1, kind: "SERVICE", item, parent, description,
        code: c.code >= 0 ? normalizeCode(get(row, c.code)) : null,
        source: get(row, c.source) || null, unit: unit || null, quantity,
        price: c.price >= 0 ? parseNumber(row[c.price] ?? null) : null,
        specification: get(row, c.specification) || null, criteria: get(row, c.criteria) || null,
        requiresBrand: c.brand >= 0 && brandText === "",
      });
    } else if (description) {
      if (STOP.test(norm(description))) break;
      lines.push({ row: r + 1, kind: "STAGE", item, parent: item ? parent : null, description, code: null, source: null, unit: null, quantity: null, price: null, specification: null, criteria: null, requiresBrand: false });
      const idx = lines.length - 1;
      if (item) stageByItem.set(item, idx);
      lastStage = idx;
    }
  }
  // Serviços soltos antes da primeira etapa: etapa "Serviços"
  if (lines.some((l) => l.kind === "SERVICE" && l.parent === null)) {
    lines.unshift({ row: 0, kind: "STAGE", item: null, parent: null, description: "Serviços", code: null, source: null, unit: null, quantity: null, price: null, specification: null, criteria: null, requiresBrand: false });
    for (const l of lines.slice(1)) {
      if (l.parent !== null) l.parent += 1;
      else if (l.kind === "SERVICE") l.parent = 0;
    }
  }
  return lines;
}

/** Fonte declarada → origem do código ("SINAPI", "SICRO", "PROPRIA" ou null = a da base do orçamento). */
export function sourceOrigin(source: string | null): "SINAPI" | "SICRO" | "PROPRIA" | null {
  const t = norm(source ?? "");
  if (!t) return null;
  if (t.includes("sinapi")) return "SINAPI";
  if (t.includes("sicro") || t.includes("dnit")) return "SICRO";
  if (/propri|cpu|cotac|mercado|composicao/.test(t)) return "PROPRIA";
  return null;
}
