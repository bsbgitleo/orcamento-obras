// src/lib/project-code.test.ts
import { describe, expect, it } from "vitest";
import { formatProjectCode, nextProjectCode, nextSequentialCode } from "./project-code";

describe("project code", () => {
  it("formata com 4 dígitos", () => {
    expect(formatProjectCode(1)).toBe("ORC-0001");
    expect(formatProjectCode(12345)).toBe("ORC-12345");
  });
  it("gera o próximo após o maior existente", () => {
    expect(nextProjectCode([])).toBe("ORC-0001");
    expect(nextProjectCode(["ORC-0003", "ORC-0001", "LEGADO-9"])).toBe("ORC-0004");
  });
});

describe("nextSequentialCode", () => {
  it("numera por prefixo e ignora códigos fora do padrão", () => {
    expect(nextSequentialCode("CP-", [])).toBe("CP-0001");
    expect(nextSequentialCode("CP-", ["CP-0002", "CP-0010", "MINHA-1", "IP-0099"])).toBe("CP-0011");
    expect(nextSequentialCode("A.B(", ["A.B(0003", "AXB(0009"])).toBe("A.B(0004");
  });
});
