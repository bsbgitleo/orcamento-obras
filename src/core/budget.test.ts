// src/core/budget.test.ts
import { describe, expect, it } from "vitest";
import { buildTree, computeBudget, unitPriceWithBdi, type BudgetNodeInput } from "./budget";

describe("unitPriceWithBdi", () => {
  it("TRUNC(custo × (1 + BDI%), 2)", () => {
    expect(unitPriceWithBdi("186.40", "23.86").toString()).toBe("230.87"); // 230.87504
    expect(unitPriceWithBdi("0.01", "23.86").toString()).toBe("0.01");    // 0.012386
    expect(unitPriceWithBdi("100", "0").toString()).toBe("100");
  });
});

const tree: BudgetNodeInput[] = [
  { kind: "STAGE", id: "s1", description: "Serviços preliminares", children: [
    { kind: "SERVICE", id: "v1", description: "Piso podotátil", unit: "M2", quantity: "12.5", unitCost: "186.40" },
    { kind: "STAGE", id: "s11", description: "Canteiro", children: [
      { kind: "SERVICE", id: "v2", description: "Servente", unit: "H", quantity: "3.333", unitCost: "26.07" },
    ] },
  ] },
  { kind: "STAGE", id: "s2", description: "Equipamentos", children: [
    { kind: "SERVICE", id: "v3", description: "Split (fornecimento)", unit: "UN", quantity: "2", unitCost: "3500", isSupplyItem: true },
    { kind: "SERVICE", id: "v4", description: "Sem custo", unit: "UN", quantity: "1", unitCost: null },
  ] },
];

describe("computeBudget", () => {
  const r = computeBudget(tree, { bdiPercent: "23.86", supplyBdiPercent: "14.02" });
  const line = (id: string) => r.lines.find((l) => l.id === id)!;

  it("numera a EAP", () => {
    expect(r.lines.map((l) => `${l.code}:${l.id}`)).toEqual(["1:s1", "1.1:v1", "1.2:s11", "1.2.1:v2", "2:s2", "2.1:v3", "2.2:v4"]);
  });

  it("calcula custo e preço do serviço", () => {
    // v1: 12.5 × 186.40 = 2330.00 ; preço unit 230.87 ; 12.5 × 230.87 = 2885.875 → 2885.87
    expect(line("v1").totalCost!.toString()).toBe("2330");
    expect(line("v1").unitPrice!.toString()).toBe("230.87");
    expect(line("v1").totalPrice!.toString()).toBe("2885.87");
    // v2: 3.333 × 26.07 = 86.89131 → 86.89 ; preço unit 26.07×1.2386=32.290302 → 32.29 ; 3.333×32.29=107.62257 → 107.62
    expect(line("v2").totalCost!.toString()).toBe("86.89");
    expect(line("v2").totalPrice!.toString()).toBe("107.62");
  });

  it("usa o BDI reduzido em item de mero fornecimento", () => {
    // 3500 × 1.1402 = 3990.70
    expect(line("v3").unitPrice!.toString()).toBe("3990.7");
    expect(line("v3").totalPrice!.toString()).toBe("7981.4");
  });

  it("serviço sem custo não soma e é sinalizado", () => {
    expect(line("v4").incomplete).toBe(true);
    expect(line("v4").totalCost).toBeNull();
    expect(r.incompleteServices).toBe(1);
  });

  it("soma etapas e obra", () => {
    expect(line("s11").totalCost!.toString()).toBe("86.89");
    expect(line("s1").totalCost!.toString()).toBe("2416.89");
    expect(line("s1").totalPrice!.toString()).toBe("2993.49");
    expect(line("s2").totalCost!.toString()).toBe("7000");
    expect(r.directCost.toString()).toBe("9416.89");
    expect(r.salePrice.toString()).toBe("10974.89");
    expect(r.bdiAmount.toString()).toBe("1558");
  });

  it("sem BDI de fornecimento, usa o principal", () => {
    const r2 = computeBudget(tree, { bdiPercent: "23.86" });
    expect(r2.lines.find((l) => l.id === "v3")!.unitPrice!.toString()).toBe("4335.1"); // 3500 × 1.2386
  });
});

describe("buildTree", () => {
  it("monta a árvore pela posição", () => {
    const rows = [
      { id: "b", parentId: null, position: 1, kind: "STAGE" },
      { id: "a", parentId: null, position: 0, kind: "STAGE" },
      { id: "a2", parentId: "a", position: 1, kind: "SERVICE" },
      { id: "a1", parentId: "a", position: 0, kind: "SERVICE" },
    ];
    const tree = buildTree(rows, (r, children) => r.kind === "STAGE"
      ? { kind: "STAGE", id: r.id, description: r.id, children }
      : { kind: "SERVICE", id: r.id, description: r.id, unit: "UN", quantity: 1, unitCost: 1 });
    const codes = computeBudget(tree, { bdiPercent: 0 }).lines.map((l) => `${l.code}:${l.id}`);
    expect(codes).toEqual(["1:a", "1.1:a1", "1.2:a2", "2:b"]);
  });
});
