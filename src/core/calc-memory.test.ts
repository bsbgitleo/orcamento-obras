// src/core/calc-memory.test.ts — memória de cálculo com os parâmetros da SQS 211 G (modelo arquivado)
import { describe, expect, it } from "vitest";
import { evaluateMemory, parseFormula, toExcelFormula, type MemoryParam } from "./calc-memory";
import { formatItemList } from "./item-list";

const p = (code: string, value: string | null, formula: string | null = null): MemoryParam => ({ code, value, formula });
const sqs211 = [
  p("L", "11.25"), p("C", "80.25"), p("PER", null, "2 * (L + C)"), p("NE", "2"), p("HT", "15,47"),
  p("AT", null, "L × HT × NE"), p("D1", "0.25"), p("D6", "0.1"), p("FE", null, "L*HT*(D1+D6)"), p("PD", "0.3"),
  p("BD", "0.3"), p("BS", "0.2"), p("FED", null, "FE*PD"), p("FES", null, "FE*(1-PD)"), p("AED", null, "FED*BD"), p("AER", null, "AED+FES*BS"),
  p("CB", "3"), p("NPE", null, "ARREDONDAR.PARA.CIMA(L/CB;0)*NE"), p("ESP", "2,1"), p("NAE", null, "(roundup(L/ESP)+1)*NE"),
  p("NAT", null, "ROUNDUP(PER/ESP; 0)"),
];

describe("memória de cálculo", () => {
  it("reproduz os valores do modelo da SQS 211 G", () => {
    const r = evaluateMemory(sqs211);
    const v = (c: string) => r.get(c)?.value?.toString();
    expect([v("PER"), v("AT"), v("FE"), v("AER"), v("NPE"), v("NAE"), v("NAT")])
      .toEqual(["183", "348.075", "60.913125", "14.01001875", "8", "14", "88"]);
  });

  it("aponta sigla inexistente, referência circular, divisão por zero e quem depende do erro", () => {
    const r = evaluateMemory([p("A", null, "B + X"), p("B", "1"), p("C", null, "D * 2"), p("D", null, "C + 1"), p("E", null, "B / (B - 1)"), p("F", null, "A * 2"), p("G", null)]);
    expect(r.get("A")?.error).toBe("sigla inexistente: X");
    expect(r.get("C")?.error).toMatch(/referência circular/);
    expect(r.get("D")?.error).toMatch(/referência circular/);
    expect(r.get("E")?.error).toBe("divisão por zero");
    expect(r.get("F")?.error).toBe("depende de A, que tem erro");
    expect(r.get("G")?.error).toBe("sem valor");
    expect(r.get("B")?.value?.toString()).toBe("1");
  });

  it("erros de sintaxe com mensagem clara", () => {
    expect(() => parseFormula("2 * (L + C")).toThrow("falta fechar parêntese");
    expect(() => parseFormula("FOO(1)")).toThrow("função desconhecida: FOO");
    expect(() => parseFormula("ROUND(1;2;3)")).toThrow("número de argumentos");
    expect(() => parseFormula("2 $ 3")).toThrow('caractere inválido: "$"');
  });

  it("traduz para o Excel com as células da coluna de valor", () => {
    const cell = (c: string) => ({ L: "$C$6", HT: "$C$10", NE: "$C$9", CB: "$C$62" } as Record<string, string>)[c] ?? null;
    expect(toExcelFormula("L × HT × NE", cell)).toBe("$C$6*$C$10*$C$9");
    expect(toExcelFormula("arredondar.para.cima(L/CB)*NE", cell)).toBe("ROUNDUP($C$6/$C$62,0)*$C$9");
    expect(toExcelFormula("ROUND(L*1,5; 2)", cell)).toBe("ROUND($C$6*1.5,2)");
    expect(toExcelFormula("L + X", cell)).toBeNull();
  });
});


describe("itens da planilha de um material", () => {
  const ordered = ["1.1", "1.2", "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "4.1", "4.7", "5.3"];
  it("três ou mais seguidos da mesma etapa viram intervalo", () => {
    expect(formatItemList(ordered, ["3.3", "4.7", "5.3"])).toBe("3.3, 4.7, 5.3");
    expect(formatItemList(ordered, ["3.6", "3.4", "3.5"])).toBe("3.4 a 3.6");
    expect(formatItemList(ordered, ["1.1", "1.2", "3.1", "3.2"])).toBe("1.1, 1.2, 3.1, 3.2");
  });
});
