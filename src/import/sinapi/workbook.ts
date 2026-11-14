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
  return sheetNamesFromZip(await JSZip.loadAsync(await readFile(path)), path);
}

async function sheetNamesFromZip(zip: JSZip, path: string): Promise<Map<number, string>> {
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
  // Elements may carry a namespace prefix (<x:sheet …>, as in SINAPI_Manutenções)
  for (const m of workbookXml.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1];
    const rid = /\b\w+:id="([^"]+)"/.exec(m[0])?.[1];
    const n = rid && targetByRid.get(rid);
    if (name && n) names.set(n, decodeXml(name));
  }
  return names;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** "AB" → 28 (1-based) */
function columnNumber(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * Reads one whole sheet into memory as rows of values (1-based like
 * rowValues): shared/inline strings as text, numbers as numbers. Unlike the
 * exceljs streaming reader it accepts namespace-prefixed XML (<x:row>, <x:c>),
 * which is how SINAPI_Manutenções is written. Meant for small sheets.
 */
export async function readSheetRows(path: string, sheetName: string): Promise<ExcelJS.CellValue[][]> {
  const zip = await JSZip.loadAsync(await readFile(path));
  const names = await sheetNamesFromZip(zip, path);
  const sheetNo = [...names].find(([, name]) => name === sheetName)?.[0];
  if (!sheetNo) throw new Error(`Aba "${sheetName}" não encontrada em ${path}`);
  const xml = await zip.file(`xl/worksheets/sheet${sheetNo}.xml`)?.async("string");
  if (!xml) throw new Error(`Aba "${sheetName}" sem conteúdo em ${path}`);

  const shared: string[] = [];
  const sstXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (sstXml) {
    for (const si of sstXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) {
      const texts = [...si[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((t) => decodeXml(t[1]));
      shared.push(texts.join(""));
    }
  }

  const rows: ExcelJS.CellValue[][] = [];
  for (const row of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    // Respeita o número da linha (r="12"); linhas ausentes ficam vazias
    const rowNo = Number(/\br="(\d+)"/.exec(row[1])?.[1] ?? rows.length + 1);
    while (rows.length < rowNo - 1) rows.push([]);
    const values: ExcelJS.CellValue[] = [];
    let next = 1;
    for (const c of row[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([A-Z]+\d*)"/.exec(attrs)?.[1];
      const col = ref ? columnNumber(ref) : next;
      next = col + 1;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const body = c[2] ?? "";
      const raw = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
      let value: ExcelJS.CellValue = null;
      if (type === "s" && raw !== undefined) value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = [...body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((t) => decodeXml(t[1])).join("");
      else if (type === "str" || type === "e") value = raw === undefined ? null : decodeXml(raw);
      else if (type === "b") value = raw === "1";
      else if (raw !== undefined && raw !== "") value = Number(raw);
      // Fórmula (ex.: HYPERLINK com o código da composição): devolve como o exceljs
      const f = /<(?:\w+:)?f\b[^>]*>([\s\S]*?)<\/(?:\w+:)?f>/.exec(body)?.[1];
      if (f) value = { formula: decodeXml(f), result: value ?? undefined } as ExcelJS.CellValue;
      values[col] = value;
    }
    rows.push(values);
  }
  return rows;
}

export type SheetHandler = (ws: ExcelJS.stream.xlsx.WorksheetReader) => Promise<void>;

/**
 * Streams every worksheet, calling `handlers[name]` for the ones we care about
 * and draining the rest (the streaming reader requires every sheet's rows to be
 * consumed, otherwise the next sheet's temp file is removed before it is read).
 */
export async function streamSheets(path: string, handlers: Record<string, SheetHandler>): Promise<void> {
  const zip = await JSZip.loadAsync(await readFile(path));
  const names = await sheetNamesFromZip(zip, path);
  // The exceljs streaming reader parks worksheets that come BEFORE
  // xl/sharedStrings.xml in temp files and, under load, sometimes yields them
  // with unresolved strings ("[object Object]") or missing rows. Files written
  // by exceljs itself (and some re-saved ones) have that order; the Caixa files
  // don't. For those, read the sheets whole with our own parser instead.
  const entries = Object.keys(zip.files);
  const sst = entries.indexOf("xl/sharedStrings.xml");
  const firstSheet = entries.findIndex((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e));
  if (sst > firstSheet && firstSheet >= 0) {
    for (const [, name] of [...names].sort((a, b) => a[0] - b[0])) {
      const handler = handlers[name];
      if (!handler) continue;
      const rows = await readSheetRows(path, name);
      const iterable = { async *[Symbol.asyncIterator]() { for (const [i, values] of rows.entries()) yield { values, number: i + 1 } as unknown as ExcelJS.Row; } };
      await handler(iterable as unknown as ExcelJS.stream.xlsx.WorksheetReader);
    }
    return;
  }
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
