// src/lib/project-code.test.ts
import { describe, expect, it } from "vitest";
import { formatProjectCode, nextProjectCode } from "./project-code";

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
