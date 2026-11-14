// src/import/sicro/load.ts
// Writes one SICRO price table (origin + UF + month + regime). Same rules as
// the SINAPI loader: a table already used by budgets is never replaced.
import { createId } from "@paralleldrive/cuid2";
import type { PrismaClient } from "@/generated/prisma/client";
import { BaseInUseError } from "../sinapi/load";
import type { SicroComposition, SicroInput, SicroRegime } from "./types";

export interface SicroLoadResult { priceTableId: string; inputs: number; compositions: number; items: number; unresolvedItems: number }

const BATCH = 2000;
async function inBatches<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await fn(rows.slice(i, i + BATCH));
}

export async function loadSicroTable(
  prisma: PrismaClient,
  data: { uf: string; referenceMonth: string; regime: SicroRegime; inputs: SicroInput[]; compositions: SicroComposition[]; sourceFile: string; withPublishedCost: boolean },
  log: (m: string) => void = () => {},
): Promise<SicroLoadResult> {
  const where = { origin: "SICRO" as const, uf: data.uf, referenceMonth: data.referenceMonth, regime: data.regime };
  const existing = await prisma.priceTable.findFirst({ where: { ...where, companyId: null } });
  if (existing) {
    const budgets = await prisma.budget.count({ where: { priceTableId: existing.id } });
    if (budgets > 0) throw new BaseInUseError(data.uf, data.referenceMonth, data.regime, budgets, "SICRO");
    log("Substituindo a tabela anterior (nenhum orçamento a usa)…");
    await prisma.priceTable.delete({ where: { id: existing.id } });
  }
  const table = await prisma.priceTable.create({ data: { ...where, importedAt: new Date(), sourceFile: data.sourceFile } });

  const inputIds = new Map<string, string>();
  const inputRows = data.inputs.map((i) => {
    const id = createId();
    inputIds.set(i.code, id);
    return {
      id, priceTableId: table.id, code: i.code, description: i.description, unit: i.unit, kind: i.kind,
      unitPrice: i.unitPrice, productiveCost: i.productiveCost, unproductiveCost: i.unproductiveCost,
      priceOrigin: i.priceOrigin, sourceClass: i.kind === "MAO_DE_OBRA" ? "MÃO DE OBRA" : i.kind === "EQUIPAMENTO" ? "EQUIPAMENTO" : "MATERIAL",
    };
  });
  log(`Gravando ${inputRows.length} insumos…`);
  await inBatches(inputRows, (chunk) => prisma.input.createMany({ data: chunk }));

  const compIds = new Map<string, string>();
  const compRows = data.compositions.map((c) => {
    const id = createId();
    compIds.set(c.code, id);
    return {
      id, priceTableId: table.id, code: c.code, description: c.description, unit: c.unit,
      referenceCost: data.withPublishedCost ? c.publishedCost : null, productionRate: c.production, fic: c.fic,
    };
  });
  log(`Gravando ${compRows.length} composições…`);
  await inBatches(compRows, (chunk) => prisma.composition.createMany({ data: chunk }));

  let unresolved = 0;
  const itemRows: {
    compositionId: string; position: number; type: "INSUMO" | "COMPOSICAO_AUXILIAR" | "PERCENTUAL"; sicroGroup: string;
    inputId: string | null; childCompositionId: string | null; coefficient: string;
    operativeUse?: string; unproductiveUse?: string; percent?: string; label?: string; transportCodes?: string[];
  }[] = [];
  const inp = (code: string) => { const id = inputIds.get(code) ?? null; if (!id) unresolved++; return id; };
  const comp = (code: string) => { const id = compIds.get(code) ?? null; if (!id) unresolved++; return id; };
  for (const c of data.compositions) {
    const compositionId = compIds.get(c.code)!;
    c.items.forEach((it, position) => {
      const base = { compositionId, position };
      switch (it.group) {
        case "A": itemRows.push({ ...base, type: "INSUMO", sicroGroup: "A", inputId: inp(it.code), childCompositionId: null, coefficient: it.coefficient, operativeUse: it.operativeUse, unproductiveUse: it.unproductiveUse }); break;
        case "B": case "C": itemRows.push({ ...base, type: "INSUMO", sicroGroup: it.group, inputId: inp(it.code), childCompositionId: null, coefficient: it.coefficient }); break;
        case "D": itemRows.push({ ...base, type: "COMPOSICAO_AUXILIAR", sicroGroup: "D", inputId: null, childCompositionId: comp(it.compositionCode), coefficient: it.coefficient }); break;
        case "E": itemRows.push({ ...base, type: "COMPOSICAO_AUXILIAR", sicroGroup: "E", inputId: inputIds.get(it.materialCode) ?? null, childCompositionId: comp(it.compositionCode), coefficient: it.coefficient }); break;
        case "F":
          // Transporte de material comprado (Mxxxx) ou produzido na obra (composição de 7 dígitos, ex.: brita de central)
          if (/^\d{7}$/.test(it.materialCode)) itemRows.push({ ...base, type: "COMPOSICAO_AUXILIAR", sicroGroup: "F", inputId: null, childCompositionId: comp(it.materialCode), coefficient: it.coefficient, transportCodes: it.transportCodes });
          else itemRows.push({ ...base, type: "INSUMO", sicroGroup: "F", inputId: inp(it.materialCode), childCompositionId: null, coefficient: it.coefficient, transportCodes: it.transportCodes });
          break;
        case "PCT": itemRows.push({ ...base, type: "PERCENTUAL", sicroGroup: it.section, inputId: null, childCompositionId: null, coefficient: "0", percent: it.percent, label: it.label }); break;
      }
    });
  }
  log(`Gravando ${itemRows.length} itens…`);
  await inBatches(itemRows, (chunk) => prisma.compositionItem.createMany({ data: chunk }));
  return { priceTableId: table.id, inputs: inputRows.length, compositions: compRows.length, items: itemRows.length, unresolvedItems: unresolved };
}
