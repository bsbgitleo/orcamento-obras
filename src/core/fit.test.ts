// src/core/fit.test.ts — FIT pelo Volume 05 (2ª ed., 2025), contas feitas à mão.
import { describe, expect, it } from "vitest";
import { calculateFit, urbanConversionFactor, weightedVmd } from "./fit";

const base = { dmtRural: 0, dmtUrban: 0, vmdPerLane: null, stopGo: false, passesWorksite: true };

describe("FIT (Volume 05, 2025)", () => {
  it("VMD por faixa: média ponderada pela extensão dos segmentos (Eq. 1)", () => {
    expect(weightedVmd([{ lengthKm: 10, vmdPerLane: 4000 }, { lengthKm: 30, vmdPerLane: 6000 }])?.toString()).toBe("5500");
    expect(weightedVmd([])).toBeNull();
    expect(weightedVmd([{ lengthKm: 0, vmdPerLane: 9000 }])).toBeNull();
  });

  it("fator de conversão urbano: 60 s/km com 30 km/h; muda com a velocidade (Eq. 3)", () => {
    expect(urbanConversionFactor().toString()).toBe("60");
    expect(urbanConversionFactor(20).toDecimalPlaces(6).toString()).toBe("120");
  });

  it("PARE e SIGA: A1 = 70 + 0,0035 × VMDf; FIT = 1 + A1 ÷ (DMTp × 60)", () => {
    // A1 = 70 + 17,5 = 87,5 s; 87,5 ÷ 1.200 = 0,072916… → 1,0729
    const r = calculateFit({ ...base, dmtRural: 20, vmdPerLane: 5000, stopGo: true });
    expect([r.a1.toString(), r.fit.toString(), r.reason]).toEqual(["87.5", "1.0729", null]);
  });

  it("via urbana: A2 = 60 × DMTu; DMTp = rural + urbana", () => {
    // A2 = 300 s; 300 ÷ (15 × 60) = 0,3333… → 1,3333
    const r = calculateFit({ ...base, dmtRural: 10, dmtUrban: 5 });
    expect([r.a2.toString(), r.dmtPaved.toString(), r.fit.toString()]).toEqual(["300", "15", "1.3333"]);
  });

  it("os dois atrasos somam", () => {
    // (87,5 + 300) ÷ 900 = 0,430555… → 1,4306
    expect(calculateFit({ ...base, dmtRural: 10, dmtUrban: 5, vmdPerLane: 5000, stopGo: true }).fit.toString()).toBe("1.4306");
  });

  it("sem FIT: material que não passa pela obra, sem DMT pavimentada ou acima de 100 km", () => {
    expect(calculateFit({ ...base, dmtRural: 20, vmdPerLane: 5000, stopGo: true, passesWorksite: false })).toMatchObject({ reason: "sem-atraso" });
    expect(calculateFit({ ...base, stopGo: true })).toMatchObject({ reason: "sem-dmt" });
    const far = calculateFit({ ...base, dmtRural: 90, dmtUrban: 11, stopGo: true, vmdPerLane: 5000 });
    expect([far.fit.toString(), far.reason]).toEqual(["1", "acima-100km"]);
    expect(calculateFit({ ...base, dmtRural: 95, dmtUrban: 5 }).fit.toString()).toBe("1.05"); // 100 km ainda aplica: 300 ÷ 6.000
  });
});
