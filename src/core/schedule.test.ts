// src/core/schedule.test.ts
import { describe, expect, it } from "vitest";
import { computeSchedule, computeScheduleTree, linearPercents } from "./schedule";

const stages = [
  { id: "a", code: "1", description: "Preliminares", totalPrice: "1000.01" },
  { id: "b", code: "2", description: "Fundações", totalPrice: "2500" },
  { id: "c", code: "3", description: "Sem cronograma", totalPrice: "300" },
];

describe("computeSchedule", () => {
  const r = computeSchedule(stages, [
    { nodeId: "a", month: 1, percent: "33.33" }, { nodeId: "a", month: 2, percent: "33.33" }, { nodeId: "a", month: 3, percent: "33.34" },
    { nodeId: "b", month: 2, percent: "50" }, { nodeId: "b", month: 3, percent: "30" },
  ], 3);

  it("fecha os centavos no último mês quando a linha soma 100 %", () => {
    // 1000.01 × 33.33 % = 333.303 → 333.30 ; ×2 = 666.60 ; último = 1000.01 − 666.60 = 333.41
    expect(r.rows[0].values.map((v) => v.toString())).toEqual(["333.3", "333.3", "333.41"]);
    expect(r.rows[0].values.reduce((a, v) => a.plus(v)).toString()).toBe("1000.01");
  });

  it("sinaliza linha incompleta (80 %) sem ajuste de centavos", () => {
    expect(r.rows[1].incomplete).toBe(true);
    expect(r.rows[1].values.map((v) => v.toString())).toEqual(["0", "1250", "750"]);
    expect(r.incompleteRows).toBe(1);
  });

  it("linha vazia não é incompleta", () => {
    expect(r.rows[2].incomplete).toBe(false);
    expect(r.rows[2].totalPct.toString()).toBe("0");
  });

  it("totais por mês, acumulado e percentuais sobre o preço de venda", () => {
    expect(r.monthTotals.map((v) => v.toString())).toEqual(["333.3", "1583.3", "1083.41"]);
    expect(r.cumulative.map((v) => v.toString())).toEqual(["333.3", "1916.6", "3000.01"]);
    expect(r.total.toString()).toBe("3800.01");
    expect(r.scheduled.toString()).toBe("1000.01");
    expect(r.cumulativePct[2].toFixed(2)).toBe("78.95");
  });
});

describe("linearPercents", () => {
  it("divide 100 % e põe o resto no último mês", () => {
    expect(linearPercents(3).map((p) => p.toString())).toEqual(["33.33", "33.33", "33.34"]);
    expect(linearPercents(4).map((p) => p.toString())).toEqual(["25", "25", "25", "25"]);
    expect(linearPercents(0)).toEqual([]);
  });
});

describe("computeScheduleTree (por subetapa)", () => {
  const stages = [
    { id: "s1", parentId: null, level: 1, code: "1", description: "Obra civil", totalPrice: "3000" },
    { id: "s11", parentId: "s1", level: 2, code: "1.1", description: "Fundações", totalPrice: "1000" },
    { id: "s12", parentId: "s1", level: 2, code: "1.2", description: "Estrutura", totalPrice: "2000" },
    { id: "s2", parentId: null, level: 1, code: "2", description: "Pintura", totalPrice: "500" },
  ];
  const r = computeScheduleTree(stages, [
    { nodeId: "s11", month: 1, percent: "100" },
    { nodeId: "s12", month: 2, percent: "50" }, { nodeId: "s12", month: 3, percent: "50" },
    { nodeId: "s2", month: 3, percent: "100" },
  ], 3);
  const row = (id: string) => r.rows.find((x) => x.stage.id === id)!;

  it("folhas são editáveis; pais não", () => {
    expect(row("s11").editable).toBe(true);
    expect(row("s1").editable).toBe(false);
  });
  it("pai soma as filhas e deriva os percentuais", () => {
    expect(row("s1").values.map((v) => v.toString())).toEqual(["1000", "1000", "1000"]);
    expect(row("s1").percents.map((p) => p.toFixed(2))).toEqual(["33.33", "33.33", "33.33"]);
    expect(row("s1").totalPct.toString()).toBe("100");
  });
  it("totais da obra consideram só as raízes (sem dupla contagem)", () => {
    expect(r.monthTotals.map((v) => v.toString())).toEqual(["1000", "1000", "1500"]);
    expect(r.total.toString()).toBe("3500");
    expect(r.cumulative[2].toString()).toBe("3500");
  });
  it("mantém a ordem de exibição", () => {
    expect(r.rows.map((x) => x.stage.code)).toEqual(["1", "1.1", "1.2", "2"]);
  });

  it("etapa mista ganha linha editável de serviços diretos", () => {
    // s1 vale 3500 mas as filhas somam 3000 → 500 de serviços diretos
    const mixed = stages.map((s) => (s.id === "s1" ? { ...s, totalPrice: "3500" } : s));
    const r2 = computeScheduleTree(mixed, [
      { nodeId: "s11", month: 1, percent: "100" }, { nodeId: "s12", month: 2, percent: "100" },
      { nodeId: "s1", month: 3, percent: "100" }, // percentuais da linha "serviços diretos" ficam no id do pai
    ], 3);
    expect(r2.rows.map((x) => `${x.stage.code}${x.editable ? "*" : ""}`)).toEqual(["1", "1*", "1.1*", "1.2*", "2*"]);
    const own = r2.rows[1];
    expect(own.price.toString()).toBe("500");
    expect(own.values.map((v) => v.toString())).toEqual(["0", "0", "500"]);
    expect(r2.rows[0].values.map((v) => v.toString())).toEqual(["1000", "2000", "500"]);
    expect(r2.rows[0].totalPct.toString()).toBe("100");
    expect(r2.monthTotals.map((v) => v.toString())).toEqual(["1000", "2000", "500"]);
  });
});
