// src/import/sinapi/run-import.ts
// One SINAPI import run: every UF × regime from the reference workbook (plus
// labour shares), cost cache and check against the published cost, and the
// maintenance log. Shared by the CLI (scripts/import-sinapi.ts) and by the
// background job started from the interface (src/lib/imports/jobs.ts).
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { cacheCompositionCosts } from "@/lib/pricing/cache-composition-costs";
import { parseReferenceWorkbook } from "./parse-reference";
import { parseLaborShareWorkbook } from "./parse-labor-share";
import { parseMaintenanceWorkbook } from "./parse-maintenance";
import { BaseInUseError, loadSinapiMaintenance, loadSinapiReference, type MaintenanceLoadResult } from "./load";
import type { SinapiRegime } from "./types";

const REGIME_TEXT: Record<SinapiRegime, string> = {
  NAO_DESONERADO: "sem desoneração", DESONERADO: "com desoneração", SEM_ENCARGOS: "sem encargos sociais",
};

export interface SinapiImportInput {
  reference?: string;
  laborShare?: string;
  maintenance?: string;
  ufs: string[];
  regimes: SinapiRegime[];
}

export interface TableOutcome {
  uf: string;
  regime: SinapiRegime;
  status: "IMPORTED" | "BLOCKED" | "FAILED";
  referenceMonth?: string;
  inputs?: number;
  compositions?: number;
  withoutCost?: number;
  /** Composições cujo custo calculado difere do publicado (deve ser 0) */
  mismatches?: number;
  laborShares?: number;
  seconds?: number;
  message?: string;
}

export interface SinapiImportResult {
  tables: TableOutcome[];
  maintenance?: MaintenanceLoadResult & { error?: string };
}

export async function runSinapiImport(
  prisma: PrismaClient,
  input: SinapiImportInput,
  log: (message: string) => void = () => {},
): Promise<SinapiImportResult> {
  const result: SinapiImportResult = { tables: [] };
  if (input.reference) {
    const total = input.ufs.length * input.regimes.length;
    let n = 0;
    for (const uf of input.ufs) {
      for (const regime of input.regimes) {
        n++;
        const t0 = Date.now();
        const outcome: TableOutcome = { uf, regime, status: "FAILED" };
        log(`[${n}/${total}] SINAPI ${uf} — ${REGIME_TEXT[regime]}: lendo a planilha de referência…`);
        try {
          const parsed = await parseReferenceWorkbook(input.reference, { uf, regime });
          outcome.referenceMonth = parsed.referenceMonth;
          const laborShares = input.laborShare ? await parseLaborShareWorkbook(input.laborShare, { uf, regime }) : undefined;
          outcome.laborShares = laborShares?.size;
          const loaded = await loadSinapiReference(prisma, parsed, {
            laborShares, sourceFile: path.basename(input.reference), onProgress: (m) => log(`   ${m}`),
          });
          log(`   Calculando o custo das ${loaded.compositions} composições…`);
          const cached = await cacheCompositionCosts(prisma, loaded.priceTableId);
          Object.assign(outcome, {
            status: "IMPORTED", inputs: loaded.inputs, compositions: loaded.compositions,
            withoutCost: cached.incomplete, mismatches: cached.mismatches.length,
          } satisfies Partial<TableOutcome>);
          log(`   OK ${parsed.referenceMonth}: ${loaded.inputs} insumos, ${loaded.compositions} composições (${cached.incomplete} sem custo); ` +
            (cached.mismatches.length
              ? `ATENÇÃO: ${cached.mismatches.length} custos diferentes do publicado (ex.: ${cached.mismatches.slice(0, 3).map((m) => `${m.code} ${m.computed}≠${m.published}`).join(", ")})`
              : "todos os custos iguais ao publicado"));
        } catch (e) {
          if (e instanceof BaseInUseError) {
            outcome.status = "BLOCKED";
            outcome.referenceMonth = e.referenceMonth;
          }
          outcome.message = e instanceof Error ? e.message : String(e);
          log(`   ${outcome.status === "BLOCKED" ? "BLOQUEADA" : "ERRO"}: ${outcome.message}`);
        }
        outcome.seconds = Math.round((Date.now() - t0) / 100) / 10;
        result.tables.push(outcome);
      }
    }
  }

  if (input.maintenance) {
    log("Manutenções: lendo o relatório…");
    try {
      const parsed = await parseMaintenanceWorkbook(input.maintenance);
      log(`   ${parsed.rows.length} manutenções no arquivo de ${parsed.fileMonth}`);
      result.maintenance = await loadSinapiMaintenance(prisma, parsed, { onProgress: (m) => log(`   ${m}`) });
      if (result.maintenance.status === "replaced") log(`   OK: ${result.maintenance.rows} manutenções gravadas`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.maintenance = { status: "skipped", fileMonth: "", rows: 0, previousFileMonth: null, error: message };
      log(`   ERRO: ${message}`);
    }
  }
  return result;
}
