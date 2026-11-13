// src/core/maintenance.test.ts
import { describe, expect, it } from "vitest";
import { maintenanceAlerts, maintenanceSeverity, type MaintenanceRecord, type UsedItem } from "./maintenance";

describe("maintenanceSeverity", () => {
  it("classifies the SINAPI texts", () => {
    expect(maintenanceSeverity("DESATIVAÇÃO")).toBe("CRITICAL");
    expect(maintenanceSeverity("COMPOSIÇÃO SUSPENSA")).toBe("CRITICAL");
    expect(maintenanceSeverity("ALTERAÇÃO DE ITENS/COEFICIENTES")).toBe("CHANGE");
    expect(maintenanceSeverity("ALTERAÇÃO DE FAMÍLIA/COEFICIENTE")).toBe("CHANGE");
    expect(maintenanceSeverity("ALTERAÇÃO DE UNIDADE")).toBe("CHANGE");
    expect(maintenanceSeverity("ALTERAÇÃO DE DESCRIÇÃO")).toBe("CHANGE");
    expect(maintenanceSeverity("CRIAÇÃO DE COMPOSIÇÃO COM CUSTO")).toBe("INFO");
    expect(maintenanceSeverity("INÍCIO DIVULGAÇÃO DE PREÇO")).toBe("INFO");
    expect(maintenanceSeverity("UM TEXTO NOVO DA CAIXA")).toBe("CHANGE");
  });
});

describe("maintenanceAlerts", () => {
  const used: UsedItem[] = [
    { itemType: "COMPOSICAO", code: "87879", description: "CHAPISCO", usedBy: ["1.1"] },
    { itemType: "COMPOSICAO", code: "104658", description: "EMBOÇO", usedBy: ["1.2", "2.1"] },
    { itemType: "INSUMO", code: "370", description: "AREIA MEDIA", usedBy: ["1.1", "1.2"] },
  ];
  const rec = (referenceMonth: string, itemType: "INSUMO" | "COMPOSICAO", code: string, maintenance: string): MaintenanceRecord =>
    ({ referenceMonth, itemType, code, description: "x", maintenance });

  it("ignores maintenances up to the budget month and items the budget does not use", () => {
    const out = maintenanceAlerts(used, [
      rec("2026-10", "COMPOSICAO", "87879", "DESATIVAÇÃO"), // same month: already in the base
      rec("2026-09", "INSUMO", "370", "ALTERAÇÃO DE DESCRIÇÃO"),
      rec("2026-12", "COMPOSICAO", "99999", "DESATIVAÇÃO"), // not used
      rec("2026-12", "INSUMO", "87879", "DESATIVAÇÃO"), // same code, other type
    ], "2026-10");
    expect(out).toEqual([]);
  });

  it("groups events per item, keeps the worst severity and sorts critical first", () => {
    const out = maintenanceAlerts(used, [
      rec("2027-01", "COMPOSICAO", "104658", "ALTERAÇÃO DE DESCRIÇÃO"),
      rec("2026-11", "INSUMO", "370", "ALTERAÇÃO DE UNIDADE"),
      rec("2026-12", "COMPOSICAO", "104658", "DESATIVAÇÃO"),
      rec("2026-11", "COMPOSICAO", "87879", "ALTERAÇÃO DE ITENS/COEFICIENTES"),
    ], "2026-10");
    expect(out.map((a) => [a.itemType, a.code, a.severity])).toEqual([
      ["COMPOSICAO", "104658", "CRITICAL"],
      ["COMPOSICAO", "87879", "CHANGE"],
      ["INSUMO", "370", "CHANGE"],
    ]);
    expect(out[0].events.map((e) => e.referenceMonth)).toEqual(["2026-12", "2027-01"]);
    expect(out[0].usedBy).toEqual(["1.2", "2.1"]);
  });
});
