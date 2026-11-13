// src/core/bdi.test.ts
import { describe, expect, it } from "vitest";
import { applyBdi, calculateBdi, classifyBdi, type BdiInput } from "./bdi";
import { roundMoney } from "./money";

// Exemplo do guia do TCU (06-tcu-engenharia-custos-regras.md §7, item 5.1.18):
// AC 5%, R 1%, DF 1%, L 8%, PIS 0,65%, COFINS 3%, ISS 3% → 23,86%
// Com CPRB 4,5% → 30,13%
const tcuExample: BdiInput = {
  centralAdministration: "5",
  insurance: "0",
  risk: "1",
  guarantee: "0",
  financialExpenses: "1",
  profit: "8",
  taxes: { pis: "0.65", cofins: "3", iss: "3" },
};

describe("calculateBdi — fórmula do Acórdão TCU 2622/2013", () => {
  it("reproduz o exemplo do guia do TCU sem CPRB (23,86%)", () => {
    const r = calculateBdi(tcuExample);
    expect(r.taxesPct.toString()).toBe("6.65");
    expect(r.percent.toString()).toBe("23.86");
  });

  it("reproduz o exemplo do guia do TCU com CPRB 4,5% (30,13%)", () => {
    const r = calculateBdi({ ...tcuExample, taxes: { ...tcuExample.taxes, cprb: "4.5" } });
    expect(r.taxesPct.toString()).toBe("11.15");
    expect(r.percent.toString()).toBe("30.13");
  });

  it("confirma que o fator usa (1 + L), não (1 − L)", () => {
    // Com (1 − L) o resultado seria ~5,3%, longe de 23,86%.
    const r = calculateBdi(tcuExample);
    expect(r.factor.gt("0.2")).toBe(true);
  });

  it("BDI zero quando todas as parcelas são zero", () => {
    const r = calculateBdi({
      centralAdministration: 0, insurance: 0, risk: 0, guarantee: 0,
      financialExpenses: 0, profit: 0, taxes: { pis: 0, cofins: 0, iss: 0 },
    });
    expect(r.percent.toString()).toBe("0");
  });

  it("rejeita tributos >= 100%", () => {
    expect(() =>
      calculateBdi({ ...tcuExample, taxes: { pis: "50", cofins: "50", iss: "0" } }),
    ).toThrow();
  });
});

describe("applyBdi", () => {
  it("preço de venda = custo × (1 + BDI)", () => {
    const { percent } = calculateBdi(tcuExample);
    expect(roundMoney(applyBdi("1000", percent)).toString()).toBe("1238.6");
  });
  it("usa o percentual declarado (2 casas), não o fator bruto", () => {
    const { factor, percent } = calculateBdi(tcuExample);
    expect(factor.toDecimalPlaces(6).toString()).toBe("0.238616");
    expect(roundMoney(applyBdi("100000", percent)).toString()).toBe("123860");
  });
});

describe("classifyBdi — faixas do Acórdão 2622/2013", () => {
  it("classifica edificações", () => {
    expect(classifyBdi("22.12", "EDIFICACOES")).toBe("WITHIN");
    expect(classifyBdi("20.34", "EDIFICACOES")).toBe("WITHIN"); // limite inclusivo
    expect(classifyBdi("25.00", "EDIFICACOES")).toBe("WITHIN");
    expect(classifyBdi("19.99", "EDIFICACOES")).toBe("BELOW");
    expect(classifyBdi("25.01", "EDIFICACOES")).toBe("ABOVE");
  });
  it("classifica mero fornecimento", () => {
    expect(classifyBdi("14.02", "FORNECIMENTO_MATERIAIS_EQUIPAMENTOS")).toBe("WITHIN");
    expect(classifyBdi("17", "FORNECIMENTO_MATERIAIS_EQUIPAMENTOS")).toBe("ABOVE");
  });
});
