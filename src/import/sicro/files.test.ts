// src/import/sicro/files.test.ts
import { describe, expect, it } from "vitest";
import { classifySicroFiles } from "./files";
import { compositionCode7, parseSicroMonth } from "./types";

describe("SICRO files", () => {
  it("recognises the DNIT reports by name (with or without accents) and the UF", () => {
    const names = [
      "DF 07-2026 Relatório Analítico de Composições de Custos.xlsx",
      "DF 07-2026 Relatório Analítico de Composições de Custos.pdf",
      "DF 07-2026 Relatorio Sintetico de Composicoes de Custos.xlsx",
      "DF 07-2026 Relatório Sintético de Materiais.xlsx",
      "DF 07-2026 Relatório Sintético de Mão de Obra.xlsx",
      "DF 07-2026 Relatório Sintético de Mão de Obra - com desoneração.xlsx",
      "DF 07-2026 Relatório Sintético de Equipamentos.xlsx",
      "DF 07-2026 Relatório Sintético de Equipamentos - com desoneração.xlsx",
      "DF 07-2026 Relatório Sintético de Origem de Preços do SICRO.xlsx",
      "DF 07-2026 Relatório Analítico de Encargos Sociais e Trabalhistas.xlsx",
    ].map((n) => `/x/${n}`);
    const f = classifySicroFiles(names);
    expect(f.uf).toBe("DF");
    expect(f.analytic).toMatch(/Analítico de Composições de Custos\.xlsx$/);
    expect(f.syntheticCompositions).toMatch(/Composicoes/);
    expect(f.labor?.DESONERADO).toMatch(/com desoneração/);
    expect(f.labor?.NAO_DESONERADO).toMatch(/Mão de Obra\.xlsx$/);
    expect(f.equipment?.DESONERADO).toMatch(/com desoneração/);
    expect(f.priceOrigin).toMatch(/Origem/);
    expect(f.ignored).toHaveLength(2); // o PDF e os encargos
  });

  it("tolera acentos perdidos ou trocados (nomes dentro de ZIP, '_' no lugar de espaço)", () => {
    const f = classifySicroFiles(
      ["/u/01.xlsx", "/u/02.xlsx", "/u/03.xlsx", "/u/04.xlsx"],
      ["DF_07-2026_Relat+?rio_Anal+?tico_de_Composi+?+?es_de_Custos.xlsx", "DF 07-2026 RelatÃ³rio SintÃ©tico de MÃ£o de Obra - com desoneraÃ§Ã£o.xlsx",
        "DF 07-2026 Relatorio Sintetico de Mao de Obra.xlsx", "DF 07-2026 Relatório Sintético de Materiais.xlsx"],
    );
    expect(f).toMatchObject({ uf: "DF", analytic: "/u/01.xlsx", materials: "/u/04.xlsx", labor: { DESONERADO: "/u/02.xlsx", NAO_DESONERADO: "/u/03.xlsx" } });
  });

  it("reads 'Julho/2026' and pads composition codes to 7 digits", () => {
    expect(parseSicroMonth("Julho/2026")).toBe("2026-07");
    expect(parseSicroMonth("março / 2027")).toBe("2027-03");
    expect(parseSicroMonth("Jul/2026")).toBeNull();
    expect(compositionCode7("307731")).toBe("0307731");
    expect(compositionCode7("M0798")).toBe("M0798");
  });
});
