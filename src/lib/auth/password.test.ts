// src/lib/auth/password.test.ts
import { describe, expect, it } from "vitest";
import { generateInitialPassword, hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verifica a senha correta e rejeita a errada", async () => {
    const h = await hashPassword("segredo-123");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("segredo-123", h)).toBe(true);
    expect(await verifyPassword("segredo-124", h)).toBe(false);
  });
  it("gera hashes diferentes para a mesma senha (salt)", async () => {
    expect(await hashPassword("x")).not.toBe(await hashPassword("x"));
  });
  it("rejeita formato inválido sem lançar", async () => {
    expect(await verifyPassword("x", "md5$abc")).toBe(false);
  });
  it("senha inicial tem 12 caracteres sem ambiguidade (0/O, 1/l/I)", () => {
    const p = generateInitialPassword();
    expect(p).toHaveLength(12);
    expect(p).not.toMatch(/[0OIl1]/);
  });
});
