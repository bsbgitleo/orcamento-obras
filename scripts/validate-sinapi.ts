// scripts/validate-sinapi.ts
// Recalculates every SINAPI composition for one UF/regime from its analytic
// items (using src/core) and compares with the cost published in CSD/CCD/CSE.
//
//   npx tsx scripts/validate-sinapi.ts <SINAPI_Referência.xlsx> DF NAO_DESONERADO
import { parseReferenceWorkbook } from "../src/import/sinapi/parse-reference";
import type { SinapiRegime } from "../src/import/sinapi/types";
import { calculateCompositionCost, type Catalog, type InputItem, type Composition, type InputKind, type PriceSource } from "../src/core/composition";
import { D } from "../src/core/money";

const [file, uf = "DF", regime = "NAO_DESONERADO"] = process.argv.slice(2);
if (!file) { console.error("uso: validate-sinapi <xlsx> [UF] [REGIME]"); process.exit(1); }

export function mapInputKind(sourceClass: string): InputKind {
  const c = sourceClass.toUpperCase();
  if (c.startsWith("MAO DE OBRA") || c.startsWith("ENCARGOS COMPLEMENTARES")) return "MAO_DE_OBRA";
  if (c.startsWith("EQUIPAMENTO")) return "EQUIPAMENTO";
  if (c.startsWith("SERVI") || c.startsWith("ESPECIAIS")) return "SERVICO";
  return "MATERIAL";
}

async function main() {
  const t0 = Date.now();
  const parsed = await parseReferenceWorkbook(file, {
    uf, regime: regime as SinapiRegime, onProgress: (m) => console.error(m),
  });
  const source: PriceSource = { origin: "SINAPI", uf, referenceMonth: parsed.referenceMonth, regime: regime as PriceSource["regime"] };

  const inputs = new Map<string, InputItem>();
  for (const i of parsed.inputs) {
    inputs.set(i.code, { id: i.code, code: i.code, description: i.description, unit: i.unit, kind: mapInputKind(i.sourceClass), unitPrice: i.unitPrice, source });
  }
  const comps = new Map<string, Composition>();
  for (const c of parsed.compositions) {
    comps.set(c.code, {
      id: c.code, code: c.code, description: c.description, unit: c.unit, source,
      items: c.items.map((it) => it.type === "INSUMO"
        ? { type: "INSUMO", inputId: it.code, coefficient: it.coefficient }
        : { type: "COMPOSICAO_AUXILIAR", compositionId: it.code, coefficient: it.coefficient }),
    });
  }
  const catalog: Catalog = { getInput: (id) => inputs.get(id), getComposition: (id) => comps.get(id) };

  let ok = 0, diff = 0, noRef = 0, incomplete = 0, errors = 0;
  const incompleteSamples: string[] = [];
  const diffs: { code: string; calc: string; ref: string; delta: string; desc: string }[] = [];
  const cache = new Map();
  for (const c of parsed.compositions) {
    try {
      const r = calculateCompositionCost(c.code, catalog, cache);
      if (r.incomplete) { incomplete++; }
      if (c.referenceCost === null) { noRef++; continue; }
      if (r.incomplete && incompleteSamples.length < 5) incompleteSamples.push(`${c.code} status=${c.status} parcial=${r.unitCost.toFixed(2)} pub=${c.referenceCost}`);
      // SINAPI publishes 0 for "SEM CUSTO" compositions (some input without price)
      const expected = r.incomplete ? D(0) : r.unitCost;
      if (expected.eq(c.referenceCost)) ok++;
      else {
        diff++;
        diffs.push({ code: c.code, calc: r.unitCost.toFixed(2), ref: D(c.referenceCost).toFixed(2), delta: r.unitCost.minus(c.referenceCost).toFixed(2), desc: c.description.slice(0, 60) });
      }
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`ERRO ${c.code}: ${(e as Error).message}`);
    }
  }
  console.log(`\nSINAPI ${parsed.referenceMonth} ${uf} ${regime} — ${parsed.inputs.length} insumos, ${parsed.compositions.length} composições (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`encargos sociais: horista ${parsed.socialCharges?.hourly ?? "-"}  mensalista ${parsed.socialCharges?.monthly ?? "-"}`);
  console.log(`iguais ao publicado: ${ok}`);
  console.log(`diferentes:          ${diff}`);
  console.log(`sem custo publicado: ${noRef}  (incompletas no cálculo: ${incomplete})`);
  console.log(`erros:               ${errors}`);
  if (incompleteSamples.length) console.log("\nIncompletas (amostra):\n  " + incompleteSamples.join("\n  "));
  if (diffs.length) {
    console.log("\nPrimeiras diferenças:");
    for (const d of diffs.slice(0, 25)) console.log(`  ${d.code}  calc ${d.calc}  pub ${d.ref}  Δ ${d.delta}  ${d.desc}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
