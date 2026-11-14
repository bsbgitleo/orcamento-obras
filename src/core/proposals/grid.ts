// src/core/proposals/grid.ts
// Leitura de proposta em planilha (.xlsx) — a planilha para proponentes gerada
// pelo app devolvida preenchida, ou outra com cabeçalho reconhecível (decisão #76).
// Reaproveita a leitura da importação de planilha orçamentária (#62–#64); o
// preço é o unitário com BDI (a coluna de custo, quando houver, é ignorada).
import { cellText, detectLayout, interpretRows, roleFromHeader, type Cell, type Layout } from "../sheet-import";
import { normText, parseHeaderText, parseMoney, type ParsedProposal } from "./types";

export function parseProposalGrid(rows: Cell[][]): ParsedProposal {
  const warnings: string[] = [];
  const layout = detectLayout(rows);
  const base: ParsedProposal = { company: null, document: null, technicalLead: null, validityDays: null, executionDays: null, lines: [], declaredTotal: null, warnings };
  if (!layout) { warnings.push("Não achei o cabeçalho da tabela (Descrição, Und, Quant., Preço…)."); return base; }
  const header = rows[layout.headerRow] ?? [];

  // Preço: a coluna com BDI / "preço unit."; não a de custo
  const roles: Layout["roles"] = [...layout.roles];
  const priceCols = header.map((c, i) => (roleFromHeader(cellText(c)) === "price" ? i : -1)).filter((i) => i >= 0);
  const withBdi = priceCols.find((i) => /bdi|preco/.test(normText(cellText(header[i]))) && !/custo/.test(normText(cellText(header[i]))));
  const priceCol = withBdi ?? priceCols[0];
  roles.forEach((r, i) => { if (r === "price") roles[i] = "ignore"; });
  if (priceCol !== undefined) roles[priceCol] = "price";
  else warnings.push("Coluna de preço unitário não achada.");
  const totalCol = header.findIndex((c) => /total/.test(normText(cellText(c))) && !/unit/.test(normText(cellText(c))));

  const lines = interpretRows(rows, { headerRow: layout.headerRow, roles }).filter((l) => l.row > 0);
  const headerText = rows.slice(0, layout.headerRow).map((r) => r.map((c) => cellText(c)).filter(Boolean).join(" ")).join(" ");

  // Total geral declarado: linha "TOTAL…" depois da tabela, na coluna do total
  let declaredTotal: string | null = null;
  if (totalCol >= 0) {
    for (let r = layout.headerRow + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const t = normText(row.map((c) => cellText(c)).join(" "));
      if (/^(total|valor global|preco global)|total geral/.test(t)) { const v = parseMoney(row[totalCol] ?? null); if (v) declaredTotal = v; }
    }
  }

  return {
    ...parseHeaderText(headerText),
    lines: lines.map((l) => ({
      item: l.item, kind: l.kind, description: l.description, unit: l.unit, quantity: l.quantity,
      unitPrice: l.kind === "SERVICE" ? l.price : null,
      totalPrice: totalCol >= 0 ? parseMoney(rows[l.row - 1]?.[totalCol] ?? null) : null,
    })),
    declaredTotal, warnings,
  };
}
