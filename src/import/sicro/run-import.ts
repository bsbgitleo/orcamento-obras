// src/import/sicro/run-import.ts
// One SICRO import: reads the DNIT reports of one UF/month and writes one
// price table per regime (sem / com desoneração), then caches and checks the
// composition costs against the published ones (decisões #31, #38–#40, #55).
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { cacheCompositionCosts } from "@/lib/pricing/cache-composition-costs";
import { BaseInUseError } from "../sinapi/load";
import type { TableOutcome } from "../sinapi/run-import";
import { parseAnalytic, parseEquipment, parseLabor, parseMaterials, parsePriceOrigin, parseSyntheticCompositions } from "./parse";
import { loadSicroTable } from "./load";
import type { SicroFiles, SicroInput, SicroRegime } from "./types";

const REGIME_TEXT: Record<SicroRegime, string> = { NAO_DESONERADO: "sem desoneração", DESONERADO: "com desoneração" };

export async function runSicroImport(
  prisma: PrismaClient,
  input: { files: SicroFiles; uf: string; regimes: SicroRegime[] },
  log: (m: string) => void = () => {},
): Promise<{ tables: TableOutcome[] }> {
  const { files, uf } = input;
  log("SICRO: lendo o relatório analítico de composições…");
  const analytic = await parseAnalytic(files.analytic, log);
  if (!analytic.referenceMonth) throw new Error("Não achei o mês de referência no relatório analítico.");
  log(`   ${analytic.compositions.length} composições, referência ${analytic.referenceMonth}`);
  const published = files.syntheticCompositions ? await parseSyntheticCompositions(files.syntheticCompositions) : null;
  if (published) {
    for (const c of analytic.compositions) {
      const p = published.get(c.code);
      if (p) { c.publishedCost = p.cost; c.description = p.description || c.description; c.unit = p.unit || c.unit; }
    }
  }
  const materials = await parseMaterials(files.materials);
  const origin = files.priceOrigin ? await parsePriceOrigin(files.priceOrigin, uf) : new Map<string, string>();
  log(`   ${materials.length} materiais${origin.size ? `, origem de preço de ${origin.size} itens` : ""}`);

  const tables: TableOutcome[] = [];
  for (const regime of input.regimes) {
    const t0 = Date.now();
    const outcome: TableOutcome = { uf, regime, status: "FAILED", referenceMonth: analytic.referenceMonth };
    log(`SICRO ${uf} — ${REGIME_TEXT[regime]}:`);
    try {
      const laborFile = files.labor[regime];
      const equipmentFile = files.equipment[regime];
      if (!laborFile || !equipmentFile) throw new Error(`Faltam os relatórios sintéticos de mão de obra e de equipamentos ${REGIME_TEXT[regime]}.`);
      const inputs: SicroInput[] = [...await parseLabor(laborFile), ...await parseEquipment(equipmentFile), ...materials]
        .map((i) => ({ ...i, priceOrigin: origin.get(i.code) ?? null }));
      // Preço em branco no relatório: o DNIT calcula com zero (origem "PRZ" etc.)
      const blank = inputs.filter((i) => i.kind === "MATERIAL" && i.unitPrice === null);
      for (const i of blank) i.unitPrice = "0";
      if (blank.length) log(`   ${blank.length} materiais sem preço no relatório entram com R$ 0,00, como no DNIT (ex.: ${blank.slice(0, 3).map((b) => b.code).join(", ")})`);
      const loaded = await loadSicroTable(prisma, {
        uf, referenceMonth: analytic.referenceMonth, regime, inputs, compositions: analytic.compositions,
        sourceFile: path.basename(files.analytic), withPublishedCost: regime === "NAO_DESONERADO",
      }, (m) => log(`   ${m}`));
      log(`   Calculando o custo das ${loaded.compositions} composições…`);
      const cached = await cacheCompositionCosts(prisma, loaded.priceTableId);
      Object.assign(outcome, { status: "IMPORTED", inputs: loaded.inputs, compositions: loaded.compositions, withoutCost: cached.incomplete, mismatches: cached.mismatches.length } satisfies Partial<TableOutcome>);
      log(`   OK: ${loaded.inputs} insumos, ${loaded.compositions} composições (${cached.incomplete} sem custo)` +
        (loaded.unresolvedItems ? `, ${loaded.unresolvedItems} itens sem vínculo` : "") + "; " +
        (regime === "NAO_DESONERADO"
          ? (cached.mismatches.length ? `ATENÇÃO: ${cached.mismatches.length} custos diferentes do publicado (ex.: ${cached.mismatches.slice(0, 3).map((m) => `${m.code} ${m.computed}≠${m.published}`).join(", ")})` : "todos os custos iguais ao publicado")
          : "o DNIT não publica o custo das composições com desoneração; calculado pelo mesmo método"));
    } catch (e) {
      if (e instanceof BaseInUseError) outcome.status = "BLOCKED";
      outcome.message = e instanceof Error ? e.message : String(e);
      log(`   ${outcome.status === "BLOCKED" ? "BLOQUEADA" : "ERRO"}: ${outcome.message}`);
    }
    outcome.seconds = Math.round((Date.now() - t0) / 100) / 10;
    tables.push(outcome);
  }
  return { tables };
}
