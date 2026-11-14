// src/import/sinapi/load.ts
// Writes a ParsedReference (+ optional labour shares) into the database as one
// PriceTable. Re-importing the same origin/UF/month/regime replaces the table,
// unless a budget already uses it (BaseInUseError). Also loads the maintenance log.
import { createId } from "@paralleldrive/cuid2";
import type { PrismaClient } from "@/generated/prisma/client";
import { mapInputKind } from "./map-input-kind";
import type { ParsedReference } from "./types";
import type { ParsedMaintenanceFile } from "./parse-maintenance";

export interface LoadResult {
  priceTableId: string;
  inputs: number;
  compositions: number;
  items: number;
  /** Items whose child (input or composition) was not found; stored without link. */
  unresolvedItems: number;
}

/** Reimporting a table that budgets already use is refused (decisão #46). */
export class BaseInUseError extends Error {
  constructor(public uf: string, public referenceMonth: string, public regime: string, public budgets: number, public origin = "SINAPI") {
    const label: Record<string, string> = { NAO_DESONERADO: "sem desoneração", DESONERADO: "com desoneração", SEM_ENCARGOS: "sem encargos sociais" };
    const [y, m] = referenceMonth.split("-");
    super(`A base ${origin} ${uf} ${m}/${y} ${label[regime] ?? regime} já é usada por ${budgets} orçamento(s); a reimportação foi bloqueada.`);
    this.name = "BaseInUseError";
  }
}

const BATCH = 2000;

async function inBatches<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await fn(rows.slice(i, i + BATCH));
}

export async function loadSinapiReference(
  prisma: PrismaClient,
  parsed: ParsedReference,
  opts: { laborShares?: Map<string, string>; sourceFile?: string; onProgress?: (m: string) => void } = {},
): Promise<LoadResult> {
  const log = opts.onProgress ?? (() => {});
  const where = { origin: "SINAPI" as const, uf: parsed.uf, referenceMonth: parsed.referenceMonth, regime: parsed.regime };

  const existing = await prisma.priceTable.findFirst({ where: { ...where, companyId: null } });
  if (existing) {
    // Decisão #46: base oficial de um mês não muda depois de usada em orçamento.
    const budgets = await prisma.budget.count({ where: { priceTableId: existing.id } });
    if (budgets > 0) throw new BaseInUseError(parsed.uf, parsed.referenceMonth, parsed.regime, budgets);
    log(`Substituindo a tabela anterior (nenhum orçamento a usa)…`);
    await prisma.priceTable.delete({ where: { id: existing.id } }); // cascades
  }

  const table = await prisma.priceTable.create({
    data: {
      ...where, importedAt: new Date(), sourceFile: opts.sourceFile ?? null,
      socialChargesHourly: parsed.socialCharges?.hourly ?? null,
      socialChargesMonthly: parsed.socialCharges?.monthly ?? null,
    },
  });

  // Inputs
  const inputIds = new Map<string, string>();
  const inputRows = parsed.inputs.map((i) => {
    const id = createId();
    inputIds.set(i.code, id);
    return {
      id, priceTableId: table.id, code: i.code, description: i.description, unit: i.unit,
      kind: mapInputKind(i.sourceClass), unitPrice: i.unitPrice, sourceClass: i.sourceClass || null,
      priceOrigin: i.priceOrigin, priceFallbackUf: i.priceFallbackUf,
    };
  });
  log(`Gravando ${inputRows.length} insumos…`);
  await inBatches(inputRows, (chunk) => prisma.input.createMany({ data: chunk }));

  // Compositions
  const compIds = new Map<string, string>();
  const compRows = parsed.compositions.map((c) => {
    const id = createId();
    compIds.set(c.code, id);
    const share = opts.laborShares?.get(c.code) ?? null;
    return {
      id, priceTableId: table.id, code: c.code, description: c.description, unit: c.unit, group: c.group || null,
      // SINAPI publishes 0 for "SEM CUSTO" compositions; store null there so it is never
      // mistaken for a real cost. A "COM CUSTO" composition may legitimately cost 0,00
      // (e.g. 104088: coefficient 0,0000148 × 570,65 truncates to zero).
      referenceCost: c.status === "SEM CUSTO" ? null : c.referenceCost,
      laborShare: share, sourceStatus: c.status,
    };
  });
  log(`Gravando ${compRows.length} composições…`);
  await inBatches(compRows, (chunk) => prisma.composition.createMany({ data: chunk }));

  // Items
  let unresolved = 0;
  const itemRows: {
    compositionId: string; position: number; type: "INSUMO" | "COMPOSICAO_AUXILIAR";
    inputId: string | null; childCompositionId: string | null; coefficient: string;
  }[] = [];
  for (const c of parsed.compositions) {
    const compositionId = compIds.get(c.code)!;
    for (const [position, it] of c.items.entries()) {
      if (it.type === "INSUMO") {
        const inputId = inputIds.get(it.code) ?? null;
        if (!inputId) unresolved++;
        itemRows.push({ compositionId, position, type: "INSUMO", inputId, childCompositionId: null, coefficient: it.coefficient });
      } else {
        const childCompositionId = compIds.get(it.code) ?? null;
        if (!childCompositionId) unresolved++;
        itemRows.push({ compositionId, position, type: "COMPOSICAO_AUXILIAR", inputId: null, childCompositionId, coefficient: it.coefficient });
      }
    }
  }
  log(`Gravando ${itemRows.length} itens…`);
  await inBatches(itemRows, (chunk) => prisma.compositionItem.createMany({ data: chunk }));

  return { priceTableId: table.id, inputs: inputRows.length, compositions: compRows.length, items: itemRows.length, unresolvedItems: unresolved };
}

export interface MaintenanceLoadResult {
  /** "replaced" | "skipped" (arquivo mais antigo que o já gravado) */
  status: "replaced" | "skipped";
  fileMonth: string;
  rows: number;
  /** Mês do arquivo já gravado, quando havia */
  previousFileMonth: string | null;
}

/**
 * The maintenance report is cumulative and national: the newest file replaces
 * every SINAPI row. An older file never overwrites a newer one.
 */
export async function loadSinapiMaintenance(
  prisma: PrismaClient,
  parsed: ParsedMaintenanceFile,
  opts: { onProgress?: (m: string) => void } = {},
): Promise<MaintenanceLoadResult> {
  const log = opts.onProgress ?? (() => {});
  const current = await prisma.sourceMaintenance.findFirst({
    where: { origin: "SINAPI" }, orderBy: { fileMonth: "desc" }, select: { fileMonth: true },
  });
  const previousFileMonth = current?.fileMonth ?? null;
  if (previousFileMonth && previousFileMonth > parsed.fileMonth) {
    log(`Manutenções: já existe o relatório de ${previousFileMonth}, mais novo que o enviado (${parsed.fileMonth}); nada foi alterado.`);
    return { status: "skipped", fileMonth: parsed.fileMonth, rows: 0, previousFileMonth };
  }
  const rows = parsed.rows.map((r) => ({ id: createId(), origin: "SINAPI" as const, fileMonth: parsed.fileMonth, ...r }));
  await prisma.$transaction(async (tx) => {
    await tx.sourceMaintenance.deleteMany({ where: { origin: "SINAPI" } });
    log(`Gravando ${rows.length} manutenções…`);
    for (let i = 0; i < rows.length; i += BATCH) await tx.sourceMaintenance.createMany({ data: rows.slice(i, i + BATCH) });
  }, { timeout: 120_000 });
  return { status: "replaced", fileMonth: parsed.fileMonth, rows: rows.length, previousFileMonth };
}
