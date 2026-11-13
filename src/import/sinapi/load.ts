// src/import/sinapi/load.ts
// Writes a ParsedReference (+ optional labour shares) into the database as one
// PriceTable. Re-importing the same origin/UF/month/regime replaces the table.
import { createId } from "@paralleldrive/cuid2";
import type { PrismaClient } from "@/generated/prisma/client";
import { mapInputKind } from "./map-input-kind";
import type { ParsedReference } from "./types";

export interface LoadResult {
  priceTableId: string;
  inputs: number;
  compositions: number;
  items: number;
  /** Items whose child (input or composition) was not found; stored without link. */
  unresolvedItems: number;
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

  const existing = await prisma.priceTable.findUnique({ where: { origin_uf_referenceMonth_regime: where } });
  if (existing) {
    log(`Removendo tabela anterior ${parsed.uf} ${parsed.referenceMonth} ${parsed.regime}…`);
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
    compositionId: string; type: "INSUMO" | "COMPOSICAO_AUXILIAR";
    inputId: string | null; childCompositionId: string | null; coefficient: string;
  }[] = [];
  for (const c of parsed.compositions) {
    const compositionId = compIds.get(c.code)!;
    for (const it of c.items) {
      if (it.type === "INSUMO") {
        const inputId = inputIds.get(it.code) ?? null;
        if (!inputId) unresolved++;
        itemRows.push({ compositionId, type: "INSUMO", inputId, childCompositionId: null, coefficient: it.coefficient });
      } else {
        const childCompositionId = compIds.get(it.code) ?? null;
        if (!childCompositionId) unresolved++;
        itemRows.push({ compositionId, type: "COMPOSICAO_AUXILIAR", inputId: null, childCompositionId, coefficient: it.coefficient });
      }
    }
  }
  log(`Gravando ${itemRows.length} itens…`);
  await inBatches(itemRows, (chunk) => prisma.compositionItem.createMany({ data: chunk }));

  return { priceTableId: table.id, inputs: inputRows.length, compositions: compRows.length, items: itemRows.length, unresolvedItems: unresolved };
}
