// src/core/composition.test.ts
// Os códigos e preços abaixo são FICTÍCIOS, só para exercitar a aritmética.
import { describe, expect, it } from "vitest";
import {
  calculateCompositionCost,
  CompositionCycleError,
  MissingReferenceError,
  serviceTotal,
  type Catalog,
  type Composition,
  type InputItem,
  type PriceSource,
} from "./composition";

const src: PriceSource = { origin: "PROPRIA", uf: "DF", referenceMonth: "2026-10", regime: "NAO_DESONERADO" };

const inputs: InputItem[] = [
  { id: "i-cement", code: "T001", description: "Cimento", unit: "KG", kind: "MATERIAL", unitPrice: "0.80", source: src },
  { id: "i-sand", code: "T002", description: "Areia", unit: "M3", kind: "MATERIAL", unitPrice: "120.00", source: src },
  { id: "i-mason", code: "T003", description: "Pedreiro", unit: "H", kind: "MAO_DE_OBRA", unitPrice: "25.333", source: src },
  { id: "i-helper", code: "T004", description: "Servente", unit: "H", kind: "MAO_DE_OBRA", unitPrice: "18.10", source: src },
  { id: "i-mixer", code: "T005", description: "Betoneira", unit: "CHP", kind: "EQUIPAMENTO", unitPrice: "2.50", source: src },
];

const compositions: Composition[] = [
  {
    id: "c-mortar", code: "C100", description: "Argamassa (aux.)", unit: "M3", source: src,
    items: [
      { type: "INSUMO", inputId: "i-cement", coefficient: "300" },   // 240.00
      { type: "INSUMO", inputId: "i-sand", coefficient: "1.1" },     // 132.00
      { type: "INSUMO", inputId: "i-helper", coefficient: "2" },     //  36.20
      { type: "INSUMO", inputId: "i-mixer", coefficient: "1" },      //   2.50
    ],                                                               // = 410.70
  },
  {
    id: "c-plaster", code: "C200", description: "Chapisco", unit: "M2", source: src,
    items: [
      { type: "COMPOSICAO_AUXILIAR", compositionId: "c-mortar", coefficient: "0.005" }, // 2.0535
      { type: "INSUMO", inputId: "i-mason", coefficient: "0.1" },                       // 2.5333
      { type: "INSUMO", inputId: "i-helper", coefficient: "0.1" },                      // 1.81
    ],                                                                                  // = 6.3968 → 6.40
  },
];

const catalog: Catalog = {
  getInput: (id) => inputs.find((i) => i.id === id),
  getComposition: (id) => compositions.find((c) => c.id === id),
};

describe("calculateCompositionCost", () => {
  it("soma coeficiente × preço dos insumos", () => {
    const r = calculateCompositionCost("c-mortar", catalog);
    expect(r.unitCost.toString()).toBe("410.7");
    expect(r.breakdown.material.toString()).toBe("372");
    expect(r.breakdown.labor.toString()).toBe("36.2");
    expect(r.breakdown.equipment.toString()).toBe("2.5");
  });

  it("resolve composição auxiliar recursivamente e arredonda a 2 casas", () => {
    const r = calculateCompositionCost("c-plaster", catalog);
    expect(r.rawUnitCost.toString()).toBe("6.3968");
    expect(r.unitCost.toString()).toBe("6.4");
  });

  it("propaga a divisão material/mão de obra da auxiliar", () => {
    const r = calculateCompositionCost("c-plaster", catalog);
    // 0.005 × 372 (material da argamassa) = 1.86
    expect(r.breakdown.material.toDecimalPlaces(4).toString()).toBe("1.86");
    // 0.005 × 36.2 + 2.5333 + 1.81 = 4.5243
    expect(r.breakdown.labor.toDecimalPlaces(4).toString()).toBe("4.5243");
  });

  it("detecta referência circular", () => {
    const cyclic: Catalog = {
      getInput: () => undefined,
      getComposition: (id) => ({
        id, code: id, description: id, unit: "UN", source: src,
        items: [{ type: "COMPOSICAO_AUXILIAR", compositionId: id === "a" ? "b" : "a", coefficient: 1 }],
      }),
    };
    expect(() => calculateCompositionCost("a", cyclic)).toThrow(CompositionCycleError);
  });

  it("falha em insumo inexistente", () => {
    const broken: Catalog = {
      getInput: () => undefined,
      getComposition: () => ({
        id: "x", code: "x", description: "x", unit: "UN", source: src,
        items: [{ type: "INSUMO", inputId: "nope", coefficient: 1 }],
      }),
    };
    expect(() => calculateCompositionCost("x", broken)).toThrow(MissingReferenceError);
  });
});

describe("serviceTotal", () => {
  it("quantidade × custo unitário, arredondado", () => {
    expect(serviceTotal("152.3456", "6.40").toString()).toBe("975.01");
  });
});
