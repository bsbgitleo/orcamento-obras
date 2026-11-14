// src/core/proposals/proposals.test.ts — leitura, casamento e comparação (#76–#79)
import { describe, expect, it } from "vitest";
import { compareProposals, matchLines, type ProposalIn, type RefItem } from "./compare";
import { parseProposalText, type TextItem } from "./pdf-text";
import { parseProposalGrid } from "./grid";

const ref: RefItem[] = [
  { nodeId: "A", item: "1.1", description: "Anotação de responsabilidade técnica", unit: "un", quantity: "10", unitPrice: "100" },
  { nodeId: "B", item: "1.2", description: "Placa de identificação da obra", unit: "un", quantity: "2", unitPrice: "50" },
  { nodeId: "C", item: "1.3", description: "Projeto estrutural do reforço", unit: "un", quantity: "1", unitPrice: "200" },
];

describe("casamento dos itens", () => {
  it("pela numeração (01.02 = 1.2), depois pela descrição; o resto é acrescentado", () => {
    const m = matchLines([
      { item: "01.02", description: "Placa" },
      { item: "9.9", description: "Projeto estrutural do reforço do teto" },
      { item: "1.4", description: "Container de canteiro" },
    ], ref);
    expect(m.map((l) => [l.nodeId, l.matchedBy])).toEqual([["B", "item"], ["C", "description"], [null, null]]);
  });
});

describe("mapa comparativo e equalização", () => {
  const p1: ProposalIn = {
    id: "p1", name: "Alfa", executionDays: 45, validityDays: 60, declaredTotal: "1680",
    lines: [
      { nodeId: "A", item: "1.1", description: "", unit: "un", quantity: "10", unitPrice: "110", totalPrice: "1100" },
      { nodeId: "B", item: "1.2", description: "", unit: "un", quantity: "2", unitPrice: "40", totalPrice: null },
      { nodeId: "C", item: "1.3", description: "", unit: "un", quantity: "1", unitPrice: null, totalPrice: null },
      { nodeId: null, item: "1.4", description: "Container", unit: "mês", quantity: "1", unitPrice: "500", totalPrice: "500" },
    ],
  };
  const p2: ProposalIn = {
    id: "p2", name: "Beta", executionDays: 30, validityDays: 30, declaredTotal: "1400",
    lines: [
      { nodeId: "A", item: "1.1", description: "", unit: "un", quantity: "10", unitPrice: "90", totalPrice: "900" },
      { nodeId: "B", item: "1.2", description: "", unit: "un", quantity: "3", unitPrice: "60", totalPrice: "180" },
      { nodeId: "C", item: "1.3", description: "", unit: "un", quantity: "1", unitPrice: "300", totalPrice: "300" },
    ],
  };
  const c = compareProposals(ref, [p1, p2], { maxExecutionDays: 30, minValidityDays: 60 });

  it("item sem preço recebe o maior preço das demais; quantidade do orçamento", () => {
    const C = c.rows[2];
    expect(C.cells[0].flags).toEqual(["sem-preco", "preenchido"]);
    expect(C.cells[0].equalizedTotal.toString()).toBe("300");
    // Beta mudou a quantidade de B (3 contra 2): sinalizado, equalizado com 2 × 60
    expect(c.rows[1].cells[1].flags).toContain("quantidade");
    expect(c.rows[1].cells[1].equalizedTotal.toString()).toBe("120");
    expect(c.rows[0].lowest).toBe(1);
  });

  it("alerta de ±30 % contra a mediana ou a referência", () => {
    expect(c.rows[0].cells[0].flags).toEqual([]); // +10 %
    expect(c.rows[2].cells[1].flags).toEqual(["acima"]); // 300 contra 200 de referência
  });

  it("totais, acrescentados à parte, soma declarada, prazo, validade e classificação", () => {
    const [a, b] = c.proposals;
    expect([a.equalizedTotal.toString(), a.quotedTotal.toString(), a.extrasTotal.toString(), a.extras.length]).toEqual(["1480", "1680", "500", 1]);
    expect(a.flags).toEqual(["prazo"]);
    expect([b.equalizedTotal.toString(), b.quotedTotal.toString(), b.arithmeticGap?.toString()]).toEqual(["1320", "1380", "20"]);
    expect(b.flags).toEqual(["validade", "soma"]);
    expect([a.rank, b.rank]).toEqual([2, 1]);
    expect(c.referenceTotal.toString()).toBe("1300");
  });

  it("total equalizado abaixo de 75 % do orçado: possível inexequível", () => {
    const low: ProposalIn = { ...p2, id: "p3", lines: p2.lines.map((l) => ({ ...l, unitPrice: String(Number(l.unitPrice) / 3), totalPrice: null })) };
    expect(compareProposals(ref, [low], { maxExecutionDays: null, minValidityDays: null }).proposals[0].flags).toContain("inexequivel");
  });
});

