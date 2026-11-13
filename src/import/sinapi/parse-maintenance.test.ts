// src/import/sinapi/parse-maintenance.test.ts
// Synthetic workbooks with the layout of SINAPI_Manutenções (10/2026), in the
// two XML flavours: plain (as exceljs writes) and namespace-prefixed (<x:row>),
// which is how the Caixa writes the real file.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { monthFromCell, parseMaintenanceWorkbook } from "./parse-maintenance";
import { buildSinapiPackage, classifyBySheetNames } from "./classify";

let dir: string;

beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), "sinapi-manut-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

async function plainWorkbook(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Manutenções");
  ws.addRow(["SINAPI - Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil"]);
  ws.addRow(["RELATÓRIO DE MANUTENÇÕES DE INSUMOS E COMPOSIÇÕES"]);
  ws.addRow(["Mês de Referência:", "10/2026"]);
  ws.addRow(["Data de emissão:", "12/11/2026"]);
  ws.addRow([]);
  ws.addRow(["Referência", "Tipo", "Código", "Descrição", "Manutenção"]);
  ws.addRow([46296, "INSUMO", 45811, "ESTACA PRE-MOLDADA", "DESATIVAÇÃO"]);
  ws.addRow([46266, "COMPOSICAO", 104658, "EMBOÇO & REBOCO", "ALTERAÇÃO DE ITENS/COEFICIENTES"]);
  ws.addRow([]);
  await wb.xlsx.writeFile(file);
}

/** Minimal xlsx written like the Caixa file: x: prefixes, absolute targets, shared strings. */
async function prefixedWorkbook(file: string) {
  const zip = new JSZip();
  const strings = ["Mês de Referência:", "10/2026", "Referência", "Tipo", "Código", "Descrição", "Manutenção", "COMPOSICAO", "CHAPISCO &amp; ARGAMASSA", "COMPOSIÇÃO SUSPENSA"];
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file("xl/workbook.xml", '<?xml version="1.0" encoding="utf-8"?><x:workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheets><x:sheet name="Manutenções" sheetId="1" r:id="rId2" /></x:sheets></x:workbook>');
  zip.file("xl/_rels/workbook.xml.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId2" /></Relationships>');
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((s) => `<x:si><x:t>${s}</x:t></x:si>`).join("")}</x:sst>`);
  const s = (ref: string, i: number) => `<x:c r="${ref}" t="s"><x:v>${i}</x:v></x:c>`;
  const n = (ref: string, v: number) => `<x:c r="${ref}"><x:v>${v}</x:v></x:c>`;
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>
    <x:row r="3">${s("A3", 0)}${s("B3", 1)}</x:row>
    <x:row r="6">${s("A6", 2)}${s("B6", 3)}${s("C6", 4)}${s("D6", 5)}${s("E6", 6)}</x:row>
    <x:row r="7">${n("A7", 46296)}${s("B7", 7)}${n("C7", 87879)}${s("D7", 8)}${s("E7", 9)}</x:row>
    <x:row r="8"><x:c r="A8"/></x:row>
  </x:sheetData></x:worksheet>`);
  await writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
}

describe("monthFromCell", () => {
  it("reads Excel serial dates, Date objects and text", () => {
    expect(monthFromCell(46296)).toBe("2026-10");
    expect(monthFromCell(39995)).toBe("2009-07");
    expect(monthFromCell(new Date(Date.UTC(2026, 9, 1)))).toBe("2026-10");
    expect(monthFromCell("10/2026")).toBe("2026-10");
    expect(monthFromCell("01/10/2026")).toBe("2026-10");
    expect(monthFromCell("")).toBeNull();
  });
});

describe("parseMaintenanceWorkbook", () => {
  it("parses the plain layout", async () => {
    const file = path.join(dir, "plain.xlsx");
    await plainWorkbook(file);
    const r = await parseMaintenanceWorkbook(file);
    expect(r.fileMonth).toBe("2026-10");
    expect(r.rows).toEqual([
      { referenceMonth: "2026-10", itemType: "INSUMO", code: "45811", description: "ESTACA PRE-MOLDADA", maintenance: "DESATIVAÇÃO" },
      { referenceMonth: "2026-09", itemType: "COMPOSICAO", code: "104658", description: "EMBOÇO & REBOCO", maintenance: "ALTERAÇÃO DE ITENS/COEFICIENTES" },
    ]);
  });

  it("parses the namespace-prefixed XML the Caixa writes", async () => {
    const file = path.join(dir, "prefixed.xlsx");
    await prefixedWorkbook(file);
    const r = await parseMaintenanceWorkbook(file);
    expect(r.fileMonth).toBe("2026-10");
    expect(r.rows).toEqual([
      { referenceMonth: "2026-10", itemType: "COMPOSICAO", code: "87879", description: "CHAPISCO & ARGAMASSA", maintenance: "COMPOSIÇÃO SUSPENSA" },
    ]);
  });
});

describe("classify", () => {
  it("recognises the three SINAPI workbooks by their sheets", () => {
    expect(classifyBySheetNames(["Menu", "Busca", "ISD", "ICD", "ISE", "CSD", "CCD", "CSE", "Analítico", "Analítico com Custo"])).toBe("REFERENCE");
    expect(classifyBySheetNames(["SEM Desoneração", "COM Desoneração"])).toBe("LABOR_SHARE");
    expect(classifyBySheetNames(["Manutenções"])).toBe("MAINTENANCE");
    expect(classifyBySheetNames(["Famílias e Coeficientes"])).toBe("UNKNOWN");
  });

  it("builds the package from files with any name and refuses duplicates", async () => {
    const a = path.join(dir, "01_SINAPI_Manuten__es.xlsx");
    const b = path.join(dir, "02_qualquer_nome.xlsx");
    const junk = path.join(dir, "03_nao_xlsx.xlsx");
    await prefixedWorkbook(a);
    await plainWorkbook(b);
    await writeFile(junk, "não é um zip");
    await expect(buildSinapiPackage([a, b])).rejects.toThrow(/dois arquivos/);
    const pkg = await buildSinapiPackage([a, junk]);
    expect(pkg.maintenance).toBe(a);
    expect(pkg.reference).toBeUndefined();
    expect(pkg.ignored).toEqual([junk]);
  });
});
