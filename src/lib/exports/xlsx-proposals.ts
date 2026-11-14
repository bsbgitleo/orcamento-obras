// src/lib/exports/xlsx-proposals.ts
// Mapa comparativo das propostas em Excel: resumo com equalização, mapa por
// item e itens acrescentados (decisões #76–#79).
import ExcelJS from "exceljs";
import type Decimal from "decimal.js";
import { dateBR } from "@/lib/format";
import type { BudgetProposals } from "@/lib/proposals/load";

const MONEY = '#,##0.00';
const UNIT = '#,##0.00##';
const PCT = '+0.0%;-0.0%;0.0%';
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F5C8A" } };
const STAGE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F6" } };
const WARN_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4C2" } };
const n = (d: Decimal | null | undefined) => (d === null || d === undefined ? null : d.toNumber());
const FLAG_LABEL = { prazo: "prazo acima do exigido", validade: "validade abaixo da exigida", inexequivel: "abaixo de 75 % do orçado (possível inexequível)", soma: "total declarado ≠ soma dos itens" } as const;

function head(ws: ExcelJS.Worksheet, row: number, labels: (string | null)[]) {
  labels.forEach((l, i) => {
    if (l === null) return;
    const c = ws.getCell(row, i + 1);
    c.value = l; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = HEAD_FILL; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
}

export async function buildProposalMapWorkbook(d: BudgetProposals, meta: { company: string; projectCode: string; projectName: string; revision: number }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.company;
  const cmp = d.comparison;
  const title = (ws: ExcelJS.Worksheet, text: string, lastCol: number) => {
    ws.mergeCells(1, 1, 1, lastCol); ws.getCell(1, 1).value = text; ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.mergeCells(2, 1, 2, lastCol); ws.getCell(2, 1).value = `${meta.projectCode} · ${meta.projectName} — R${meta.revision} · emitido em ${dateBR(new Date())}`;
    ws.mergeCells(3, 1, 3, lastCol);
    ws.getCell(3, 1).value = "Equalização: quantidade do orçamento × preço unitário ofertado, ARRED(…; 2). Item sem preço: maior preço unitário das demais proponentes (ou o de referência). Itens acrescentados ficam fora do equalizado. Alertas: ±30 % da mediana ou da referência; total abaixo de 75 % do orçado.";
    ws.getCell(3, 1).font = { italic: true, size: 9 }; ws.getCell(3, 1).alignment = { wrapText: true }; ws.getRow(3).height = 28;
  };

  // Resumo
  const rs = wb.addWorksheet("Resumo");
  rs.columns = [{ width: 6 }, { width: 34 }, { width: 20 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 44 }];
  title(rs, "MAPA COMPARATIVO DAS PROPOSTAS — RESUMO", 14);
  head(rs, 5, ["Classif.", "Proponente", "CNPJ", "Prazo (d)", "Validade (d)", "Como cotado", "Total declarado", "Equalizado", "× referência", "Sem preço", "Qtd. alterada", "Fora ±30 %", "Acrescentados", "Alertas"]);
  let r = 6;
  for (const s of [...cmp.proposals].sort((a, b) => a.rank - b.rank)) {
    const p = d.proposals.find((x) => x.id === s.id)!;
    rs.getRow(r).values = [
      `${s.rank}º`, s.name, p.document ?? "", s.executionDays, s.validityDays, n(s.quotedTotal), n(s.declaredTotal), n(s.equalizedTotal), n(s.vsReference),
      s.counts.missing, s.counts.quantity, s.counts.outliers, n(s.extrasTotal), s.flags.map((f) => FLAG_LABEL[f]).join("; "),
    ];
    [6, 7, 8, 13].forEach((c) => { rs.getCell(r, c).numFmt = MONEY; });
    rs.getCell(r, 9).numFmt = PCT; rs.getCell(r, 8).font = { bold: true };
    if (s.flags.includes("prazo")) rs.getCell(r, 4).font = { bold: true, color: { argb: "FFB42318" } };
    if (s.flags.includes("validade")) rs.getCell(r, 5).font = { bold: true, color: { argb: "FFB42318" } };
    r++;
  }
  rs.getCell(r + 1, 2).value = "Valor de referência (orçamento)"; rs.getCell(r + 1, 2).font = { bold: true };
  rs.getCell(r + 1, 8).value = cmp.referenceTotal.gt(0) ? n(cmp.referenceTotal) : "sem preços de referência"; rs.getCell(r + 1, 8).numFmt = MONEY; rs.getCell(r + 1, 8).font = { bold: true };
  if (d.rules.maxExecutionDays || d.rules.minValidityDays) {
    rs.getCell(r + 2, 2).value = `Exigências: prazo máximo ${d.rules.maxExecutionDays ?? "—"} dias; validade mínima ${d.rules.minValidityDays ?? "—"} dias`;
  }

  // Mapa
  const P = cmp.proposals.length;
  const ws = wb.addWorksheet("Mapa", { views: [{ state: "frozen", xSplit: 4, ySplit: 6 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.columns = [{ width: 8 }, { width: 46 }, { width: 7 }, { width: 11 }, { width: 13 }, { width: 15 }, ...cmp.proposals.flatMap(() => [{ width: 13 }, { width: 15 }])];
  title(ws, "MAPA COMPARATIVO DAS PROPOSTAS", 6 + 2 * P);
  head(ws, 5, ["Item", "Descrição", "Und", "Quant.", "Referência", null, ...cmp.proposals.flatMap((s) => [s.name, null])]);
  ws.mergeCells(5, 5, 5, 6);
  cmp.proposals.forEach((_, k) => ws.mergeCells(5, 7 + 2 * k, 5, 8 + 2 * k));
  head(ws, 6, [null, null, null, null, "Unit.", "Total", ...cmp.proposals.flatMap(() => ["Unit.", "Total eq."])]);
  for (const c of [1, 2, 3, 4]) ws.mergeCells(5, c, 6, c);
  r = 7;
  const first = r;
  for (const e of d.layout) {
    if (e.kind === "STAGE") {
      ws.getCell(r, 1).value = e.item; ws.getCell(r, 2).value = e.description;
      for (let c = 1; c <= 6 + 2 * P; c++) { ws.getCell(r, c).fill = STAGE_FILL; ws.getCell(r, c).font = { bold: true }; }
      r++; continue;
    }
    const row = cmp.rows[e.index];
    ws.getRow(r).values = [row.ref.item, row.ref.description, row.ref.unit ?? "", row.ref.quantity ? Number(row.ref.quantity) : null, row.ref.unitPrice ? Number(row.ref.unitPrice) : null, row.ref.unitPrice ? n(row.referenceTotal) : null];
    ws.getCell(r, 4).numFmt = UNIT; ws.getCell(r, 5).numFmt = UNIT; ws.getCell(r, 6).numFmt = MONEY;
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    row.cells.forEach((c, k) => {
      const cu = ws.getCell(r, 7 + 2 * k), ct = ws.getCell(r, 8 + 2 * k);
      const missing = c.flags.includes("sem-preco");
      cu.value = n(missing ? c.equalizedUnit : c.unitPrice); cu.numFmt = UNIT;
      ct.value = n(c.equalizedTotal); ct.numFmt = MONEY;
      const notes: string[] = [];
      if (missing) { cu.fill = WARN_FILL; ct.fill = WARN_FILL; notes.push(c.flags.includes("preenchido") ? "Sem preço: equalizado com o maior preço das demais (ou a referência)." : "Sem preço."); }
      if (c.flags.includes("acima")) cu.font = { color: { argb: "FFB42318" } };
      if (c.flags.includes("abaixo")) cu.font = { color: { argb: "FF175CD3" } };
      if (row.lowest === k && P > 1) cu.font = { ...(cu.font ?? {}), bold: true };
      if (c.vsMedian) notes.push(`${(c.vsMedian.toNumber() * 100).toFixed(1).replace(".", ",")} % da mediana`);
      if (c.vsReference) notes.push(`${(c.vsReference.toNumber() * 100).toFixed(1).replace(".", ",")} % da referência`);
      if (c.flags.includes("quantidade")) notes.push(`Quantidade da proponente: ${c.quantity?.toString().replace(".", ",")}`);
      if (notes.length && (missing || c.flags.some((f) => f !== "preenchido"))) cu.note = notes.join("\n");
    });
    r++;
  }
  const last = r - 1;
  ws.getCell(r, 2).value = "TOTAL EQUALIZADO"; ws.getCell(r, 2).font = { bold: true };
  const sumCol = (c: number, result: number) => {
    const L = ws.getColumn(c).letter;
    ws.getCell(r, c).value = { formula: `SUM(${L}${first}:${L}${last})`, result };
    ws.getCell(r, c).numFmt = MONEY; ws.getCell(r, c).font = { bold: true };
  };
  sumCol(6, n(cmp.referenceTotal)!);
  cmp.proposals.forEach((s, k) => { sumCol(8 + 2 * k, n(s.equalizedTotal)!); ws.getCell(r, 7 + 2 * k).value = `${s.rank}º`; });

  // Acrescentados
  const xs = wb.addWorksheet("Acrescentados");
  xs.columns = [{ width: 30 }, { width: 8 }, { width: 60 }, { width: 8 }, { width: 11 }, { width: 13 }, { width: 15 }];
  title(xs, "ITENS ACRESCENTADOS PELAS PROPONENTES (fora do equalizado)", 7);
  head(xs, 5, ["Proponente", "Item", "Descrição", "Und", "Quant.", "Preço unit.", "Total"]);
  r = 6;
  for (const s of cmp.proposals) for (const x of s.extras) {
    xs.getRow(r).values = [s.name, x.item ?? "", x.description, x.unit ?? "", x.quantity ? Number(x.quantity) : null, x.unitPrice ? Number(x.unitPrice) : null, n(x.total)];
    xs.getCell(r, 3).alignment = { wrapText: true, vertical: "top" };
    xs.getCell(r, 5).numFmt = UNIT; xs.getCell(r, 6).numFmt = UNIT; xs.getCell(r, 7).numFmt = MONEY;
    r++;
  }
  if (r === 6) xs.getCell(6, 1).value = "Nenhum item acrescentado.";

  return Buffer.from(await wb.xlsx.writeBuffer());
}
