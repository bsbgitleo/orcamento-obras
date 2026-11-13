// src/import/sinapi/parse-reference.test.ts
// Builds a tiny workbook with the exact layout of SINAPI_Referência (10/2026)
// and checks the parser. Codes/prices here are synthetic.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseReferenceWorkbook } from "./parse-reference";
import { parseLaborShareWorkbook } from "./parse-labor-share";

let dir: string;
let refFile: string;
let laborFile: string;

const UFS = ["AC", "DF", "SP"];

async function buildReference(file: string) {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Menu").addRow(["x"]);

  // ISD — inputs, sem desoneração
  const isd = wb.addWorksheet("ISD");
  isd.addRow(["SINAPI"]);
  isd.addRow(["RELATÓRIO DE PREÇOS DE INSUMOS"]);
  isd.addRow(["Mês de Referência:", "10/2026", null, null, "Encargos sociais"]);
  isd.addRow(["Data de emissão:", "12/11/2026", null, null, "(SEM DESONERAÇÃO)", ...UFS]);
  isd.addRow([null, null, null, null, "Localidade", "RIO BRANCO", "BRASILIA", "SAO PAULO"]);
  isd.addRow(["Origem de preço:", "C = COLETADO", null, null, "Horista", 1.1, 1.1008, 1.2]);
  isd.addRow(["Preço em branco", null, null, null, "Mensalista", 0.6, 0.6994, 0.7]);
  isd.addRow([]);
  isd.addRow([null, null, null, null, "Preços Medianos (R$):"]);
  isd.addRow(["Classificação", "Código do\nInsumo", "Descrição do Insumo", "Unidade", "Origem de\nPreço", ...UFS]);
  isd.addRow(["MATERIAL", 100, "CIMENTO", "KG", "C", 0.7, 0.8, 0.75]);
  isd.addRow(["MAO DE OBRA", 200, "PEDREIRO", "H", "CR", 20, 25.333, 30]);
  isd.addRow(["EQUIPAMENTO (AQUISIÇÃO)", 300, "BETONEIRA", "UN", "C", null, null, 5000]); // DF blank → SP
  isd.addRow(["MATERIAL", 400, "ITEM SEM PRECO EM LUGAR NENHUM", "UN", "C", null, null, null]);

  // CSD — composition costs
  const csd = wb.addWorksheet("CSD");
  csd.addRow(["SINAPI"]);
  csd.addRow(["RELATÓRIO DE CUSTOS"]);
  csd.addRow(["Mês de Referência:", "10/2026", null, "Encargos sociais"]);
  csd.addRow(["Data de emissão:", "12/11/2026", null, "(SEM DESONERAÇÃO)", "AC", null, "DF", null, "SP", null]);
  csd.addRow([null, null, null, "Localidade", "RIO BRANCO", null, "BRASILIA", null, "SAO PAULO", null]);
  csd.addRow(["Observação:", "%AS", null, "Horista", 1.1, null, 1.1008, null, 1.2, null]);
  csd.addRow([null, null, null, "Mensalista", 0.6, null, 0.6994, null, 0.7, null]);
  csd.addRow([]);
  csd.addRow([null, null, null, null, "AC", null, "DF", null, "SP", null]);
  csd.addRow(["Grupo", "Código da\nComposição", "Descrição", "Unidade", "Custo (R$)", "%AS", "Custo (R$)", "%AS", "Custo (R$)", "%AS"]);
  const link = (code: number) => ({ formula: `HYPERLINK("#"&CELL("address",OFFSET(Analítico!$B$1,MATCH(${code},Analítico!$B:$B,0)-1,3)),${code})` });
  csd.addRow(["Alvenaria", link(9001), "ARGAMASSA (AUX)", "M3", 100, 0, 265.33, 0, 300, 0]);
  csd.addRow(["Alvenaria", link(9002), "CHAPISCO", "M2", 10, 0, 3.85, 0.01, 12, 0]);
  csd.addRow(["Alvenaria", link(9003), "SEM CUSTO", "UN", 0, 0, 0, 0, 0, 0]);

  // Analítico
  const an = wb.addWorksheet("Analítico");
  an.addRow(["SINAPI"]); an.addRow(["RELATÓRIO ANALÍTICO"]); an.addRow(["Mês de Referência:", "10/2026"]);
  an.addRow(["Data de emissão:", "12/11/2026"]); an.addRow([]); an.addRow([]); an.addRow([]); an.addRow([]); an.addRow([]);
  an.addRow(["Grupo", "Código da\nComposição", "Tipo Item", "Código do\nItem", "Descrição", "Unidade", "Coeficiente", "Situação"]);
  an.addRow(["Alvenaria", 9001, null, null, "ARGAMASSA (AUX)", "M3", null, "COM CUSTO"]);
  an.addRow(["Alvenaria", 9001, "INSUMO", 100, "CIMENTO", "KG", 300, "COM PREÇO"]);
  an.addRow(["Alvenaria", 9001, "INSUMO", 200, "PEDREIRO", "H", 1, "COM PREÇO"]);
  an.addRow(["Alvenaria", 9001, "INSUMO", 300, "BETONEIRA", "UN", 0.0000001, "COM PREÇO"]);
  an.addRow(["Alvenaria", 9002, null, null, "CHAPISCO", "M2", null, "COM CUSTO"]);
  an.addRow(["Alvenaria", 9002, "COMPOSICAO", 9001, "ARGAMASSA (AUX)", "M3", 0.0050125, "COM CUSTO"]);
  an.addRow(["Alvenaria", 9002, "INSUMO", 200, "PEDREIRO", "H", 0.1, "COM PREÇO"]);
  an.addRow(["Alvenaria", 9003, null, null, "SEM CUSTO", "UN", null, "SEM CUSTO"]);
  an.addRow(["Alvenaria", 9003, "INSUMO", 999, "INSUMO SO NO ANALITICO", "UN", 2, "SEM PREÇO"]);

  wb.addWorksheet("Analítico com Custo").addRow(["x"]);
  await wb.xlsx.writeFile(file);
}

