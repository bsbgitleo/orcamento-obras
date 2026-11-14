// src/lib/imports/sheet-grid.ts
// Reads an uploaded .xlsx into plain grids (one per sheet) for the budget
// sheet import (decisão #62). Small files only (whole workbook in memory).
import "server-only";
import ExcelJS from "exceljs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readSheetNames, readSheetRows } from "@/import/sinapi/workbook";
import { detectLayout, type Cell } from "@/core/sheet-import";

export const MAX_ROWS = 3000;
export const MAX_COLS = 30;

export interface SheetGrid { name: string; rows: Cell[][]; score: number }

function toCell(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "VERDADEIRO" : "FALSO";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return toCell((v.result ?? null) as ExcelJS.CellValue);
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("error" in v) return null;
  }
  return String(v);
}

function trimGrid(rows: Cell[][]): Cell[][] {
  return rows.slice(0, MAX_ROWS).map((r) => {
    const row = r.slice(0, MAX_COLS);
    let end = row.length;
    while (end > 0 && (row[end - 1] === null || row[end - 1] === "")) end--;
    return row.slice(0, end);
  });
}

export async function readWorkbookGrids(buffer: Buffer): Promise<SheetGrid[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error("Não consegui ler o arquivo. Envie uma planilha .xlsx (Excel 2007 ou mais novo).");
  }
  const grids: SheetGrid[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state === "hidden" || ws.state === "veryHidden") continue;
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      if (n > MAX_ROWS) return;
      const vals: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > MAX_COLS) return;
        // Célula mesclada: só a primeira (master) tem o valor; as demais ficam vazias
        vals[col - 1] = cell.isMerged && cell.master.address !== cell.address ? null : toCell(cell.value);
      });
      for (let i = 0; i < vals.length; i++) vals[i] ??= null;
      rows[n - 1] = vals;
    });
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    grids.push({ name: ws.name, rows: trimGrid(rows), score: 0 });
  }
  // Arquivo com XML prefixado (<x:row>), que o exceljs lê vazio: leitor próprio
  if (grids.every((g) => g.rows.length === 0)) {
    const dir = await mkdtemp(path.join(tmpdir(), "orc-import-"));
    try {
      const file = path.join(dir, "planilha.xlsx");
      await writeFile(file, buffer);
      grids.length = 0;
      for (const name of (await readSheetNames(file)).values()) {
        const rows = (await readSheetRows(file, name)).map((r) => r.slice(1).map((v) => toCell(v)));
        grids.push({ name, rows: trimGrid(rows), score: 0 });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  for (const g of grids) g.score = detectLayout(g.rows)?.score ?? 0;
  return grids;
}
