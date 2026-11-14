// src/core/transport.test.ts
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { Catalog, Composition, InputItem, PriceSource } from "./composition";
import { materialWeights, transportMoments } from "./transport";

const source: PriceSource = { origin: "SICRO", uf: "DF", referenceMonth: "2026-07", regime: "NAO_DESONERADO" };
const T = ["5914449", "5914464", "5914479"]; // LN, RP, P — caminhão carroceria 15 t
const input = (id: string): InputItem => ({ id, code: id, description: `Material ${id}`, unit: "t", kind: "MATERIAL", unitPrice: "1", source });
const comp = (id: string, items: Composition["items"]): Composition => ({ id, code: id, description: id, unit: "un", source, method: "SICRO", production: "1", fic: null, items });

function catalog(comps: Composition[], inputs: InputItem[]): Catalog {
  const cm = new Map(comps.map((c) => [c.id, c])), im = new Map(inputs.map((i) => [i.id, i]));
  return { getComposition: (id) => cm.get(id), getInput: (id) => im.get(id) };
}

// 0308308 (apoio metálico): transporta M2758 (0,038 t/un) e usa 0,02305 m³ de microconcreto 1108059,
// cujo cimento M0424 pesa 0,45 t/m³ (fictício) — também precisa ser transportado.
const cat = catalog([
  comp("0308308", [
    { type: "INSUMO", inputId: "M2758", coefficient: "1", group: "C" },
    { type: "COMPOSICAO_AUXILIAR", compositionId: "1108059", coefficient: "0.02305", group: "D" },
    { type: "COMPOSICAO_AUXILIAR", compositionId: "5915373", coefficient: "0.038", group: "E" },
    { type: "TRANSPORTE", inputId: "M2758", coefficient: "0.038", transportCodes: T },
  ]),
  comp("1108059", [
    { type: "INSUMO", inputId: "M0424", coefficient: "0.45", group: "C" },
    { type: "TRANSPORTE", inputId: "M0424", coefficient: "0.45", transportCodes: T },
  ]),
  comp("5915373", [{ type: "TRANSPORTE", inputId: "M9999", coefficient: "99", transportCodes: T }]), // tempo fixo: não atravessa
  comp("0307731", [{ type: "TRANSPORTE", inputId: "M2758", coefficient: "0.0032", transportCodes: T }]),
], [input("M2758"), input("M0424"), input("M9999")]);

describe("momento de transporte (SICRO)", () => {
  const services = [
    { nodeId: "a", compositionKey: "0308308", quantity: "2" },
    { nodeId: "b", compositionKey: "0307731", quantity: "10" },
  ];

  it("soma o peso por material, atravessando auxiliares e não o tempo fixo", () => {
    const w = materialWeights(services, cat);
    expect(w.map((m) => [m.code, m.weight.toString()])).toEqual([
      ["M0424", "0.020745"], // 2 × 0,02305 × 0,45
      ["M2758", "0.108"], // 2 × 0,038 + 10 × 0,0032
    ]);
    expect(w[0].transportCodes).toEqual({ LN: "5914449", RP: "5914464", P: "5914479" });
  });

  it("momento = peso × DMT por via; FIT só na pavimentada; ajuste por material", () => {
    const w = materialWeights(services, cat);
    const dmt = (code: string) => (code === "M2758" ? { LN: 0, RP: 3, P: 120 } : { LN: 0, RP: 3, P: 35 });
    const lines = transportMoments(w, dmt, "1.1");
    expect(lines.map((l) => [l.code, l.road, l.moment.toString()])).toEqual([
      // RP: 0,020745 × 3 = 0,062235 → 0,0622 ; 0,108 × 3 = 0,324
      ["5914464", "RP", "0.3862"],
      // P: 0,020745 × 35 × 1,1 = 0,7986825 → 0,7987 ; 0,108 × 120 × 1,1 = 14,256
      ["5914479", "P", "15.0547"],
    ]);
  });

  it("sem DMT não há momento", () => {
    const w = materialWeights(services, cat);
    expect(transportMoments(w, () => ({ LN: 0, RP: 0, P: 0 }))).toEqual([]);
    expect(new Decimal(0).isZero()).toBe(true);
  });
});