async function buildLabor(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("SEM Desoneração");
  ws.addRow(["SINAPI"]); ws.addRow(["RELATÓRIO"]); ws.addRow(["Mês de Referência:", "10/2026"]);
  ws.addRow(["Data de emissão:", "12/11/2026"]); ws.addRow([]);
  ws.addRow(["Grupo", "Código da\nComposição", "Descrição", "Unidade", ...UFS]);
  ws.addRow(["Alvenaria", 9001, "ARGAMASSA (AUX)", "M3", 0.1, 0.0955, 0.12]);
  ws.addRow(["Alvenaria", 9002, "CHAPISCO", "M2", 0.5, 0.6625, 0.55]);
  wb.addWorksheet("COM Desoneração").addRow(["x"]);
  await wb.xlsx.writeFile(file);
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sinapi-test-"));
  refFile = path.join(dir, "ref.xlsx");
  laborFile = path.join(dir, "labor.xlsx");
  await buildReference(refFile);
  await buildLabor(laborFile);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("parseReferenceWorkbook", () => {
  it("lê mês, encargos sociais e insumos da UF com fallback para SP", async () => {
    const r = await parseReferenceWorkbook(refFile, { uf: "DF", regime: "NAO_DESONERADO" });
    expect(r.referenceMonth).toBe("2026-10");
    expect(r.socialCharges).toEqual({ hourly: "1.1008", monthly: "0.6994" });

    const byCode = Object.fromEntries(r.inputs.map((i) => [i.code, i]));
    expect(byCode["100"]).toMatchObject({ unitPrice: "0.8", sourceClass: "MATERIAL", priceOrigin: "C", priceFallbackUf: null });
    expect(byCode["200"].unitPrice).toBe("25.333");
    expect(byCode["300"]).toMatchObject({ unitPrice: "5000", priceFallbackUf: "SP" });
    expect(byCode["400"]).toMatchObject({ unitPrice: null, priceFallbackUf: null });
    // input present only in the analytic tree
    expect(byCode["999"]).toMatchObject({ unitPrice: null, description: "INSUMO SO NO ANALITICO", unit: "UN" });
  });

  it("lê composições: código do HYPERLINK, custo da UF, %AS, status e itens com coeficiente exato", async () => {
    const r = await parseReferenceWorkbook(refFile, { uf: "DF", regime: "NAO_DESONERADO" });
    const byCode = Object.fromEntries(r.compositions.map((c) => [c.code, c]));
    expect(Object.keys(byCode).sort()).toEqual(["9001", "9002", "9003"]);
    expect(byCode["9002"]).toMatchObject({ group: "Alvenaria", unit: "M2", referenceCost: "3.85", asShare: "0.01", status: "COM CUSTO" });
    expect(byCode["9002"].items).toEqual([
      { type: "COMPOSICAO", code: "9001", description: "ARGAMASSA (AUX)", unit: "M3", coefficient: "0.0050125", status: "COM CUSTO" },
      { type: "INSUMO", code: "200", description: "PEDREIRO", unit: "H", coefficient: "0.1", status: "COM PREÇO" },
    ]);
    expect(byCode["9001"].items[2].coefficient).toBe("1e-7"); // 7 casas preservadas
    expect(byCode["9003"]).toMatchObject({ referenceCost: "0", status: "SEM CUSTO" });
  });

  it("falha com UF inexistente", async () => {
    await expect(parseReferenceWorkbook(refFile, { uf: "ZZ", regime: "NAO_DESONERADO" })).rejects.toThrow(/UF ZZ/);
  });
});

describe("parseLaborShareWorkbook", () => {
  it("lê o percentual de mão de obra da UF", async () => {
    const m = await parseLaborShareWorkbook(laborFile, { uf: "DF", regime: "NAO_DESONERADO" });
    expect(m.get("9001")).toBe("0.0955");
    expect(m.get("9002")).toBe("0.6625");
  });
  it("retorna vazio para SEM_ENCARGOS (sem relatório)", async () => {
    const m = await parseLaborShareWorkbook(laborFile, { uf: "DF", regime: "SEM_ENCARGOS" });
    expect(m.size).toBe(0);
  });
});
