// src/import/sinapi/parse-reference.ts
// Streams "SINAPI_Referência_AAAA_MM.xlsx" (Caixa) and extracts, for one UF and
// one regime: inputs with prices, compositions with published costs, and the
// analytic tree (items + coefficients).
//
// Layout verified on the 10/2026 file:
//   ISD/ICD/ISE  row 3  B = "10/2026"; row 4 F.. = UF codes; rows 6/7 = encargos horista/mensalista
//                row 10 header: Classificação | Código | Descrição | Unidade | Origem de Preço | <UF...>
//   CSD/CCD/CSE  row 4 (CSE: row 9) E,G,I.. = UF codes (two columns per UF: Custo, %AS)
//                row 10 header: Grupo | Código (HYPERLINK formula) | Descrição | Unidade | ...
//   Analítico    row 10 header: Grupo | Código da Composição | Tipo Item | Código do Item |
//                Descrição | Unidade | Coeficiente | Situação
//                (rows with empty "Tipo Item" are the composition header rows)
import type ExcelJS from "exceljs";
import { cellDecimal, cellText, compositionCode, parseReferenceMonth } from "./cell";
import { rowValues, streamSheets } from "./workbook";
import {
  SINAPI_SHEETS,
  type ParseReferenceOptions,
  type ParsedComposition,
  type ParsedInput,
  type ParsedReference,
} from "./types";

const UF_RE = /^[A-Z]{2}$/;

function findUfColumns(row: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>();
  rowValues(row).forEach((v, idx) => {
    const t = cellText(v);
    if (UF_RE.test(t)) map.set(t, idx);
  });
  return map;
}

export async function parseReferenceWorkbook(
  path: string,
  opts: ParseReferenceOptions,
): Promise<ParsedReference> {
  const uf = opts.uf.toUpperCase();
  const fallbackUf = (opts.fallbackUf ?? "SP").toUpperCase();
  const sheets = SINAPI_SHEETS[opts.regime];
  const log = opts.onProgress ?? (() => {});

  let referenceMonth: string | null = null;
  let socialCharges: ParsedReference["socialCharges"] = null;
  const inputs: ParsedInput[] = [];
  const compositionsByCode = new Map<string, ParsedComposition>();

  const getComposition = (code: string, group = ""): ParsedComposition => {
    let c = compositionsByCode.get(code);
    if (!c) {
      c = { code, group, description: "", unit: "", referenceCost: null, asShare: null, status: null, items: [] };
      compositionsByCode.set(code, c);
    }
    return c;
  };

  await streamSheets(path, {
    [sheets.inputs]: async (ws) => {
      log(`Lendo insumos (${sheets.inputs})…`);
      let ufCols: Map<string, number> | null = null;
      let ufCol = -1;
      let fbCol = -1;
      for await (const row of ws) {
        const v = rowValues(row);
        if (row.number === 3) referenceMonth = parseReferenceMonth(cellText(v[2]));
        if (row.number === 4 && !ufCols) {
          const found = findUfColumns(row);
          if (found.size) ufCols = found;
        }
        if (row.number === 6 || row.number === 7) {
          // Horista / Mensalista rows carry the social charges per UF (ISD/ICD only)
          const label = cellText(v[5]);
          if (ufCols && (label === "Horista" || label === "Mensalista")) {
            const col = ufCols.get(uf);
            const val = col !== undefined ? cellDecimal(v[col]) : null;
            if (val !== null) {
              socialCharges = socialCharges ?? { hourly: "", monthly: "" };
              if (label === "Horista") socialCharges.hourly = val;
              else socialCharges.monthly = val;
            }
          }
        }
        if (row.number === 10) {
          // Header row; UF columns here are authoritative (ISE has no row-4 codes)
          ufCols = findUfColumns(row);
          ufCol = ufCols.get(uf) ?? -1;
          fbCol = ufCols.get(fallbackUf) ?? -1;
          if (ufCol < 0) throw new Error(`UF ${uf} não encontrada na aba ${sheets.inputs}`);
          continue;
        }
        if (row.number <= 10) continue;
        const code = cellText(v[2]);
        if (!code) continue;
        let unitPrice = cellDecimal(v[ufCol]);
        let priceFallbackUf: string | null = null;
        if (unitPrice === null && fbCol > 0) {
          unitPrice = cellDecimal(v[fbCol]);
          if (unitPrice !== null) priceFallbackUf = fallbackUf;
        }
        inputs.push({
          code,
          sourceClass: cellText(v[1]),
          description: cellText(v[3]),
          unit: cellText(v[4]),
          priceOrigin: cellText(v[5]) || null,
          unitPrice,
          priceFallbackUf,
        });
      }
      log(`  ${inputs.length} insumos`);
    },

    [sheets.compositions]: async (ws) => {
      log(`Lendo custos de composições (${sheets.compositions})…`);
      let costCol = -1;
      for await (const row of ws) {
        const v = rowValues(row);
        if (costCol < 0) {
          const found = findUfColumns(row);
          if (found.has(uf)) costCol = found.get(uf)!;
          continue;
        }
        if (row.number <= 10) continue;
        const code = compositionCode(v[2]);
        if (!code) continue;
        const comp = getComposition(code);
        comp.group = cellText(v[1]);
        comp.description = cellText(v[3]);
        comp.unit = cellText(v[4]);
        comp.referenceCost = cellDecimal(v[costCol]);
        comp.asShare = cellDecimal(v[costCol + 1]);
      }
      if (costCol < 0) throw new Error(`UF ${uf} não encontrada na aba ${sheets.compositions}`);
      log(`  ${compositionsByCode.size} composições`);
    },

    "Analítico": async (ws) => {
      log("Lendo árvore analítica (Analítico)…");
      let n = 0;
      for await (const row of ws) {
        if (row.number <= 10) continue;
        const v = rowValues(row);
        const compCode = cellText(v[2]);
        if (!compCode) continue;
        const itemType = cellText(v[3]);
        const comp = getComposition(compCode, cellText(v[1]));
        if (!itemType) {
          // composition header row
          comp.status = cellText(v[8]) || null;
          if (!comp.description) comp.description = cellText(v[5]);
          if (!comp.unit) comp.unit = cellText(v[6]);
          if (!comp.group) comp.group = cellText(v[1]);
          continue;
        }
        const coefficient = cellDecimal(v[7]);
        if (coefficient === null) continue;
        comp.items.push({
          type: itemType === "COMPOSICAO" ? "COMPOSICAO" : "INSUMO",
          code: cellText(v[4]),
          description: cellText(v[5]),
          unit: cellText(v[6]),
          coefficient,
          status: cellText(v[8]) || null,
        });
        n++;
      }
      log(`  ${n} itens`);
    },
  });

  if (!referenceMonth) throw new Error(`Aba ${sheets.inputs} não encontrada em ${path}`);

  // Inputs that appear in the analytic tree but not in the price sheet
  // (SINAPI situação "SEM PREÇO"): keep them, with no price, so the tree is complete.
  const known = new Set(inputs.map((i) => i.code));
  for (const comp of compositionsByCode.values()) {
    for (const it of comp.items) {
      if (it.type === "INSUMO" && !known.has(it.code)) {
        known.add(it.code);
        inputs.push({
          code: it.code, description: it.description, unit: it.unit,
          sourceClass: "", priceOrigin: null, unitPrice: null, priceFallbackUf: null,
        });
      }
    }
  }

  return {
    referenceMonth,
    uf,
    regime: opts.regime,
    socialCharges,
    inputs,
    compositions: [...compositionsByCode.values()],
  };
}
