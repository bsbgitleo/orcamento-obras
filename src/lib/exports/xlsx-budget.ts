// src/lib/exports/xlsx-budget.ts
// Excel exports (decisões #59–#61). Values are the ones computed by the app
// (centavo a centavo); stage and grand totals are SUM formulas over the rows
// shown, with the computed result cached so the file opens with the numbers.
import ExcelJS from "exceljs";
import { INPUT_KIND_LABEL, REGIME_LABEL, WORK_TYPE_LABEL, dateBR, refMonth } from "@/lib/format";
import type { BudgetExport, ExportLine } from "./budget-export";

const MONEY = '#,##0.00';
const QTY = '#,##0.00##';
const COEF = '0.0000000';
const PCT = '0.00" %"';
const BOLD = { bold: true } as const;
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F5C8A" } };
const STAGE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F6" } };
const INPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4C2" } };
const THIN: Partial<ExcelJS.Borders> = { top: { style: "thin", color: { argb: "FFC9CED5" } }, bottom: { style: "thin", color: { argb: "FFC9CED5" } }, left: { style: "thin", color: { argb: "FFC9CED5" } }, right: { style: "thin", color: { argb: "FFC9CED5" } } };

const num = (s: string | null | undefined): number | null => (s === null || s === undefined || s === "" ? null : Number(s));

function baseLabel(d: BudgetExport) {
  const b = d.budget.base;
  return `${b.origin} ${b.uf} ${refMonth(b.referenceMonth)} — ${REGIME_LABEL[b.regime] ?? b.regime}`;
}

function headerBlock(ws: ExcelJS.Worksheet, d: BudgetExport, title: string, lastCol: number): number {
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  const rows: [string, string][] = [
    ["Empresa", [d.company.name, d.company.document ? `CNPJ ${d.company.document}` : null].filter(Boolean).join(" · ")],
    ["Obra", `${d.project.code} · ${d.project.name}${d.project.address ? ` — ${d.project.address}` : ""} (${d.project.uf})`],
    ["Cliente", d.client ? `${d.client.name}${d.client.document ? ` · ${d.client.document}` : ""}` : "—"],
    ["Base de preços", baseLabel(d)],
    ["BDI", `${d.budget.bdi.name} — ${Number(d.budget.bdi.percent).toFixed(2).replace(".", ",")} %${d.budget.supplyBdi ? ` · fornecimento ${Number(d.budget.supplyBdi.percent).toFixed(2).replace(".", ",")} %` : ""}`],
    ["Encargos sociais", `${d.budget.socialCharges.name} (horista ${Number(d.budget.socialCharges.hourlyPct).toFixed(2).replace(".", ",")} %, mensalista ${Number(d.budget.socialCharges.monthlyPct).toFixed(2).replace(".", ",")} %)`],
    ["Revisão / emissão", `R${d.budget.revision} · ${dateBR(new Date())}`],
  ];
  rows.forEach(([k, v], i) => {
    const r = i + 2;
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = BOLD;
    ws.mergeCells(r, 2, r, lastCol);
    ws.getCell(r, 2).value = v;
  });
  return rows.length + 3; // linha em branco antes da tabela
}

function tableHeader(ws: ExcelJS.Worksheet, row: number, labels: string[]) {
  labels.forEach((l, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = l;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEAD_FILL;
    c.alignment = { vertical: "middle", wrapText: true };
    c.border = THIN;
  });
  ws.getRow(row).height = 30;
}

