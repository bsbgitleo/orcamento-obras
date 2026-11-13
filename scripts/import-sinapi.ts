// scripts/import-sinapi.ts
// Imports one SINAPI reference month for one UF into the database.
//
//   npx tsx scripts/import-sinapi.ts --ref <SINAPI_Referência.xlsx> --uf DF \
//       [--regime NAO_DESONERADO|DESONERADO|SEM_ENCARGOS|ALL] [--labor <SINAPI_mao_de_obra.xlsx>]
import "dotenv/config";
import path from "node:path";
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/prisma";
import { parseReferenceWorkbook } from "../src/import/sinapi/parse-reference";
import { parseLaborShareWorkbook } from "../src/import/sinapi/parse-labor-share";
import { loadSinapiReference } from "../src/import/sinapi/load";
import type { SinapiRegime } from "../src/import/sinapi/types";

const { values: args } = parseArgs({
  options: {
    ref: { type: "string" },
    labor: { type: "string" },
    uf: { type: "string", default: "DF" },
    regime: { type: "string", default: "NAO_DESONERADO" },
  },
});

if (!args.ref) {
  console.error("uso: import-sinapi --ref <xlsx> [--labor <xlsx>] [--uf DF] [--regime NAO_DESONERADO|DESONERADO|SEM_ENCARGOS|ALL]");
  process.exit(1);
}

const regimes: SinapiRegime[] = args.regime === "ALL"
  ? ["NAO_DESONERADO", "DESONERADO", "SEM_ENCARGOS"]
  : [args.regime as SinapiRegime];

async function main() {
  for (const regime of regimes) {
    const t0 = Date.now();
    console.log(`\n== SINAPI ${args.uf} ${regime} ==`);
    const parsed = await parseReferenceWorkbook(args.ref!, { uf: args.uf!, regime, onProgress: console.log });
    const laborShares = args.labor ? await parseLaborShareWorkbook(args.labor, { uf: args.uf!, regime }) : undefined;
    if (laborShares) console.log(`  ${laborShares.size} percentuais de mão de obra`);
    const r = await loadSinapiReference(prisma, parsed, {
      laborShares, sourceFile: path.basename(args.ref!), onProgress: console.log,
    });
    console.log(`OK ${parsed.referenceMonth}: ${r.inputs} insumos, ${r.compositions} composições, ${r.items} itens` +
      (r.unresolvedItems ? `, ${r.unresolvedItems} itens sem vínculo` : "") +
      ` (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (parsed.socialCharges) {
      console.log(`  encargos sociais ${args.uf}: horista ${parsed.socialCharges.hourly}, mensalista ${parsed.socialCharges.monthly}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
