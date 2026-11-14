// src/core/extenso.test.ts
import { describe, expect, it } from "vitest";
import { brlInWords, integerInWords } from "./extenso";

describe("valor por extenso", () => {
  it("inteiros", () => {
    expect(integerInWords(BigInt(0))).toBe("zero");
    expect(integerInWords(BigInt(16))).toBe("dezesseis");
    expect(integerInWords(BigInt(100))).toBe("cem");
    expect(integerInWords(BigInt(101))).toBe("cento e um");
    expect(integerInWords(BigInt(1000))).toBe("mil");
    expect(integerInWords(BigInt(1001))).toBe("mil e um");
    expect(integerInWords(BigInt(1100))).toBe("mil e cem");
    expect(integerInWords(BigInt(1234))).toBe("mil, duzentos e trinta e quatro");
    expect(integerInWords(BigInt(2000000))).toBe("dois milhões");
    expect(integerInWords(BigInt(1000001))).toBe("um milhão e um");
  });
  it("reais e centavos", () => {
    expect(brlInWords("14951.80")).toBe("quatorze mil, novecentos e cinquenta e um reais e oitenta centavos");
    expect(brlInWords("1")).toBe("um real");
    expect(brlInWords("0.01")).toBe("um centavo");
    expect(brlInWords("1000000")).toBe("um milhão de reais");
    expect(brlInWords("157644.43")).toBe("cento e cinquenta e sete mil, seiscentos e quarenta e quatro reais e quarenta e três centavos");
  });
});