/** Writes the WBS; returns the row of each line and of the grand total. */
function writeWbs(ws: ExcelJS.Worksheet, startRow: number, lines: ExportLine[], cols: { total: number; costTotal?: number; includeAll?: boolean }, writeRow: (row: ExcelJS.Row, l: ExportLine) => void) {
  const rowOf = new Map<string, number>();
  let r = startRow;
  for (const l of lines) {
    rowOf.set(l.id, r);
    const row = ws.getRow(r);
    writeRow(row, l);
    row.eachCell({ includeEmpty: false }, (c) => { c.border = THIN; });
    if (l.kind === "STAGE") row.eachCell({ includeEmpty: true }, (c) => { c.fill = STAGE_FILL; c.font = BOLD; });
    r++;
  }
  // Etapas: SOMA das linhas filhas (resultado já calculado pelo app)
  const children = (id: string | null) => lines.filter((l) => l.parentId === id);
  const sumOf = (ids: string[], col: number, results: (string | null)[]) => {
    const letter = ws.getColumn(col).letter;
    return { formula: ids.length ? `SUM(${ids.map((id) => `${letter}${rowOf.get(id)}`).join(",")})` : "0", result: results.reduce((a, v) => a + (num(v) ?? 0), 0) };
  };
  for (const l of lines.filter((x) => x.kind === "STAGE")) {
    const kids = children(l.id);
    const row = ws.getRow(rowOf.get(l.id)!);
    const priced = cols.includeAll ? kids : kids.filter((k) => k.totalPrice !== null);
    row.getCell(cols.total).value = { ...sumOf(priced.map((k) => k.id), cols.total, priced.map((k) => k.totalPrice)), result: num(l.totalPrice) ?? 0 };
    if (cols.costTotal) {
      const costed = kids.filter((k) => k.totalCost !== null);
      row.getCell(cols.costTotal).value = { ...sumOf(costed.map((k) => k.id), cols.costTotal, costed.map((k) => k.totalCost)), result: num(l.totalCost) ?? 0 };
    }
  }
  const roots = children(null);
  return { rowOf, endRow: r, roots, sumOf };
}

