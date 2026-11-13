// src/core/schedule.test.ts
import { describe, expect, it } from "vitest";
import { computeSchedule, linearPercents } from "./schedule";

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
