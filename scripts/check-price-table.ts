// scripts/check-price-table.ts
// Loads one PriceTable from the database, recalculates every composition with
// src/core and compares with the published reference cost.
//
//   npx tsx scripts/check-price-table.ts DF 2026-10 NAO_DESONERADO
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { calculateCompositionCost, type Catalog, type Composition, type InputItem, type PriceSource } from "../src/core/composition";
import { D } from "../src/core/money";
import type { TaxRegime } from "../src/generated/prisma/enums";

const [uf = "DF", referenceMonth = "2026-10", regime = "NAO_DESONERADO"] = process.argv.slice(2);

async function main() {
  const table = await prisma.priceTable.findFirst({
    where: { companyId: null, origin: "SINAPI", uf, referenceMonth, regime: regime as TaxRegime },
  });
  if (!table) throw new Error("Tabela não encontrada");
  const source: PriceSource = { origin: "SINAPI", uf, referenceMonth, regime: regime as PriceSource["regime"] };

  const dbInputs = await prisma.input.findMany({ where: { priceTableId: table.id } });
  const dbComps = await prisma.composition.findMany({ where: { priceTableId: table.id }, include: { items: true } });

  const inputs = new Map<string, InputItem>(dbInputs.map((i) => [i.id, {
    id: i.id, code: i.code, description: i.description, unit: i.unit, kind: i.kind,
    unitPrice: i.unitPrice === null ? null : i.unitPrice.toString(), source,
  }]));
  const comps = new Map<string, Composition>(dbComps.map((c) => [c.id, {
    id: c.id, code: c.code, description: c.description, unit: c.unit, source,
    items: c.items.map((it) => it.type === "INSUMO"
      ? { type: "INSUMO" as const, inputId: it.inputId!, coefficient: it.coefficient.toString() }
      : { type: "COMPOSICAO_AUXILIAR" as const, compositionId: it.childCompositionId!, coefficient: it.coefficient.toString() }),
  }]));
  const catalog: Catalog = { getInput: (id) => inputs.get(id), getComposition: (id) => comps.get(id) };

  let ok = 0, bad = 0, semCusto = 0;
  const cache = new Map();
  for (const c of dbComps) {
    const r = calculateCompositionCost(c.id, catalog, cache);
    if (c.referenceCost === null) {
      if (r.incomplete) semCusto++; else { bad++; console.log(`  ${c.code}: calculado ${r.unitCost} mas sem custo publicado`); }
      continue;
    }
    if (!r.incomplete && r.unitCost.eq(D(c.referenceCost.toString()))) ok++;
    else { bad++; if (bad <= 10) console.log(`  ${c.code}: calc ${r.unitCost} ≠ pub ${c.referenceCost}`); }
  }
  console.log(`${uf} ${referenceMonth} ${regime}: ${dbInputs.length} insumos, ${dbComps.length} composições`);
  console.log(`  iguais ao publicado: ${ok}   sem custo (coerente): ${semCusto}   divergentes: ${bad}`);
  if (bad) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
