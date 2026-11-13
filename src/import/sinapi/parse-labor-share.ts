// src/import/sinapi/parse-labor-share.ts
// Streams "SINAPI_mao_de_obra_AAAA_MM.xlsx": share of labour in each
// composition's cost, per UF and regime (fraction 0–1).
//
// Layout verified on the 10/2026 file:
//   sheets "SEM Desoneração" / "COM Desoneração"
//   row 6 header: Grupo | Código da Composição | Descrição | Unidade | <UF...>
import { cellDecimal, cellText } from "./cell";
import { rowValues, streamSheets } from "./workbook";
import { SINAPI_LABOR_SHEETS, type SinapiRegime } from "./types";

export async function parseLaborShareWorkbook(
  path: string,
  opts: { uf: string; regime: SinapiRegime },
): Promise<Map<string, string>> {
  const sheetName = SINAPI_LABOR_SHEETS[opts.regime];
  const result = new Map<string, string>();
  if (!sheetName) return result; // SEM_ENCARGOS has no labour-share report
  const uf = opts.uf.toUpperCase();

  await streamSheets(path, {
    [sheetName]: async (ws) => {
      let ufCol = -1;
      for await (const row of ws) {
        const v = rowValues(row);
        if (ufCol < 0) {
          v.forEach((c, i) => { if (cellText(c) === uf) ufCol = i; });
          continue;
        }
        const code = cellText(v[2]);
        if (!code) continue;
        const share = cellDecimal(v[ufCol]);
        if (share !== null) result.set(code, share);
      }
      if (ufCol < 0) throw new Error(`UF ${uf} não encontrada na aba ${sheetName}`);
    },
  });
  return result;
}
