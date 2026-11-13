// src/lib/compositions/search.test.ts
import { describe, expect, it } from "vitest";
import { buildConditions, likePattern, tokenize } from "./search";

describe("tokenize", () => {
  it("separa palavras e ignora tokens de 1 caractere", () => {
    expect(tokenize("  alvenaria  bloco  14 x 19 ")).toEqual(["alvenaria", "bloco", "14", "19"]);
  });
});

describe("likePattern", () => {
  it("escapa curingas do LIKE", () => {
    expect(likePattern("50%_a", "contains")).toBe("%50\\%\\_a%");
    expect(likePattern("104", "prefix")).toBe("104%");
  });
});

describe("buildConditions", () => {
  const ids = ["t1"];
  const sqlOf = (p: Parameters<typeof buildConditions>[0]) => buildConditions(p).map((s) => s.sql.replace(/\s+/g, " ").trim());
  it("código numérico → prefixo de código", () => {
    expect(sqlOf({ priceTableIds: ids, query: "1046" })[1]).toContain("c.code LIKE");
  });
  it("palavras-chave → uma condição unaccent por palavra", () => {
    const s = sqlOf({ priceTableIds: ids, query: "piso podotátil" });
    expect(s.length).toBe(3);
    expect(s[1]).toContain("unaccent(c.description) ILIKE unaccent(");
  });
  it("modo exato → uma condição só", () => {
    expect(sqlOf({ priceTableIds: ids, query: "piso podotátil", mode: "EXACT" }).length).toBe(2);
  });
  it("consulta vazia → só filtros de base/custo", () => {
    const s = sqlOf({ priceTableIds: ids, query: "  ", onlyWithCost: true });
    expect(s.length).toBe(2);
    expect(s[1]).toContain('"unitCost" IS NOT NULL');
  });
});
