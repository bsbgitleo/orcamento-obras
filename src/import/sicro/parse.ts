// src/import/sicro/parse.ts
// Parsers for the DNIT SICRO reports (layout verified on DF 07/2026):
//
//   Sintético de Mão de Obra      A código P9xxx | B descrição | C unidade | D custo (4 casas)
//   Sintético de Equipamentos     A código E9xxx | B descrição | … | J custo produtivo | K custo improdutivo
//   Sintético de Materiais        A código Mxxxx | B descrição | C unidade | D preço (em branco em alguns)
//   Sintético de Composições      A código (7 díg.) | B descrição | C unidade | D custo (2 casas)
//   Origem de Preços (ENTREGA)    linha 5: CÓDIGO | DESCRIÇÃO | UNIDADE | AC | AM … (uma coluna por UF)
//   Analítico de Composições      um bloco por composição:
//     "SISTEMA DE CUSTOS…" | UF | | | | G "FIC" | H fic
//     "Custo Unitário de Referência" | | | "Julho/2026" | | | G "Produção da equipe" | H produção | I unidade
//     código | descrição
//     "A - EQUIPAMENTOS"  código | desc | C qtd | D util. operativa | E util. improdutiva | F produtivo | G improdutivo
//     "B - MÃO DE OBRA"   código | desc | C qtd | D un | F custo
//     "C - MATERIAL"      código | desc | C qtd | D un | F preço
//     "D - ATIVIDADES AUXILIARES"  código | desc | C qtd | D un | F custo
//     "E - TEMPO FIXO"    material | desc | C código da comp. de tempo fixo | D qtd (t)
//     "F - MOMENTO DE TRANSPORTE"  material | desc | C qtd (tkm) | E LN | F RP | G P (códigos)
//     linhas sem código com "(10.00%)" na coluna G: acréscimo percentual do grupo
import Decimal from "decimal.js";
import type ExcelJS from "exceljs";
import { cellText } from "../sinapi/cell";
import { rowValues, streamSheets, readSheetNames } from "../sinapi/workbook";
import { compositionCode7, parseSicroMonth, type SicroComposition, type SicroInput, type SicroItem } from "./types";

/** Numeric cell → decimal string rounded to `places` (DNIT files carry float noise, e.g. 26.747699999999998). */
export function num(v: ExcelJS.CellValue, places: number): string | null {
  let n: number | null = null;
  if (typeof v === "number") n = v;
  else if (v && typeof v === "object" && "result" in v && typeof v.result === "number") n = v.result;
  else {
    const t = cellText(v).replace(/\s/g, "");
    if (/^-?\d+([.,]\d+)?(E-?\d+)?$/i.test(t)) n = Number(t.replace(",", "."));
  }
  if (n === null || !Number.isFinite(n)) return null;
  return new Decimal(n).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toString();
}

async function firstSheet(path: string, onRow: (v: ExcelJS.CellValue[]) => void): Promise<void> {
  const names = await readSheetNames(path);
  const first = names.get(Math.min(...names.keys()));
  if (!first) throw new Error(`Planilha sem abas: ${path}`);
  await streamSheets(path, { [first]: async (ws) => { for await (const row of ws) onRow(rowValues(row)); } });
}

export async function parseLabor(path: string): Promise<SicroInput[]> {
  const out: SicroInput[] = [];
  await firstSheet(path, (v) => {
    const code = cellText(v[1]);
    if (!/^P\d{4}$/.test(code)) return;
    out.push({ code, description: cellText(v[2]), unit: cellText(v[3]), kind: "MAO_DE_OBRA", unitPrice: num(v[4], 4), productiveCost: null, unproductiveCost: null, priceOrigin: null });
  });
  return out;
}

export async function parseEquipment(path: string): Promise<SicroInput[]> {
  const out: SicroInput[] = [];
  await firstSheet(path, (v) => {
    const code = cellText(v[1]);
    if (!/^E\d{4}$/.test(code)) return;
    const productive = num(v[10], 4);
    out.push({ code, description: cellText(v[2]), unit: "h", kind: "EQUIPAMENTO", unitPrice: productive, productiveCost: productive, unproductiveCost: num(v[11], 4), priceOrigin: null });
  });
  return out;
}

