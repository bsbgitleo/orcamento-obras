// src/core/own-composition.test.ts
import { describe, expect, it } from "vitest";
import { calculateCompositionCost, explodeInputs, type Catalog, type Composition, type InputItem, type PriceSource } from "./composition";
import {
  missingKey, ownCompositionKey, ownInputKey, reachableOwnCompositions, withOwnCompositions, wouldCreateCycle,
  type OwnCompositionDef,
} from "./own-composition";

const source: PriceSource = { origin: "SINAPI", uf: "DF", referenceMonth: "2026-10", regime: "NAO_DESONERADO" };

function official(): Catalog {
  const inputs: InputItem[] = [
    { id: "i-370", code: "370", description: "AREIA MEDIA", unit: "M3", kind: "MATERIAL", unitPrice: "120.00", source },
    { id: "i-1379", code: "1379", description: "CIMENTO CP II-32", unit: "KG", kind: "MATERIAL", unitPrice: "0.85", source },
    { id: "i-88316", code: "88316", description: "SERVENTE", unit: "H", kind: "MAO_DE_OBRA", unitPrice: "23.45", source },
  ];
  const comps: Composition[] = [
    { id: "c-88316", code: "88316", description: "SERVENTE COM ENCARGOS", unit: "H", source, items: [{ type: "INSUMO", inputId: "i-88316", coefficient: "1" }] },
  ];
  const im = new Map(inputs.map((i) => [i.id, i]));
  const cm = new Map(comps.map((c) => [c.id, c]));
  return { getInput: (id) => im.get(id), getComposition: (id) => cm.get(id) };
}

const own: OwnCompositionDef[] = [
  {
    id: "a", code: "CP-0001", description: "ARGAMASSA DE REPARO", unit: "M3", items: [
      { type: "OFFICIAL_INPUT", origin: "SINAPI", code: "370", coefficient: "1.1" },
      { type: "OFFICIAL_INPUT", origin: "SINAPI", code: "1379", coefficient: "350" },
      { type: "OFFICIAL_COMPOSITION", origin: "SINAPI", code: "88316", coefficient: "10" },
      { type: "OWN_INPUT", ownInputId: "p1", coefficient: "2.5" },
    ],
  },
  {
    id: "b", code: "CP-0002", description: "REPARO DE BORDA DE JUNTA", unit: "M", items: [
      { type: "OWN_COMPOSITION", ownCompositionId: "a", coefficient: "0.012" },
      { type: "OFFICIAL_INPUT", origin: "SINAPI", code: "99999", coefficient: "1", description: "INSUMO DESATIVADO", unit: "UN" },
    ],
  },
];

function catalog(): Catalog {
  const base = official();
  return withOwnCompositions({
    base,
    officialInputsByCode: new Map(["370", "1379"].map((c) => [c, base.getInput(`i-${c}`)!])),
    officialCompositionIdByCode: new Map([["88316", "c-88316"]]),
    ownCompositions: own,
    ownInputs: [{ id: "p1", code: "IP-0001", description: "ADITIVO POLIMÉRICO (cotação)", unit: "L", kind: "MATERIAL", unitPrice: "38.90" }],
    source,
  });
}

describe("withOwnCompositions", () => {
  it("prices an own composition with official items of the budget's base and own inputs", () => {
    const r = calculateCompositionCost(ownCompositionKey("a"), catalog());
    // 1,1 × 120,00 = 132,00 ; 350 × 0,85 = 297,50 ; 10 × 23,45 = 234,50 ; 2,5 × 38,90 = 97,25
    expect(r.unitCost.toFixed(2)).toBe("761.25");
    expect(r.incomplete).toBe(false);
    expect(r.breakdown.labor.toFixed(2)).toBe("234.50");
    expect(r.breakdown.material.toFixed(2)).toBe("526.75");
  });

  it("nests own compositions and flags codes missing from the base as 'sem custo'", () => {
    const cat = catalog();
    const r = calculateCompositionCost(ownCompositionKey("b"), cat);
    expect(r.incomplete).toBe(true);
    // TRUNC(0,012 × 761,25) = 9,13 ; missing item contributes 0
    expect(r.unitCost.toFixed(2)).toBe("9.13");
    const missing = cat.getInput(missingKey("SINAPI", "99999"))!;
    expect(missing.unitPrice).toBeNull();
    expect(missing.description).toBe("INSUMO DESATIVADO");
  });

  it("explodes own compositions down to official and own inputs", () => {
    const q = explodeInputs(ownCompositionKey("b"), catalog(), 100);
    expect(q.get("i-370")!.toString()).toBe("1.32"); // 100 × 0,012 × 1,1
    expect(q.get(ownInputKey("p1"))!.toString()).toBe("3"); // 100 × 0,012 × 2,5
    expect(q.get("i-88316")!.toString()).toBe("12"); // via official auxiliary
  });
});

describe("own composition graph", () => {
  const byId = new Map(own.map((c) => [c.id, c]));
  it("finds reachable own compositions", () => {
    expect([...reachableOwnCompositions(["b"], byId)].sort()).toEqual(["a", "b"]);
  });
  it("detects cycles before they are saved", () => {
    expect(wouldCreateCycle("a", "b", byId)).toBe(true); // b already contains a
    expect(wouldCreateCycle("a", "a", byId)).toBe(true);
    expect(wouldCreateCycle("b", "a", byId)).toBe(false);
  });
});
