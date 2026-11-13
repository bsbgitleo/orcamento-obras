// scripts/cache-costs.ts
// (Re)computes Composition.unitCost for every imported price table.
//   npx tsx scripts/cache-costs.ts
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { cacheCompositionCosts } from "../src/lib/pricing/cache-composition-costs";

async function main() {
  const tables = await prisma.priceTable.findMany();
  for (const t of tables) {
    const t0 = Date.now();
    const r = await cacheCompositionCosts(prisma, t.id);
    console.log(`${t.origin} ${t.uf} ${t.referenceMonth} ${t.regime}: ${r.computed} custos, ${r.incomplete} sem custo, ${r.mismatches.length} divergências (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
