// src/import/sinapi/parse-maintenance.ts
// Streams "SINAPI_Manutenções_AAAA_MM.xlsx" (Caixa): the cumulative, national
// log of changes to inputs and compositions (desativação, alteração de
// itens/coeficientes, de descrição, de unidade…).
//
// Layout verified on the 10/2026 file (34.393 linhas, desde 07/2009):
//   sheet "Manutenções"
//   row 3   A = "Mês de Referência:"  B = "10/2026"
//   row 6   header: Referência | Tipo | Código | Descrição | Manutenção
//   rows 7+ Referência = 1º dia do mês (data do Excel, ex. 46296 = 01/10/2026)
//           Tipo = INSUMO | COMPOSICAO
import type { CellValue } from "exceljs";
import { cellText, parseReferenceMonth } from "./cell";
import { readSheetRows } from "./workbook";

export const MAINTENANCE_SHEET = "Manutenções";

export interface ParsedMaintenance {
  referenceMonth: string; // "2026-10"
  itemType: "INSUMO" | "COMPOSICAO";
  code: string;
  description: string;
  maintenance: string;
}

export interface ParsedMaintenanceFile {
  /** Mês do arquivo ("2026-10") */
  fileMonth: string;
  rows: ParsedMaintenance[];
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Excel date (serial number, Date or "MM/AAAA" / "DD/MM/AAAA" text) → "AAAA-MM". */
export function monthFromCell(v: CellValue): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const d = new Date(EXCEL_EPOCH_MS + Math.round(v) * 86_400_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}`;
  const t = cellText(v);
  let m = /^(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1]}`;
  m = /^\d{2}\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})/.exec(t); // ISO date text
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

function normalizeType(t: string): "INSUMO" | "COMPOSICAO" | null {
  const u = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (u === "INSUMO") return "INSUMO";
  if (u === "COMPOSICAO") return "COMPOSICAO";
  return null;
}

export async function parseMaintenanceWorkbook(path: string): Promise<ParsedMaintenanceFile> {
  let fileMonth: string | null = null;
  let headerSeen = false;
  const rows: ParsedMaintenance[] = [];

  // The Caixa writes this file with namespace-prefixed XML (<x:row>), which the
  // exceljs streaming reader skips; the sheet is small enough to read whole.
  for (const v of await readSheetRows(path, MAINTENANCE_SHEET)) {
    if (!headerSeen) {
      const a = cellText(v[1]);
      if (/^m[eê]s de refer/i.test(a)) fileMonth = parseReferenceMonth(cellText(v[2]));
      if (/^refer[eê]ncia$/i.test(a) && /manuten/i.test(cellText(v[5]))) headerSeen = true;
      continue;
    }
    const referenceMonth = monthFromCell(v[1]);
    const itemType = normalizeType(cellText(v[2]));
    const code = cellText(v[3]);
    if (!referenceMonth || !itemType || !code) continue; // linhas em branco ou rodapé
    rows.push({ referenceMonth, itemType, code, description: cellText(v[4]), maintenance: cellText(v[5]) });
  }

  if (!headerSeen) throw new Error(`A aba "${MAINTENANCE_SHEET}" não tem o cabeçalho esperado (Referência | Tipo | Código | Descrição | Manutenção).`);
  if (!fileMonth) {
    // Sem a linha "Mês de Referência": usa a referência mais recente das linhas
    fileMonth = rows.reduce<string | null>((max, r) => (max === null || r.referenceMonth > max ? r.referenceMonth : max), null);
  }
  if (!fileMonth) throw new Error("Arquivo de manutenções sem linhas.");
  return { fileMonth, rows };
}