describe("leitura de PDF com texto", () => {
  const t = (str: string, x: number, y: number): TextItem => ({ str, x, y });
  const page: TextItem[] = [
    t("Empresa:", 60, 800), t("Construtora Alfa", 120, 800), t("Validade:", 600, 800), t("60 DIAS", 660, 800),
    t("Prazo", 600, 788), t("30 dias", 640, 784), t("CNPJ", 60, 784), t("11.222.333/0001-81", 120, 784),
    t("Item", 80, 740), t("Descrição do serviço", 160, 740), t("Und", 500, 740), t("Quant.", 540, 740), t("Preço unit.", 600, 746), t("Preço total", 690, 740),
    t("1", 84, 720), t("SERVIÇOS PRELIMINARES", 120, 718), t("R$ 1.100,00", 690, 716),
    // numeração no meio da descrição (duas linhas)
    t("Anotação de responsabilidade", 120, 706), t("1.1", 82, 700), t("técnica (ART)", 120, 700), t("un", 502, 701), t("10,00", 545, 699), t("R$ 110,00", 600, 699), t("R$ 1.100,00", 690, 699),
    t("1.2", 82, 680), t("Projeto estrutural", 120, 680), t("un", 502, 680), t("1,00", 548, 680), t("-", 640, 680),
    t("VALOR GLOBAL DA PROPOSTA", 400, 650), t("R$ 1.100,00", 690, 650),
  ];
  it("cabeçalho, etapas, itens, item sem preço e total", () => {
    const p = parseProposalText([page]);
    expect([p.company, p.document, p.validityDays, p.executionDays, p.declaredTotal]).toEqual(["Construtora Alfa", "11.222.333/0001-81", 60, 30, "1100.00"]);
    expect(p.lines.map((l) => [l.kind, l.item, l.description, l.unit, l.quantity, l.unitPrice, l.totalPrice])).toEqual([
      ["STAGE", "1", "SERVIÇOS PRELIMINARES", null, null, null, "1100.00"],
      ["SERVICE", "1.1", "Anotação de responsabilidade técnica (ART)", "un", "10.00", "110.00", "1100.00"],
      ["SERVICE", "1.2", "Projeto estrutural", "un", "1.00", null, null],
    ]);
  });
});

describe("leitura de planilha devolvida", () => {
  it("preço com BDI, total da linha e campos do cabeçalho", () => {
    const p = parseProposalGrid([
      ["Empresa:", "Construtora Beta", null, "Validade:", "90 dias"],
      ["Prazo:", "45 dias", null, "CNPJ:", "11.222.333/0001-81"],
      [],
      ["Item", "Descrição", "Und", "Quant.", "Custo unit.", "Preço unit. (c/ BDI)", "Preço total"],
      ["1", "Serviços preliminares", null, null, null, null, 1250],
      ["1.1", "ART", "un", 1, 400, 500, 500],
      ["1.2", "Placa", "un", 2, 300, 375, 750],
      ["1.3", "Projeto", "un", 1, null, null, null],
      ["TOTAL GERAL", null, null, null, null, null, 1250],
    ]);
    expect([p.company, p.validityDays, p.executionDays, p.document, p.declaredTotal]).toEqual(["Construtora Beta", 90, 45, "11.222.333/0001-81", "1250"]);
    expect(p.lines.filter((l) => l.kind === "SERVICE").map((l) => [l.item, l.unitPrice, l.totalPrice])).toEqual([["1.1", "500", "500"], ["1.2", "375", "750"], ["1.3", null, null]]);
  });
});
