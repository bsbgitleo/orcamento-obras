// scripts/import-sicro.ts
// Imports the DNIT SICRO reports of one UF/month (decisões #31, #38–#40, #55).
//   npm run sicro:import -- --dir "<pasta com os .xlsx do DNIT>" [--uf DF] [--regime NAO_DESONERADO|DESONERADO|ALL]
import "dotenv/config";
import { readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/prisma";
import { classifySicroFiles } from "../src/import/sicro/files";
import { runSicroImport } from "../src/import/sicro/run-import";
import type { SicroFiles, SicroRegime } from "../src/import/sicro/types";

const { values: args } = parseArgs({ options: { dir: { type: "string" }, uf: { type: "string" }, regime: { type: "string", default: "ALL" } } });
if (!args.dir) { console.error('uso: sicro:import -- --dir "<pasta>" [--uf DF] [--regime NAO_DESONERADO|DESONERADO|ALL]'); process.exit(1); }

const found = classifySicroFiles(readdirSync(args.dir).map((f) => path.join(args.dir!, f)));
const uf = (args.uf ?? found.uf ?? "").toUpperCase();
if (!uf) { console.error("Informe --uf (não deu para ler a UF pelo nome dos arquivos)."); process.exit(1); }
if (!found.analytic || !found.materials) { console.error("Faltam o Relatório Analítico de Composições e/ou o Sintético de Materiais."); process.exit(1); }
const regimes: SicroRegime[] = args.regime === "ALL" ? ["NAO_DESONERADO", "DESONERADO"] : [args.regime as SicroRegime];

runSicroImport(prisma, { files: found as SicroFiles, uf, regimes }, console.log)
  .then((r) => { if (r.tables.some((t) => t.status !== "IMPORTED")) process.exitCode = 1; })
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
