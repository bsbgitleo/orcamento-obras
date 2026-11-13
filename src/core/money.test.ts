// src/core/money.test.ts
import { describe, expect, it } from "vitest";
import { D, formatBRL, parseBRL, roundMoney, roundQuantity, sum, truncMoney } from "./money";

describe("truncMoney (decisão #5: itens truncados a 2 casas, como no SINAPI)", () => {
  it("trunca", () => {
    expect(truncMoney("1.009").toString()).toBe("1");
    expect(truncMoney("10.999").toString()).toBe("10.99");
    expect(truncMoney("0.9864").toString()).toBe("0.98");
  });
});

describe("roundMoney (exibição e BDI: ROUND_HALF_UP)", () => {
  it("arredonda meio para cima", () => {
    expect(roundMoney("1.005").toString()).toBe("1.01");
    expect(roundMoney("2.675").toString()).toBe("2.68"); // float daria 2.67
    expect(roundMoney("1.004").toString()).toBe("1");
  });
  it("não trunca", () => {
    expect(roundMoney("10.999").toString()).toBe("11");
  });
});

describe("roundQuantity (4 casas)", () => {
  it("arredonda a 4 casas", () => {
    expect(roundQuantity("0.12345").toString()).toBe("0.1235");
  });
});

describe("sum", () => {
  it("soma sem erro de ponto flutuante", () => {
    expect(sum(["0.1", "0.2"]).toString()).toBe("0.3");
  });
});

describe("formatBRL", () => {
  it("formata no padrão R$ 1.234,56", () => {
    expect(formatBRL("1234.56")).toBe("R$ 1.234,56");
    expect(formatBRL("0.5")).toBe("R$ 0,50");
    expect(formatBRL("1234567.891")).toBe("R$ 1.234.567,89");
    expect(formatBRL("-99.9")).toBe("-R$ 99,90");
  });
});

describe("parseBRL", () => {
  it("aceita formato brasileiro e internacional", () => {
    expect(parseBRL("R$ 1.234,56").eq(D("1234.56"))).toBe(true);
    expect(parseBRL("1234.56").eq(D("1234.56"))).toBe(true);
    expect(parseBRL("1,5").eq(D("1.5"))).toBe(true);
  });
  it("rejeita entrada inválida", () => {
    expect(() => parseBRL("abc")).toThrow();
  });
});
