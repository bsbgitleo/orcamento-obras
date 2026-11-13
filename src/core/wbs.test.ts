// src/core/wbs.test.ts
import { describe, expect, it } from "vitest";
import { moveNode, numberWbs, wbsTotal, type WbsNode } from "./wbs";

const tree: WbsNode[] = [
  {
    kind: "STAGE", id: "s1", description: "Serviços preliminares",
    children: [
      { kind: "SERVICE", id: "v1", description: "Limpeza", unit: "M2", quantity: "100", unitCost: "2.50" },
      {
        kind: "STAGE", id: "s11", description: "Canteiro",
        children: [
          { kind: "SERVICE", id: "v2", description: "Tapume", unit: "M", quantity: "50", unitCost: "80.00" },
        ],
      },
    ],
  },
  {
    kind: "STAGE", id: "s2", description: "Fundações",
    children: [
      { kind: "SERVICE", id: "v3", description: "Escavação", unit: "M3", quantity: "30.5", unitCost: "45.333" },
    ],
  },
];

describe("numberWbs", () => {
  it("numera 1, 1.1, 1.2, 1.2.1, 2, 2.1", () => {
    const codes = numberWbs(tree).map((n) => `${n.code}:${n.id}`);
    expect(codes).toEqual(["1:s1", "1.1:v1", "1.2:s11", "1.2.1:v2", "2:s2", "2.1:v3"]);
  });

  it("calcula totais de serviço e de etapa", () => {
    const byId = Object.fromEntries(numberWbs(tree).map((n) => [n.id, n.total.toString()]));
    expect(byId.v1).toBe("250");
    expect(byId.v2).toBe("4000");
    expect(byId.s11).toBe("4000");
    expect(byId.s1).toBe("4250");
    expect(byId.v3).toBe("1382.65"); // 30.5 × 45.333 = 1382.6565 → trunca
    expect(byId.s2).toBe("1382.65");
  });

  it("total da obra", () => {
    expect(wbsTotal(tree).toString()).toBe("5632.65");
  });
});

describe("moveNode", () => {
  it("renumera ao mover serviço para outra etapa", () => {
    const moved = moveNode(tree, "v1", { parentId: "s2", index: 0 });
    const codes = numberWbs(moved).map((n) => `${n.code}:${n.id}`);
    expect(codes).toEqual(["1:s1", "1.1:s11", "1.1.1:v2", "2:s2", "2.1:v1", "2.2:v3"]);
  });

  it("move etapa para a raiz", () => {
    const moved = moveNode(tree, "s11", { parentId: null, index: 0 });
    expect(numberWbs(moved).map((n) => n.code + ":" + n.id).slice(0, 3))
      .toEqual(["1:s11", "1.1:v2", "2:s1"]);
  });

  it("não altera a árvore original", () => {
    moveNode(tree, "v1", { parentId: "s2", index: 0 });
    expect(numberWbs(tree)[1].code).toBe("1.1");
  });

  it("rejeita destino em serviço ou inexistente", () => {
    expect(() => moveNode(tree, "v1", { parentId: "v3", index: 0 })).toThrow();
    expect(() => moveNode(tree, "zzz", { parentId: null, index: 0 })).toThrow();
  });
});
