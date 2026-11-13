// src/lib/schemas/budget.test.ts
import { describe, expect, it } from "vitest";
import { newBudgetSchema } from "./budget";
import { bdiSchema } from "./bdi";

const base = {
  type: "PUBLIC", name: "Obra X", clientId: "", category: "SCHOOL", uf: "DF", address: "", deadlineDays: "15",
  biddingModality: "", biddingNumber: "", biddingAgency: "SEE-DF", biddingOpensAt: "2026-12-15T10:00",
  socialChargesId: "sc1", bdiId: "b1", supplyBdiId: "", priceTableId: "pt1",
};

describe("newBudgetSchema", () => {
  it("aceita obra pública completa", () => {
    const r = newBudgetSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.deadlineDays).toBe(15); expect(r.data.clientId).toBeNull(); expect(r.data.useSupplyBdi).toBe(false); }
  });
  it("exige órgão licitante em obra pública", () => {
    const r = newBudgetSchema.safeParse({ ...base, biddingAgency: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "biddingAgency")).toBe(true);
  });
  it("não exige licitação em obra privada (campos desabilitados não são enviados)", () => {
    const { biddingAgency: _a, biddingModality: _m, biddingNumber: _n, biddingOpensAt: _o, deadlineDays: _d, ...rest } = base;
    void _a; void _m; void _n; void _o; void _d;
    const r = newBudgetSchema.safeParse({ ...rest, type: "PRIVATE" });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.biddingOpensAt).toBeNull(); expect(r.data.deadlineDays).toBeNull(); }
  });
  it("exige BDI de fornecimento quando marcado", () => {
    const r = newBudgetSchema.safeParse({ ...base, useSupplyBdi: "on" });
    expect(r.success).toBe(false);
    expect(newBudgetSchema.safeParse({ ...base, useSupplyBdi: "on", supplyBdiId: "b2" }).success).toBe(true);
  });
  it("aceita campos opcionais ausentes (ex.: select não renderizado)", () => {
    const { supplyBdiId: _s, clientId: _c, address: _a, ...rest } = base;
    void _s; void _c; void _a;
    expect(newBudgetSchema.safeParse(rest).success).toBe(true);
  });
  it("rejeita prazo não inteiro", () => {
    expect(newBudgetSchema.safeParse({ ...base, deadlineDays: "1,5" }).success).toBe(false);
  });
});

describe("bdiSchema", () => {
  const b = { name: "X", workType: "EDIFICACOES", centralAdministration: "4", insurance: "0,8", risk: "1.27", guarantee: "0", financialExpenses: "1,23", profit: "7,4", pis: "0,65", cofins: "3", iss: "3", cprb: "", notes: "" };
  it("normaliza vírgula decimal e CPRB vazia", () => {
    const r = bdiSchema.safeParse(b);
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.insurance).toBe("0.8"); expect(r.data.profit).toBe("7.4"); expect(r.data.cprb).toBe("0"); }
  });
  it("rejeita percentual fora de 0–100", () => {
    expect(bdiSchema.safeParse({ ...b, profit: "150" }).success).toBe(false);
    expect(bdiSchema.safeParse({ ...b, risk: "abc" }).success).toBe(false);
  });
});
