// src/core/composition.test.ts
import { describe, expect, it } from "vitest";
import {
  calculateCompositionCost,
  CompositionCycleError,
  explodeInputs,
  itemCost,
  MissingReferenceError,
  serviceTotal,
  type Catalog,
  type Composition,
  type InputItem,
  type PriceSource,
} from "./composition";

const src: PriceSource = { origin: "SINAPI", uf: "DF", referenceMonth: "2026-10", regime: "NAO_DESONERADO" };

// ─── Caso real: SINAPI 104658 (DF, 10/2026, sem desoneração) — custo oficial R$ 186,40 ───
// Fonte: SINAPI_Referência_2026_10.xlsx, abas ISD, CSD e Analítico.
const sinapiInputs: InputItem[] = [
  { id: "36178", code: "36178", description: "PISO TATIL / PODOTATIL 40x40", unit: "UN", kind: "MATERIAL", unitPrice: "18.52", source: src },
  { id: "34357", code: "34357", description: "REJUNTE CIMENTICIO", unit: "KG", kind: "MATERIAL", unitPrice: "4.11", source: src },
  { id: "34353", code: "34353", description: "ARGAMASSA COLANTE AC II", unit: "KG", kind: "MATERIAL", unitPrice: "1.30", source: src },
];
// As auxiliares 88316 e 88309 entram pelo custo já calculado no CSD (26,07 e 33,91).
// Modelamos cada uma como composição de um único "insumo" de mão de obra com esse custo.
const sinapiCompositions: Composition[] = [
  { id: "88316", code: "88316", description: "SERVENTE COM ENCARGOS COMPLEMENTARES", unit: "H", source: src,
    items: [{ type: "INSUMO", inputId: "mo-88316", coefficient: "1" }] },
  { id: "88309", code: "88309", description: "PEDREIRO COM ENCARGOS COMPLEMENTARES", unit: "H", source: src,
    items: [{ type: "INSUMO", inputId: "mo-88309", coefficient: "1" }] },
  { id: "104658", code: "104658", description: "PISO PODOTÁTIL DE ALERTA OU DIRECIONAL", unit: "M2", source: src,
    items: [
      { type: "COMPOSICAO_AUXILIAR", compositionId: "88316", coefficient: "1.279" },   // 33.34353 → 33.34
      { type: "COMPOSICAO_AUXILIAR", compositionId: "88309", coefficient: "0.639" },   // 21.66849 → 21.66
      { type: "INSUMO", inputId: "36178", coefficient: "6.4375" },                     // 119.2225 → 119.22
      { type: "INSUMO", inputId: "34357", coefficient: "0.24" },                       // 0.9864 → 0.98
      { type: "INSUMO", inputId: "34353", coefficient: "8.62" },                       // 11.206 → 11.20
    ] },                                                                               // Σ = 186.40
];
const laborInputs: InputItem[] = [
  { id: "mo-88316", code: "mo-88316", description: "servente h", unit: "H", kind: "MAO_DE_OBRA", unitPrice: "26.07", source: src },
  { id: "mo-88309", code: "mo-88309", description: "pedreiro h", unit: "H", kind: "MAO_DE_OBRA", unitPrice: "33.91", source: src },
];

const catalog: Catalog = {
  getInput: (id) => [...sinapiInputs, ...laborInputs].find((i) => i.id === id),
  getComposition: (id) => sinapiCompositions.find((c) => c.id === id),
};

describe("itemCost — TRUNC(coef × preço, 2) como no SINAPI", () => {
  it("trunca, não arredonda", () => {
    expect(itemCost("1.279", "26.07").toString()).toBe("33.34"); // 33.34353
    expect(itemCost("0.24", "4.11").toString()).toBe("0.98");    // 0.9864 (arredondar daria 0.99)
    expect(itemCost("8.62", "1.30").toString()).toBe("11.2");    // 11.206 (arredondar daria 11.21)
  });
});

describe("calculateCompositionCost", () => {
  it("reproduz o custo oficial do SINAPI 104658/DF: R$ 186,40", () => {
    const r = calculateCompositionCost("104658", catalog);
    expect(r.unitCost.toString()).toBe("186.4");
    expect(r.incomplete).toBe(false);
    expect(r.items.map((i) => i.cost.toString())).toEqual(["33.34", "21.66", "119.22", "0.98", "11.2"]);
  });

  it("separa material e mão de obra", () => {
    const r = calculateCompositionCost("104658", catalog);
    expect(r.breakdown.material.toString()).toBe("131.4"); // 119.22 + 0.98 + 11.20
    expect(r.breakdown.labor.toString()).toBe("55");       // 33.34 + 21.66
    expect(r.breakdown.total.eq(r.unitCost)).toBe(true);
  });

  it("marca como incompleta quando um insumo está sem preço", () => {
    const noPrice: Catalog = {
      getInput: (id) => id === "36178"
        ? { ...sinapiInputs[0], unitPrice: null }
        : catalog.getInput(id),
      getComposition: catalog.getComposition,
    };
    const r = calculateCompositionCost("104658", noPrice);
    expect(r.incomplete).toBe(true);
    expect(r.unitCost.toString()).toBe("67.18"); // 186.40 − 119.22
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
  it("quantidade × custo unitário, truncado", () => {
    expect(serviceTotal("152.3456", "6.40").toString()).toBe("975.01"); // 975.01184
    expect(serviceTotal("3", "0.333").toString()).toBe("0.99");        // 0.999 → trunca
  });
});

describe("explodeInputs", () => {
  it("agrega coeficientes atravessando composições auxiliares", () => {
    const m = explodeInputs("104658", catalog);
    // 88316 → mo-88316 × 1 × 1.279 ; 88309 → mo-88309 × 0.639
    expect(m.get("mo-88316")!.toString()).toBe("1.279");
    expect(m.get("mo-88309")!.toString()).toBe("0.639");
    expect(m.get("36178")!.toString()).toBe("6.4375");
    expect(m.size).toBe(5);
  });
  it("multiplica pelo fator (quantidade do serviço)", () => {
    const m = explodeInputs("104658", catalog, "20");
    expect(m.get("36178")!.toString()).toBe("128.75");
  });
});
