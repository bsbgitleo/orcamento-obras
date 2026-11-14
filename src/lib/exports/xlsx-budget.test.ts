// src/lib/exports/xlsx-budget.test.ts
// Builds both workbooks from a small synthetic budget and reads them back.
import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import Decimal from "decimal.js";

vi.mock("server-only", () => ({}));
import { buildBidderWorkbook, buildBudgetWorkbook } from "./xlsx-budget";
import type { BudgetExport, ExportLine } from "./budget-export";

const line = (p: Partial<ExportLine> & Pick<ExportLine, "id" | "item" | "kind">): ExportLine => ({
  parentId: null, level: 1, compositionCode: null, source: null, description: p.item, unit: null, quantity: null,
  unitCost: null, totalCost: null, unitPrice: null, totalPrice: null, isSupplyItem: false,
  specification: null, measurementCriteria: null, requiresBrand: false, compositionKey: null, ...p,
});

const data: BudgetExport = {
  company: { name: "Construtora X", document: "00.000.000/0001-00", address: null, phone: null, email: null, technicalLead: "Eng. Fulana", technicalRegistry: "CREA 1/D-DF" },
  project: { id: "p", code: "ORC-0009", name: "Reforma", type: "PRIVATE", category: "RENOVATION", uf: "DF", address: null, biddingAgency: null, biddingNumber: null, biddingModality: null },
  client: null,
  budget: {
    id: "b", revision: 1, status: "DRAFT", updatedAt: new Date(),
    base: { origin: "SINAPI", uf: "DF", referenceMonth: "2026-10", regime: "NAO_DESONERADO" },
    bdi: { name: "BDI", percent: "23.86", workType: "EDIFICACOES", centralAdministration: "4", insurance: "0.8", risk: "1.27", guarantee: "0", financialExpenses: "1.23", profit: "7.4", pis: "0.65", cofins: "3", iss: "2.5", cprb: "0" },
    supplyBdi: null, socialCharges: { name: "Encargos", hourlyPct: "110.08", monthlyPct: "69.94" },
    directCost: "1918.70", salePrice: "2376.40",
    proposalValidityDays: 60, executionTerm: null, paymentTerms: null, proposalNotes: null,
    bidderInstructions: "1. OBJETO\nReforma do bloco.", bidderPremises: null, scheduleMonths: 2,
  },
  lines: [
    line({ id: "s1", item: "1", kind: "STAGE", description: "Revestimentos", totalCost: "1918.70", totalPrice: "2376.40" }),
    line({ id: "a", parentId: "s1", level: 2, item: "1.1", kind: "SERVICE", compositionCode: "104658", source: "SINAPI", unit: "M2", quantity: "10", unitCost: "186.40", totalCost: "1864.00", unitPrice: "230.87", totalPrice: "2308.70", requiresBrand: true, specification: "Piso tátil" }),
    line({ id: "b", parentId: "s1", level: 2, item: "1.2", kind: "SERVICE", compositionCode: "87879", source: "SINAPI", unit: "M2", quantity: "10", unitCost: "5.47", totalCost: "54.70", unitPrice: "6.77", totalPrice: "67.70" }),
    line({ id: "c", parentId: "s1", level: 2, item: "1.3", kind: "SERVICE", compositionCode: "99999", source: "SINAPI", unit: "UN", quantity: "1" }), // sem custo
  ],
  analytic: [],
  schedule: null,
  abc: { services: [], inputs: [], servicesTotal: new Decimal(0), inputsTotal: new Decimal(0), directCost: new Decimal(1918.7), skipped: 1 },
};

async function read(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe("Excel exports", () => {
  it("synthetic sheet: values from the app, stage total as SUM of priced children", async () => {
    const wb = await read(await buildBudgetWorkbook(data));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Sintética", "Analítica", "BDI e encargos", "Cronograma", "ABC serviços", "ABC insumos"]);
    const ws = wb.getWorksheet("Sintética")!;
    const stageRow = ws.getColumn(1).values.findIndex((v) => v === "1");
    const total = ws.getCell(stageRow, 10).value as { formula: string; result: number };
    expect(total.formula).toBe(`SUM(J${stageRow + 1},J${stageRow + 2})`); // o serviço sem custo não entra
    expect(total.result).toBe(2376.4);
    expect(ws.getCell(stageRow + 1, 9).value).toBe(230.87);
    expect(String(ws.getCell(stageRow + 3, 4).value)).toContain("SEM CUSTO");
  });

  it("bidder sheet: no prices, ROUND formula per item, every item in the stage sum, brand only where required", async () => {
    const wb = await read(await buildBidderWorkbook(data));
    const ws = wb.getWorksheet("Proposta da Proponente")!;
    expect(ws.getCell("H10").value).toBeNull();
    expect((ws.getCell("I10").value as { formula: string }).formula).toBe('IF(OR(F10="",H10=""),0,ROUND(F10*H10,2))');
    expect((ws.getCell("I9").value as { formula: string }).formula).toBe("SUM(I10,I11,I12)");
    expect(ws.getCell("G10").value).toBeNull(); // exige marca: a proponente preenche
    expect(ws.getCell("G11").value).toBe("não se aplica");
    expect(ws.getCell("C10").value).toBe("Piso tátil");
    expect(ws.getCell("H10").protection?.locked).toBe(false);
    expect(wb.getWorksheet("Instruções")?.getCell("A3").value).toBe("1. OBJETO");
    expect(wb.getWorksheet("Premissas")).toBeUndefined();
  });
});
