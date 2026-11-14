// src/core/sheet-import.test.ts
import { describe, expect, it } from "vitest";
import { detectLayout, interpretRows, normalizeCode, parseNumber, sourceOrigin, type Cell } from "./sheet-import";

// Layout do modelo de homogeneização (Anexo II, SQS 211 Bloco G)
const bidder: Cell[][] = [
  ["PLANILHA PADRÃO PARA APRESENTAÇÃO DE PROPOSTA (HOMOGENEIZAÇÃO)"],
  ["Condomínio do Bloco G da SQS 211 — Fase 1"],
  [],
  ["Empresa:", null, null, null, "CNPJ:", null, null, "Validade:"],
  ["RT / CREA:", null, null, null, "Prazo:", null, null, "Acesso:"],
  ["ATENÇÃO: a especificação (coluna C)…"],
  [],
  ["Item", "Descrição do serviço", "Especificação técnica, materiais e procedimento", "Critério de medição e aceitação", "Und", "Quant.", "Marca / produto ofertado", "Preço unit. (c/ BDI)", "Preço total"],
  ["1", "SERVIÇOS PRELIMINARES, SEGURANÇA E ADMINISTRAÇÃO LOCAL", null, null, null, null, null, null, 0],
  ["1.1", "Anotação de Responsabilidade Técnica (ART)", "Registro da ART…", "Medido em unidade…", "un", 1, "não se aplica", 500, 500],
  ["1.4", "Isolamento e sinalização", "Isolamento da projeção…", "Medido por metro linear…", "m", 97.25, "não se aplica", 10, 972.5],
  ["2", "ACESSO ÀS FACHADAS — BALANCIM", null, null, null, null, null, null, 0],
  ["2.3", "Ponto de ancoragem definitiva em aço inox", "Ponto de ancoragem…", "Medido por ponto…", "un", 30, null, 95, 2850],
  [],
  ["TOTAL DA PROPOSTA", null, null, null, null, null, null, null, 4322.5],
  [null, "DECLARAÇÃO: a proponente declara…"],
];

// Layout da exportação do próprio app (aba Sintética)
const own: Cell[][] = [
  ["PLANILHA ORÇAMENTÁRIA SINTÉTICA"], ["Empresa", "X"], ["Obra", "ORC-0001"], [], [], [], [], [], [],
  ["Item", "Código", "Fonte", "Descrição", "Und", "Quant.", "Custo unit.", "Custo total", "Preço unit. (c/ BDI)", "Preço total", "Peso"],
  ["1", null, null, "Revestimentos", null, null, null, 2542.7, null, 3148.4, 1],
  ["1.1", "104658", "SINAPI", "PISO PODOTÁTIL", "M2", 10, 186.4, 1864, 230.87, 2308.7, 0.73],
  ["1.2", "CP-0001", "Própria", "CHAPISCO", "M2", 100, 6.24, 624, 7.72, 772, 0.25],
  [],
  [null, null, null, "TOTAL GERAL", null, null, null, 2542.7, null, 3148.4],
];

describe("detectLayout", () => {
  it("reconhece o modelo de homogeneização (preço com BDI, marca, especificação)", () => {
    const l = detectLayout(bidder)!;
    expect(l.headerRow).toBe(7);
    expect(l.roles).toEqual(["item", "description", "specification", "criteria", "unit", "quantity", "brand", "price", "ignore"]);
    expect(l.priceMode).toBe("WITH_BDI");
  });

  it("reconhece a exportação do app e escolhe o custo (sem BDI)", () => {
    const l = detectLayout(own)!;
    expect(l.headerRow).toBe(9);
    expect(l.roles).toEqual(["item", "code", "source", "description", "unit", "quantity", "price", "ignore", "ignore", "ignore", "ignore"]);
    expect(l.priceMode).toBe("COST");
  });

  it("retorna null quando não há cabeçalho", () => {
    expect(detectLayout([["a", "b"], [1, 2]])).toBeNull();
  });
});

describe("interpretRows", () => {
  it("monta etapas e serviços pela numeração e para no total", () => {
    const lines = interpretRows(bidder, detectLayout(bidder)!);
    expect(lines.map((l) => [l.kind, l.item, l.parent])).toEqual([
      ["STAGE", "1", null], ["SERVICE", "1.1", 0], ["SERVICE", "1.4", 0], ["STAGE", "2", null], ["SERVICE", "2.3", 3],
    ]);
    expect(lines[2]).toMatchObject({ quantity: "97.25", price: "10", unit: "m", requiresBrand: false, specification: "Isolamento da projeção…" });
    expect(lines[4].requiresBrand).toBe(true); // coluna de marca vazia
  });

  it("lê código e fonte da exportação do app", () => {
    const lines = interpretRows(own, detectLayout(own)!);
    expect(lines.filter((l) => l.kind === "SERVICE").map((l) => [l.code, l.source, l.price])).toEqual([["104658", "SINAPI", "186.4"], ["CP-0001", "Própria", "6.24"]]);
    expect(lines).toHaveLength(3);
  });

  it("sem numeração: serviços na última etapa; serviços soltos ganham a etapa 'Serviços'", () => {
    const rows: Cell[][] = [
      ["Descrição", "Unidade", "Quantidade", "Valor unitário"],
      ["Pintura de parede", "m2", "120,5", "R$ 18,90"],
      ["ALVENARIA", null, null, null],
      ["Bloco cerâmico 14x19", "m2", "1.234,56", "45,00"],
    ];
    const lines = interpretRows(rows, detectLayout(rows)!);
    expect(lines.map((l) => [l.kind, l.description, l.parent])).toEqual([
      ["STAGE", "Serviços", null], ["SERVICE", "Pintura de parede", 0], ["STAGE", "ALVENARIA", null], ["SERVICE", "Bloco cerâmico 14x19", 2],
    ]);
    expect(lines[3].quantity).toBe("1234.56");
    expect(lines[1].price).toBe("18.90");
  });
});

describe("helpers", () => {
  it("números em formato brasileiro e americano", () => {
    expect(parseNumber("1.234,56")).toBe("1234.56");
    expect(parseNumber("12,5")).toBe("12.5");
    expect(parseNumber("1,234.50")).toBe("1234.50");
    expect(parseNumber("R$ 9,90")).toBe("9.90");
    expect(parseNumber(97.25)).toBe("97.25");
    expect(parseNumber("vb")).toBeNull();
  });
  it("códigos e fontes", () => {
    expect(normalizeCode("SINAPI 87879")).toBe("87879");
    expect(normalizeCode("87879/SINAPI")).toBe("87879");
    expect(normalizeCode("0307731")).toBe("0307731");
    expect(normalizeCode("CP-0001")).toBe("CP-0001");
    expect(normalizeCode("")).toBeNull();
    expect(sourceOrigin("SINAPI")).toBe("SINAPI");
    expect(sourceOrigin("Composição própria")).toBe("PROPRIA");
    expect(sourceOrigin("DNIT/SICRO")).toBe("SICRO");
    expect(sourceOrigin(null)).toBeNull();
  });
});
