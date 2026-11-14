// src/core/sicro.test.ts
// Values from the DNIT "Relatório Analítico de Composições de Custos", DF 07/2026.
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateCompositionCost, explodeInputs, type Catalog, type Composition, type InputItem, type PriceSource } from "./composition";

const source: PriceSource = { origin: "SICRO", uf: "DF", referenceMonth: "2026-07", regime: "NAO_DESONERADO" };
const input = (id: string, unitPrice: string | null, extra: Partial<InputItem> = {}): InputItem =>
  ({ id, code: id, description: id, unit: "un", kind: "MATERIAL", unitPrice, source, ...extra });

function catalog(comps: Composition[], inputs: InputItem[]): Catalog {
  const cm = new Map(comps.map((c) => [c.id, c]));
  const im = new Map(inputs.map((i) => [i.id, i]));
  return { getComposition: (id) => cm.get(id), getInput: (id) => im.get(id) };
}

const sicro = (id: string, production: string, fic: string | null, items: Composition["items"]): Composition =>
  ({ id, code: id, description: id, unit: "un", source, method: "SICRO", production, fic, items });

const inputs: InputItem[] = [
  input("P9821", "33.3312", { kind: "MAO_DE_OBRA" }), // Pedreiro
  input("P9801", "23.8081", { kind: "MAO_DE_OBRA" }), // Ajudante
  input("P9830", "35.1680", { kind: "MAO_DE_OBRA" }), // Montador
  input("E9050", null, { kind: "EQUIPAMENTO", productiveCost: "419.5234", unproductiveCost: "218.4343" }), // Guindaste
  input("M0798", "147.6506"),
  input("M0786", "406.4511"),
  input("M2758", "4873.0222"),
];

describe("SICRO — método do DNIT", () => {
  it("0307731: mão de obra, FIC, material e tempo fixo → R$ 184,60", () => {
    const tf = sicro("5914655", "1", null, []); // tempo fixo, custo fixado abaixo pela composição auxiliar fictícia
    tf.items = [{ type: "INSUMO", inputId: "TF", coefficient: "1", group: "C" }];
    const cat = catalog([
      sicro("0307731", "2", "0.02844", [
        { type: "INSUMO", inputId: "P9821", coefficient: "2", group: "B" },
        { type: "INSUMO", inputId: "M0798", coefficient: "1", group: "C" },
        { type: "INSUMO", inputId: "M0786", coefficient: "0.00627", group: "C" },
        { type: "COMPOSICAO_AUXILIAR", compositionId: "5914655", coefficient: "0.0032", group: "E" },
        { type: "COMPOSICAO_AUXILIAR", compositionId: "5914655", coefficient: "0.00007", group: "E" },
        { type: "TRANSPORTE", inputId: "M0798", coefficient: "0.0032", transportCodes: ["5914449", "5914464", "5914479"] },
      ]),
      tf,
    ], [...inputs, input("TF", "36.90")]);
    const r = calculateCompositionCost("0307731", cat);
    // execução 33,3312 ; FIC 0,9479 ; material 150,1990 ; tempo fixo 0,1181 + 0,0026
    expect(r.unitCost.toFixed(2)).toBe("184.60");
    expect(r.transportPending).toBe(true);
    expect(r.incomplete).toBe(false);
  });

  it("0308308: FIC sobre o custo improdutivo do equipamento + mão de obra → R$ 5.112,79", () => {
    const cat = catalog([
      sicro("0308308", "2", "0.02986", [
        { type: "INSUMO", inputId: "E9050", coefficient: "0.48193", group: "A", operativeUse: "1", unproductiveUse: "0" },
        { type: "INSUMO", inputId: "P9801", coefficient: "4", group: "B" },
        { type: "INSUMO", inputId: "P9830", coefficient: "1", group: "B" },
        { type: "INSUMO", inputId: "M2758", coefficient: "1", group: "C" },
        { type: "COMPOSICAO_AUXILIAR", compositionId: "1108059", coefficient: "0.02305", group: "D" },
        { type: "COMPOSICAO_AUXILIAR", compositionId: "5915373", coefficient: "0.038", group: "E" },
      ]),
      sicro("1108059", "1", null, [{ type: "INSUMO", inputId: "AUX", coefficient: "1", group: "C" }]),
      sicro("5915373", "1", null, [{ type: "INSUMO", inputId: "TF2", coefficient: "1", group: "C" }]),
    ], [...inputs, input("AUX", "3001.22"), input("TF2", "20.48")]);
    const r = calculateCompositionCost("0308308", cat);
    // execução 166,2907 ; FIC 3,5186 (e não 166,2907 × 0,02986) ; material 4.873,0222 ; auxiliar 69,1781 ; tempo fixo 0,7782
    expect(r.unitCost.toFixed(2)).toBe("5112.79");
    expect(r.breakdown.labor.minus(r4(130.4004 / 2)).toFixed(4)).toBe("3.5186"); // mão de obra/h ÷ produção + FIC
  });

  it("linhas percentuais somam o grupo até ali (Despesas diversas… 5,00 %)", () => {
    const cat = catalog([
      sicro("7119788", "1", null, [
        { type: "INSUMO", inputId: "P9821", coefficient: "3", group: "B" },
        { type: "PERCENTUAL", group: "B", percent: "5" },
      ]),
    ], inputs);
    // 3 × 33,3312 = 99,9936 ; + 5 % = 4,9997 → 104,9933 → 104,99
    expect(calculateCompositionCost("7119788", cat).unitCost.toFixed(2)).toBe("104.99");
  });

  it("insumo sem preço deixa a composição incompleta; explosão divide equipe pela produção", () => {
    const cat = catalog([
      sicro("X", "4", "0", [
        { type: "INSUMO", inputId: "P9821", coefficient: "2", group: "B" },
        { type: "INSUMO", inputId: "SEM", coefficient: "1", group: "C" },
      ]),
    ], [...inputs, input("SEM", null)]);
    expect(calculateCompositionCost("X", cat).incomplete).toBe(true);
    const q = explodeInputs("X", cat, 10);
    expect(q.get("P9821")!.toString()).toBe("5"); // 10 × 2 h / 4 por hora
    expect(q.get("SEM")!.toString()).toBe("10");
  });
});

function r4(n: number): Decimal {
  return new Decimal(n).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}
