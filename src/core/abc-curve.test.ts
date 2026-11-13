// src/core/abc-curve.test.ts
import { describe, expect, it } from "vitest";
import { buildAbcCurve } from "./abc-curve";

describe("buildAbcCurve", () => {
  const rows = [
    { item: "concreto", total: "500" },
    { item: "aço", total: "300" },
    { item: "forma", total: "100" },
    { item: "prego", total: "60" },
    { item: "arame", total: "40" },
  ]; // total 1000

  it("ordena decrescente e acumula", () => {
    const curve = buildAbcCurve(rows);
    expect(curve.map((r) => r.item)).toEqual(["concreto", "aço", "forma", "prego", "arame"]);
    expect(curve.map((r) => r.cumulativePct.toString())).toEqual(["50", "80", "90", "96", "100"]);
  });

  it("classifica pelo acumulado antes do item: A < 80%, B < 95%, C", () => {
    const curve = buildAbcCurve(rows);
    // acumulados: 50, 80, 90, 96, 100 → antes: 0, 50, 80, 90, 96
    expect(curve.map((r) => r.abcClass)).toEqual(["A", "A", "B", "B", "C"]);
  });

  it("o item que cruza o limite fica na classe anterior; o 1º é sempre A", () => {
    const curve = buildAbcCurve([{ item: "x", total: "977" }, { item: "y", total: "23" }]);
    expect(curve.map((r) => r.abcClass)).toEqual(["A", "C"]);
  });

  it("aceita limites customizados", () => {
    const curve = buildAbcCurve(rows, { a: "50", b: "90" });
    // antes: 0, 50, 80, 90, 96
    expect(curve.map((r) => r.abcClass)).toEqual(["A", "B", "B", "C", "C"]);
  });

  it("lida com total zero", () => {
    const curve = buildAbcCurve([{ item: "x", total: 0 }]);
    expect(curve[0].sharePct.toString()).toBe("0");
    expect(curve[0].abcClass).toBe("A");
  });

  it("rejeita limites inválidos", () => {
    expect(() => buildAbcCurve(rows, { a: "95", b: "80" })).toThrow();
  });
});