export async function parseMaterials(path: string): Promise<SicroInput[]> {
  const out: SicroInput[] = [];
  await firstSheet(path, (v) => {
    const code = cellText(v[1]);
    if (!/^M\d{4}$/.test(code)) return;
    out.push({ code, description: cellText(v[2]), unit: cellText(v[3]), kind: "MATERIAL", unitPrice: num(v[4], 4), productiveCost: null, unproductiveCost: null, priceOrigin: null });
  });
  return out;
}

export async function parseSyntheticCompositions(path: string): Promise<Map<string, { description: string; unit: string; cost: string | null }>> {
  const out = new Map<string, { description: string; unit: string; cost: string | null }>();
  await firstSheet(path, (v) => {
    const code = compositionCode7(cellText(v[1]));
    if (!/^\d{7}$/.test(code)) return;
    out.set(code, { description: cellText(v[2]), unit: cellText(v[3]), cost: num(v[4], 2) });
  });
  return out;
}

/** Price origin type per input code for one UF (column named by the UF in the header row). */
export async function parsePriceOrigin(path: string, uf: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let col = -1;
  await firstSheet(path, (v) => {
    if (col < 0) {
      if (cellText(v[1]).toUpperCase() === "CÓDIGO" || cellText(v[1]).toUpperCase() === "CODIGO") v.forEach((c, i) => { if (cellText(c).toUpperCase() === uf) col = i; });
      return;
    }
    const code = cellText(v[1]);
    const t = cellText(v[col]);
    if (code && t) out.set(code, t);
  });
  return out;
}

const SECTION = /^([A-F])\s*-\s*/;
const PERCENT = /\((\d+(?:[.,]\d+)?)\s*%\)\s*$/;

export interface ParsedAnalytic { referenceMonth: string | null; compositions: SicroComposition[] }

export async function parseAnalytic(path: string, onProgress?: (m: string) => void): Promise<ParsedAnalytic> {
  const compositions: SicroComposition[] = [];
  let referenceMonth: string | null = null;
  let cur: SicroComposition | null = null;
  let headerRow = 0; // 1 = produção, 2 = código
  let section: string | null = null;

  await firstSheet(path, (v) => {
    const a = cellText(v[1]);
    if (/^SISTEMA DE CUSTOS/i.test(a)) {
      cur = { code: "", description: "", unit: "", production: null, fic: /FIC/i.test(cellText(v[7])) ? num(v[8], 5) : null, publishedCost: null, items: [] };
      compositions.push(cur);
      headerRow = 1; section = null;
      if (compositions.length % 1000 === 0) onProgress?.(`   ${compositions.length} composições lidas…`);
      return;
    }
    if (!cur) return;
    const c: SicroComposition = cur;
    if (headerRow === 1) {
      referenceMonth ??= parseSicroMonth(cellText(v[4]));
      c.production = num(v[8], 7);
      c.unit = cellText(v[9]);
      headerRow = 2;
      return;
    }
    if (headerRow === 2) {
      c.code = compositionCode7(a);
      c.description = cellText(v[2]);
      headerRow = 0;
      return;
    }
    const sec = SECTION.exec(a);
    if (sec) { section = sec[1]; return; }
    if (!section) return;
    const g = cellText(v[7]);
    if (!a) {
      const m = PERCENT.exec(g);
      if (m && num(v[9], 4) !== null && (section === "A" || section === "B" || section === "C" || section === "D")) {
        c.items.push({ group: "PCT", section, percent: m[1].replace(",", "."), label: g });
      }
      return;
    }
    if (/^Obs/i.test(a)) { section = null; return; }
    let item: SicroItem | null = null;
    switch (section) {
      case "A": item = { group: "A", code: a, coefficient: num(v[3], 7) ?? "0", operativeUse: num(v[4], 5) ?? "0", unproductiveUse: num(v[5], 5) ?? "0" }; break;
      case "B": case "C": item = { group: section, code: a, coefficient: num(v[3], 7) ?? "0" }; break;
      case "D": item = { group: "D", compositionCode: compositionCode7(a), coefficient: num(v[3], 7) ?? "0" }; break;
      case "E": {
        const tf = cellText(v[3]);
        if (tf) item = { group: "E", materialCode: a, compositionCode: compositionCode7(tf), coefficient: num(v[4], 7) ?? "0" };
        break;
      }
      case "F": item = { group: "F", materialCode: a, coefficient: num(v[3], 7) ?? "0", transportCodes: [v[5], v[6], v[7]].map((x) => compositionCode7(cellText(x))).filter(Boolean) }; break;
    }
    if (item) c.items.push(item);
  });
  return { referenceMonth, compositions };
}
