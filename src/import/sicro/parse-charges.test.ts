// src/import/sicro/parse-charges.test.ts
// Planilha sintética com o layout do "Analítico de Encargos Sociais" do SICRO
// (DF 07/2026): cabeçalho, linha com os códigos dos itens, uma linha por
// profissional (P9xxx) com o total na coluna seguinte ao último item, legenda.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseLaborCharges } from "./parse";

let dir: string;
beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), "sicro-encargos-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

async function workbook(file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Encargos");
  ws.addRow(["Código", "Descrição", "Unid.", "Encargos Sociais (%)"]);
  ws.addRow(["", "", "", "A1", "A2", "B1", "B2", "C1", "D1"]);
  // ruído de ponto flutuante, como nos arquivos do DNIT
  ws.addRow(["P9824", "Servente", "h", 20, 17.799999999999997, 22.9, 18.01, 15.97, 15.84, 110.52]);
  ws.addRow(["P9801", "Engenheiro", "mês", 20, 0, 0, 0, 0, 0, 20]);
  ws.addRow([]);
  ws.addRow(["", "Grupo A - Encargos Sociais Básicos (%)"]);
  ws.addRow(["", "", "A1", "INSS"]);
  ws.addRow(["", "", "A2", "SESI"]);
  ws.addRow(["", "Grupo B - Encargos que recebem incidência de A (%)"]);
  ws.addRow(["", "", "B1", "Repouso semanal remunerado"]);
  await wb.xlsx.writeFile(file);
}

describe("encargos sociais por profissional (SICRO)", () => {
  it("lê itens, soma os grupos e guarda o total e a legenda", async () => {
    const file = path.join(dir, "encargos.xlsx");
    await workbook(file);
    const { rows, legend } = await parseLaborCharges(file);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      code: "P9824", description: "Servente", unit: "h",
      items: { A1: "20", A2: "17.8", B1: "22.9", B2: "18.01", C1: "15.97", D1: "15.84" },
      groups: { A: "37.8000", B: "40.9100", C: "15.9700", D: "15.8400" },
      total: "110.52",
    });
    expect(rows[1].total).toBe("20");
    expect(legend.groups).toEqual({ A: "Encargos Sociais Básicos", B: "Encargos que recebem incidência de A" });
    expect(legend.items).toEqual({ A1: "INSS", A2: "SESI", B1: "Repouso semanal remunerado" });
  });
});
