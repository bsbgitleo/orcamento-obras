// src/import/sinapi/workbook.ts
// Streaming helpers over exceljs. The streaming reader only knows a sheet's name
// if xl/workbook.xml precedes the sheet inside the zip, which is not guaranteed
// (files re-saved by Excel/LibreOffice/exceljs differ). We read the names from
// the zip ourselves and iterate sheets by name.
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import ExcelJS from "exceljs";

/** sheetNo (1-based, as in worksheets/sheetN.xml) → sheet name */
export async function readSheetNames(path: string): Promise<Map<number, string>> {
  const zip = await JSZip.loadAsync(await readFile(path));
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relsXml) throw new Error(`Arquivo xlsx inválido: ${path}`);

  const targetByRid = new Map<string, number>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    const n = target && /worksheets\/sheet(\d+)\.xml$/.exec(target)?.[1];
    if (id && n) targetByRid.set(id, Number(n));
  }
  const names = new Map<number, string>();
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1];
    const rid = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    const n = rid && targetByRid.get(rid);
    if (name && n) names.set(n, decodeXml(name));
  }
  return names;
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export type SheetHandler = (ws: ExcelJS.stream.xlsx.WorksheetReader) => Promise<void>;

/**
 * Streams every worksheet, calling `handlers[name]` for the ones we care about
 * and draining the rest (the streaming reader requires every sheet's rows to be
 * consumed, otherwise the next sheet's temp file is removed before it is read).
 */
export async function streamSheets(path: string, handlers: Record<string, SheetHandler>): Promise<void> {
  const names = await readSheetNames(path);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, {
    entries: "emit", sharedStrings: "cache", hyperlinks: "ignore", styles: "ignore", worksheets: "emit",
  });
  // exceljs crashes ("reading 'sheets'") when a sheet entry precedes xl/workbook.xml in
  // the zip; give it an empty model so it just yields the sheet without a name.
  const internal = reader as unknown as { model?: { sheets?: unknown[] } };
  internal.model ??= { sheets: [] };
  for await (const ws of reader) {
    // exceljs typings omit id/name on WorksheetReader
    const meta = ws as unknown as { id: number | string; name?: string };
    const name = names.get(Number(meta.id)) ?? meta.name;
    const handler = name ? handlers[name] : undefined;
    if (handler) await handler(ws);
    else await drain(ws);
  }
}

async function drain(ws: ExcelJS.stream.xlsx.WorksheetReader): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _row of ws) { /* consume */ }
}

export function rowValues(row: ExcelJS.Row): ExcelJS.CellValue[] {
  return row.values as ExcelJS.CellValue[]; // 1-based (index 0 unused)
}