function sintetica(wb: ExcelJS.Workbook, d: BudgetExport) {
  const ws = wb.addWorksheet("Sintética", { views: [{ state: "frozen", ySplit: 10 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.columns = [{ width: 9 }, { width: 11 }, { width: 9 }, { width: 60 }, { width: 7 }, { width: 12 }, { width: 13 }, { width: 15 }, { width: 13 }, { width: 16 }, { width: 8 }];
  const start = headerBlock(ws, d, "PLANILHA ORÇAMENTÁRIA SINTÉTICA", 11);
  tableHeader(ws, start, ["Item", "Código", "Fonte", "Descrição", "Und", "Quant.", "Custo unit.", "Custo total", "Preço unit. (c/ BDI)", "Preço total", "Peso"]);
  ws.pageSetup.printTitlesRow = `${start}:${start}`;
  const sale = num(d.budget.salePrice) ?? 0;
  const { endRow, roots, sumOf } = writeWbs(ws, start + 1, d.lines, { total: 10, costTotal: 8 }, (row, l) => {
    row.getCell(1).value = l.item;
    row.getCell(4).value = l.description + (l.isSupplyItem ? " (mero fornecimento)" : "") + (l.kind === "SERVICE" && l.unitCost === null ? " — SEM CUSTO" : "");
    row.getCell(4).alignment = { wrapText: true, indent: Math.min(l.level - 1, 4) };
    if (l.kind === "SERVICE") {
      row.getCell(2).value = l.compositionCode;
      row.getCell(3).value = l.source;
      row.getCell(5).value = l.unit;
      row.getCell(6).value = num(l.quantity); row.getCell(6).numFmt = QTY;
      row.getCell(7).value = num(l.unitCost); row.getCell(7).numFmt = MONEY;
      row.getCell(8).value = num(l.totalCost);
      row.getCell(9).value = num(l.unitPrice); row.getCell(9).numFmt = MONEY;
      row.getCell(10).value = num(l.totalPrice);
    }
    row.getCell(8).numFmt = MONEY;
    row.getCell(10).numFmt = MONEY;
    const tp = num(l.totalPrice);
    row.getCell(11).value = sale && tp !== null ? tp / sale : null;
    row.getCell(11).numFmt = "0.00%";
  });
  const t = endRow + 1;
  const total = ws.getRow(t);
  total.getCell(4).value = "TOTAL GERAL";
  const pricedRoots = roots.filter((r) => r.totalPrice !== null);
  total.getCell(8).value = { ...sumOf(pricedRoots.map((r) => r.id), 8, pricedRoots.map((r) => r.totalCost)), result: num(d.budget.directCost) ?? 0 };
  total.getCell(10).value = { ...sumOf(pricedRoots.map((r) => r.id), 10, pricedRoots.map((r) => r.totalPrice)), result: sale };
  [4, 8, 10].forEach((c) => { total.getCell(c).font = BOLD; total.getCell(c).numFmt = MONEY; });
  const summary: [string, number][] = [
    ["Custo direto", num(d.budget.directCost) ?? 0],
    [`BDI (${Number(d.budget.bdi.percent).toFixed(2).replace(".", ",")} %)`, sale - (num(d.budget.directCost) ?? 0)],
    ["Preço de venda", sale],
  ];
  summary.forEach(([k, v], i) => {
    ws.getCell(t + 2 + i, 9).value = k; ws.getCell(t + 2 + i, 9).font = BOLD;
    ws.getCell(t + 2 + i, 10).value = Math.round(v * 100) / 100; ws.getCell(t + 2 + i, 10).numFmt = MONEY;
  });
  const sign = t + 7;
  ws.getCell(sign, 4).value = "______________________________________________";
  ws.getCell(sign + 1, 4).value = [d.company.technicalLead, d.company.technicalRegistry].filter(Boolean).join(" — ") || "Responsável técnico (nome / registro)";
  ws.getCell(sign + 3, 1).value = d.budget.base.origin === "SICRO"
    ? "Composições pelo método do DNIT (SICRO): itens com 4 casas e custo final arredondado; custo do serviço = TRUNC(quantidade × custo unitário, 2); preço unitário = TRUNC(custo × (1 + BDI), 2)."
    : "Regra do SINAPI: custo do item = TRUNC(coeficiente × preço, 2); custo do serviço = TRUNC(quantidade × custo unitário, 2); preço unitário = TRUNC(custo × (1 + BDI), 2).";
  ws.getCell(sign + 3, 1).font = { italic: true, size: 9 };
}

function analitica(wb: ExcelJS.Workbook, d: BudgetExport) {
  const ws = wb.addWorksheet("Analítica", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.columns = [{ width: 18 }, { width: 6 }, { width: 12 }, { width: 62 }, { width: 7 }, { width: 13 }, { width: 14 }, { width: 14 }];
  let r = headerBlock(ws, d, "COMPOSIÇÕES DE CUSTO UNITÁRIO (ANALÍTICA)", 8);
  for (const c of d.analytic) {
    ws.mergeCells(r, 1, r, 8);
    const h = ws.getCell(r, 1);
    h.value = `${c.source} ${c.code} — ${c.description} (${c.unit}) · itens ${c.usedBy.join(", ")}`;
    h.font = BOLD; h.fill = STAGE_FILL; h.alignment = { wrapText: true };
    ws.getRow(r).height = 30;
    r++;
    if (c.method === "SICRO") {
      ws.getCell(r, 1).value = `Produção da equipe: ${c.production ?? "—"} ${c.unit}/h · FIC: ${c.fic ?? "—"}`;
      ws.getCell(r, 1).font = { italic: true, size: 9 };
      r++;
    }
    tableHeader(ws, r, ["Tipo", "Grupo", "Código", "Descrição", "Und", "Coeficiente", "Preço unit.", "Custo"]);
    r++;
    for (const it of c.items) {
      const row = ws.getRow(r);
      row.values = [it.kind, it.group ?? "", it.code, it.description, it.unit, num(it.coefficient), it.unitPrice ? Number(it.unitPrice.toString()) : null, it.cost ? Number(it.cost.toString()) : null];
      row.getCell(6).numFmt = it.kind === "Acréscimo" ? PCT : COEF;
      row.getCell(7).numFmt = c.method === "SICRO" ? "#,##0.0000" : MONEY;
      row.getCell(8).numFmt = c.method === "SICRO" ? "#,##0.0000" : MONEY;
      row.getCell(4).alignment = { wrapText: true };
      row.eachCell((cell) => { cell.border = THIN; });
      r++;
    }
    if (c.method === "SICRO" && c.cost.sicro) {
      const k = c.cost.sicro;
      const summary: [string, typeof k.execution][] = [
        ["Custo horário total de equipamentos", k.equipmentHour], ["Custo horário total de mão de obra", k.laborHour],
        ["Custo horário total de execução", k.executionHour], [`Custo unitário de execução (÷ produção ${c.production ?? "1"})`, k.execution],
        [`Custo do FIC (${c.fic ?? "0"})`, k.fic], ["Custo unitário total de material", k.material],
        ["Custo total de atividades auxiliares", k.auxiliary], ["Subtotal", k.subtotal], ["Custo unitário total de tempo fixo", k.fixedTime],
      ];
      for (const [label, v] of summary) {
        ws.getCell(r, 4).value = label; ws.getCell(r, 4).alignment = { horizontal: "right" };
        ws.getCell(r, 8).value = Number(v.toString()); ws.getCell(r, 8).numFmt = "#,##0.0000";
        ws.getRow(r).font = { size: 9, color: { argb: "FF3B434C" } };
        r++;
      }
    }
    ws.getCell(r, 7).value = c.cost.incomplete ? "SEM CUSTO" : "Custo unitário";
    ws.getCell(r, 7).font = BOLD;
    ws.getCell(r, 8).value = c.cost.incomplete ? null : Number(c.cost.unitCost.toString());
    ws.getCell(r, 8).numFmt = MONEY; ws.getCell(r, 8).font = BOLD;
    if (c.cost.transportPending) { ws.getCell(r, 4).value = "Momento de transporte sem DMT: custo igual ao publicado, sem transporte."; ws.getCell(r, 4).font = { italic: true, color: { argb: "FF7A5300" } }; }
    r += 2;
  }
}

function bdiSheet(wb: ExcelJS.Workbook, d: BudgetExport) {
  const ws = wb.addWorksheet("BDI e encargos");
  ws.columns = [{ width: 46 }, { width: 14 }];
  let r = headerBlock(ws, d, "DEMONSTRATIVO DO BDI E ENCARGOS SOCIAIS", 2);
  const b = d.budget.bdi;
  tableHeader(ws, r, ["Componente (Acórdão TCU 2622/2013)", "%"]);
  r++;
  const rows: [string, string][] = [
    ["Administração central (AC)", b.centralAdministration], ["Seguro (S)", b.insurance], ["Risco (R)", b.risk], ["Garantia (G)", b.guarantee],
    ["Despesas financeiras (DF)", b.financialExpenses], ["Lucro (L)", b.profit], ["PIS", b.pis], ["COFINS", b.cofins], ["ISS", b.iss], ["CPRB", b.cprb],
  ];
  for (const [k, v] of rows) { ws.getRow(r).values = [k, Number(v)]; ws.getCell(r, 2).numFmt = PCT; r++; }
  ws.getRow(r).values = ["BDI = [(1+AC+S+R+G)(1+DF)(1+L) / (1−I)] − 1", Number(b.percent)];
  ws.getCell(r, 1).font = BOLD; ws.getCell(r, 2).font = BOLD; ws.getCell(r, 2).numFmt = PCT; r++;
  ws.getRow(r).values = ["Tipo de obra (faixas do TCU)", WORK_TYPE_LABEL[b.workType] ?? b.workType]; r += 2;
  if (d.budget.supplyBdi) { ws.getRow(r).values = [`BDI de mero fornecimento — ${d.budget.supplyBdi.name}`, Number(d.budget.supplyBdi.percent)]; ws.getCell(r, 2).numFmt = PCT; r += 2; }
  tableHeader(ws, r, ["Encargos sociais", "%"]); r++;
  ws.getRow(r).values = [`Horista — ${d.budget.socialCharges.name}`, Number(d.budget.socialCharges.hourlyPct)]; ws.getCell(r, 2).numFmt = PCT; r++;
  ws.getRow(r).values = ["Mensalista", Number(d.budget.socialCharges.monthlyPct)]; ws.getCell(r, 2).numFmt = PCT;
}

function cronograma(wb: ExcelJS.Workbook, d: BudgetExport) {
  const s = d.schedule;
  const ws = wb.addWorksheet("Cronograma", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const months = s?.months ?? d.budget.scheduleMonths;
  ws.columns = [{ width: 9 }, { width: 44 }, { width: 15 }, ...Array.from({ length: months }, () => ({ width: 13 })), { width: 10 }];
  let r = headerBlock(ws, d, "CRONOGRAMA FÍSICO-FINANCEIRO", 3 + months + 1);
  if (!s) { ws.getCell(r, 1).value = "Sem etapas."; return; }
  tableHeader(ws, r, ["Item", "Etapa", "Valor", ...Array.from({ length: months }, (_, i) => `Mês ${i + 1}`), "% total"]);
  r++;
  for (const row of s.rows) {
    const vals = ws.getRow(r);
    vals.values = [row.stage.code, row.stage.description, Number(row.price.toString()), ...row.values.map((v) => Number(v.toString())), Number(row.totalPct.toString()) / 100];
    vals.getCell(2).alignment = { indent: Math.min(row.level - 1, 4) };
    for (let c = 3; c <= 3 + months; c++) vals.getCell(c).numFmt = MONEY;
    vals.getCell(4 + months).numFmt = "0.00%";
    if (!row.editable) vals.eachCell((c) => { c.font = BOLD; c.fill = STAGE_FILL; });
    const pct = ws.getRow(r + 1);
    pct.values = ["", "  % no mês", null, ...row.percents.map((p) => Number(p.toString()) / 100)];
    for (let c = 4; c <= 3 + months; c++) pct.getCell(c).numFmt = "0.00%";
    pct.font = { italic: true, size: 9, color: { argb: "FF616A75" } };
    r += 2;
  }
  const foot: [string, number[], string][] = [
    ["Total no mês", s.monthTotals.map((v) => Number(v.toString())), MONEY],
    ["% no mês", s.monthPct.map((v) => Number(v.toString()) / 100), "0.00%"],
    ["Acumulado", s.cumulative.map((v) => Number(v.toString())), MONEY],
    ["% acumulado", s.cumulativePct.map((v) => Number(v.toString()) / 100), "0.00%"],
  ];
  for (const [label, vals, fmt] of foot) {
    const row = ws.getRow(r);
    row.values = ["", label, label === "Total no mês" ? Number(s.total.toString()) : null, ...vals];
    row.font = BOLD;
    for (let c = 3; c <= 3 + months; c++) row.getCell(c).numFmt = fmt === MONEY || c > 3 ? fmt : MONEY;
    row.getCell(3).numFmt = MONEY;
    r++;
  }
  if (s.incompleteRows) ws.getCell(r + 1, 2).value = `${s.incompleteRows} etapa(s) com percentuais que não somam 100 %.`;
}

function abcSheets(wb: ExcelJS.Workbook, d: BudgetExport) {
  const a = d.abc;
  const ws = wb.addWorksheet("ABC serviços");
  ws.columns = [{ width: 5 }, { width: 11 }, { width: 60 }, { width: 7 }, { width: 12 }, { width: 13 }, { width: 15 }, { width: 9 }, { width: 9 }, { width: 7 }];
  let r = headerBlock(ws, d, "CURVA ABC DE SERVIÇOS", 10);
  tableHeader(ws, r, ["#", "Código", "Descrição", "Und", "Quant.", "Custo unit.", "Custo total", "%", "% acum.", "Classe"]); r++;
  a.services.forEach((row, i) => {
    ws.getRow(r).values = [i + 1, row.item.code, row.item.description, row.item.unit, Number(row.item.quantity.toString()), row.item.unitCost ? Number(row.item.unitCost.toString()) : null, Number(row.total.toString()), Number(row.sharePct.toString()) / 100, Number(row.cumulativePct.toString()) / 100, row.abcClass];
    [6, 7].forEach((c) => { ws.getCell(r, c).numFmt = MONEY; });
    ws.getCell(r, 5).numFmt = QTY; ws.getCell(r, 8).numFmt = "0.00%"; ws.getCell(r, 9).numFmt = "0.00%";
    r++;
  });
  const wi = wb.addWorksheet("ABC insumos");
  wi.columns = [{ width: 5 }, { width: 11 }, { width: 60 }, { width: 13 }, { width: 7 }, { width: 13 }, { width: 13 }, { width: 15 }, { width: 9 }, { width: 9 }, { width: 7 }];
  r = headerBlock(wi, d, "CURVA ABC DE INSUMOS", 11);
  tableHeader(wi, r, ["#", "Código", "Descrição", "Tipo", "Und", "Quant.", "Preço unit.", "Total", "%", "% acum.", "Classe"]); r++;
  a.inputs.forEach((row, i) => {
    wi.getRow(r).values = [i + 1, row.item.code, row.item.description, INPUT_KIND_LABEL[row.item.kind] ?? row.item.kind, row.item.unit, Number(row.item.quantity.toFixed(4)), row.item.unitPrice ? Number(row.item.unitPrice.toString()) : null, Number(row.total.toString()), Number(row.sharePct.toString()) / 100, Number(row.cumulativePct.toString()) / 100, row.abcClass];
    wi.getCell(r, 6).numFmt = QTY; [7, 8].forEach((c) => { wi.getCell(r, c).numFmt = MONEY; });
    wi.getCell(r, 9).numFmt = "0.00%"; wi.getCell(r, 10).numFmt = "0.00%";
    r++;
  });
}

/** Excel completo: sintética, analítica, BDI e encargos, cronograma e curvas ABC. */
export async function buildBudgetWorkbook(d: BudgetExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = d.company.name;
  wb.created = new Date();
  sintetica(wb, d);
  analitica(wb, d);
  bdiSheet(wb, d);
  cronograma(wb, d);
  abcSheets(wb, d);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Planilha para proponentes (homogeneização), no modelo arquivado em
 * orcamento-obras-dados/referencias: sem preços; a proponente preenche os
 * campos em amarelo; total do item = ARRED(quant × preço; 2).
 */
export async function buildBidderWorkbook(d: BudgetExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = d.company.name;
  const ws = wb.addWorksheet("Proposta da Proponente", { views: [{ state: "frozen", ySplit: 8 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ws.columns = [{ width: 8 }, { width: 42 }, { width: 55 }, { width: 38 }, { width: 7 }, { width: 11 }, { width: 24 }, { width: 15 }, { width: 16 }];
  ws.mergeCells("A1:I1"); ws.getCell("A1").value = "PLANILHA PADRÃO PARA APRESENTAÇÃO DE PROPOSTA (HOMOGENEIZAÇÃO)"; ws.getCell("A1").font = { bold: true, size: 13 };
  ws.mergeCells("A2:I2"); ws.getCell("A2").value = `${d.project.name}${d.client ? ` — ${d.client.name}` : ""}${d.project.address ? ` — ${d.project.address}` : ""} (${d.project.uf})`;
  const fill = (ref: string) => { const c = ws.getCell(ref); c.fill = INPUT_FILL; c.protection = { locked: false }; c.border = THIN; };
  ws.getCell("A4").value = "Empresa:"; ws.mergeCells("B4:D4"); fill("B4");
  ws.getCell("E4").value = "CNPJ:"; ws.mergeCells("F4:G4"); fill("F4");
  ws.getCell("H4").value = "Validade:"; fill("I4");
  ws.getCell("A5").value = "RT / CREA:"; ws.mergeCells("B5:D5"); fill("B5");
  ws.getCell("E5").value = "Prazo:"; ws.mergeCells("F5:G5"); fill("F5");
  ws.getCell("H5").value = "Acesso:"; fill("I5");
  ["A4", "E4", "H4", "A5", "E5", "H5"].forEach((r) => { ws.getCell(r).font = BOLD; });
  ws.mergeCells("A6:I6");
  ws.getCell("A6").value = "ATENÇÃO: a especificação (coluna C) e o critério de medição e aceitação (coluna D) de cada item integram a proposta. O preço unitário deve incluir todos os materiais, etapas, controles e o acesso descritos. Nos itens marcados, informar marca e produto ofertados (coluna G) — produtos fora da especificação serão recusados.";
  ws.getCell("A6").font = { bold: true, color: { argb: "FFB4232C" } }; ws.getCell("A6").alignment = { wrapText: true }; ws.getRow(6).height = 42;
  tableHeader(ws, 8, ["Item", "Descrição do serviço", "Especificação técnica, materiais e procedimento", "Critério de medição e aceitação", "Und", "Quant.", "Marca / produto ofertado", "Preço unit. (c/ BDI)", "Preço total"]);
  ws.pageSetup.printTitlesRow = "8:8";

  const { endRow, roots, sumOf } = writeWbs(ws, 9, d.lines, { total: 9, includeAll: true }, (row, l) => {
    row.getCell(1).value = l.item;
    row.getCell(2).value = l.description;
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    if (l.kind === "SERVICE") {
      row.getCell(3).value = l.specification ?? "";
      row.getCell(4).value = l.measurementCriteria ?? "";
      row.getCell(3).alignment = row.getCell(4).alignment = { wrapText: true, vertical: "top" };
      row.getCell(5).value = l.unit;
      row.getCell(6).value = num(l.quantity); row.getCell(6).numFmt = QTY;
      row.getCell(7).value = l.requiresBrand ? null : "não se aplica";
      row.getCell(8).value = null; row.getCell(8).numFmt = MONEY;
      const n = row.number;
      row.getCell(9).value = { formula: `IF(OR(F${n}="",H${n}=""),0,ROUND(F${n}*H${n},2))`, result: 0 };
    }
    row.getCell(9).numFmt = MONEY;
  });
  // Campos da proponente: preço (e marca, quando exigida) — destravados e em amarelo
  for (const l of d.lines.filter((x) => x.kind === "SERVICE")) {
    const n = d.lines.indexOf(l) + 9;
    const price = ws.getCell(n, 8); price.fill = INPUT_FILL; price.protection = { locked: false };
    if (l.requiresBrand) { const b = ws.getCell(n, 7); b.fill = INPUT_FILL; b.protection = { locked: false }; }
  }
  // Etapas: resultado zero até a proponente preencher
  for (const l of d.lines.filter((x) => x.kind === "STAGE")) {
    const c = ws.getCell(d.lines.indexOf(l) + 9, 9);
    const v = c.value as { formula: string };
    c.value = { formula: v.formula, result: 0 };
  }
  const t = endRow + 1;
  ws.mergeCells(t, 1, t, 8);
  ws.getCell(t, 1).value = "VALOR GLOBAL DA PROPOSTA (com BDI)"; ws.getCell(t, 1).font = BOLD; ws.getCell(t, 1).alignment = { horizontal: "right" };
  ws.getCell(t, 9).value = { formula: sumOf(roots.map((r) => r.id), 9, []).formula, result: 0 }; ws.getCell(t, 9).numFmt = MONEY; ws.getCell(t, 9).font = BOLD;
  const notes = [
    "DECLARAÇÃO: a proponente declara que vistoriou o local (ou assume os riscos de não tê-lo feito), conferiu os quantitativos e que os preços incluem todos os custos diretos, indiretos, tributos, encargos e o BDI.",
    "Preencher apenas: dados da empresa (linhas 4 e 5), marca/produto ofertado nos itens indicados e preço unitário com BDI (células em amarelo). Não alterar descrições, especificações, critérios e quantidades.",
    "Os quantitativos são estimados e serão medidos pelo executado e aprovado pela fiscalização, conforme o critério de cada item.",
    "A proposta que omitir marca/produto nos itens marcados, ou ofertar produto de desempenho inferior ao especificado, será desclassificada.",
  ];
  notes.forEach((text, i) => { const r = t + 2 + i; ws.mergeCells(r, 1, r, 9); ws.getCell(r, 1).value = text; ws.getCell(r, 1).alignment = { wrapText: true }; ws.getRow(r).height = 30; });
  const s = t + 2 + notes.length + 1;
  ["Local e data: ____________________________", "Assinatura do representante legal: ____________________________", "Responsável técnico (nome / CREA): ____________________________"]
    .forEach((text, i) => { ws.getCell(s + i, 1).value = text; });
  // Protege a estrutura; a proponente edita só o que está em amarelo (sem senha)
  await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true });

  for (const [name, text] of [["Instruções", d.budget.bidderInstructions], ["Premissas", d.budget.bidderPremises]] as const) {
    if (!text?.trim()) continue;
    const w = wb.addWorksheet(name);
    w.getColumn(1).width = 120;
    w.getCell("A1").value = name === "Instruções" ? "INSTRUÇÕES ÀS PROPONENTES" : "PREMISSAS PARA AS PROPONENTES";
    w.getCell("A1").font = { bold: true, size: 13 };
    text.split(/\r?\n/).forEach((line, i) => { const c = w.getCell(i + 3, 1); c.value = line; c.alignment = { wrapText: true }; if (/^\s*\d+[.)]\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(line) && line === line.toUpperCase()) c.font = BOLD; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
