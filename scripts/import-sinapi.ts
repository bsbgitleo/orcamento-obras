// scripts/import-sinapi.ts
// Imports SINAPI reference months (one or more UFs) and/or the maintenance log.
// Same flow as the interface (Bases → Importar), see src/import/sinapi/run-import.ts.
//
//   npx tsx scripts/import-sinapi.ts --ref <SINAPI_Referência.xlsx> --uf DF[,GO,...] \
//       [--regime NAO_DESONERADO|DESONERADO|SEM_ENCARGOS|ALL] [--labor <SINAPI_mao_de_obra.xlsx>] \
//       [--maintenance <SINAPI_Manutenções.xlsx>]
import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/prisma";
import { runSinapiImport } from "../src/import/sinapi/run-import";
import type { SinapiRegime } from "../src/import/sinapi/types";

const { values: args } = parseArgs({
  options: {
    ref: { type: "string" },
    labor: { type: "string" },
    maintenance: { type: "string" },
    uf: { type: "string", default: "DF" },
    regime: { type: "string", default: "NAO_DESONERADO" },
  },
});

if (!args.ref && !args.maintenance) {
  console.error("uso: import-sinapi --ref <xlsx> [--labor <xlsx>] [--uf DF[,GO]] [--regime NAO_DESONERADO|DESONERADO|SEM_ENCARGOS|ALL] [--maintenance <xlsx>]");
  process.exit(1);
}

const ALL: SinapiRegime[] = ["NAO_DESONERADO", "DESONERADO", "SEM_ENCARGOS"];
const regimes: SinapiRegime[] = args.regime === "ALL" ? ALL : [args.regime as SinapiRegime];
if (!regimes.every((r) => ALL.includes(r))) { console.error(`regime inválido: ${args.regime}`); process.exit(1); }
const ufs = args.uf!.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

async function main() {
  const r = await runSinapiImport(prisma, {
    reference: args.ref, laborShare: args.labor, maintenance: args.maintenance, ufs, regimes,
  }, console.log);
  const failed = r.tables.filter((t) => t.status !== "IMPORTED").length + (r.maintenance?.error ? 1 : 0);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
