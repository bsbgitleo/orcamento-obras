// src/lib/pricing/transport.ts
// SICRO — momento de transporte no orçamento (decisões #39, #66–#68).
//  - computeBudgetTransport: pesos por material, DMT efetiva e momentos por
//    composição de transporte (sem gravar nada) — usado pela aba Transporte;
//  - syncTransportNodes: mantém a etapa "Transportes" (linhas geradas, autoKind)
//    igual ao cálculo; chamado no início de cada recálculo de orçamento SICRO;
//  - servicesWithPendingTransport: sinaliza "sem transporte" enquanto não há DMT.
import type { PrismaClient } from "@/generated/prisma/client";
import { calculateCompositionCost, type CompositionCost } from "@/core/composition";
import { ownCompositionKey } from "@/core/own-composition";
import { materialWeights, transportMoments, type Dmt, type MaterialWeight, type TransportLine } from "@/core/transport";
import { loadBudgetCatalog } from "./budget-catalog";

export const TRANSPORT_STAGE = "TRANSPORT_STAGE";
export const TRANSPORT_LINE = "TRANSPORT";
export const TRANSPORT_STAGE_NAME = "Transportes (momento de transporte — SICRO)";

type Num = { toString(): string } | null;
const n = (v: Num) => (v === null ? 0 : Number(v.toString()));

export interface BudgetTransport {
  configured: boolean;
  defaults: Dmt;
  fit: string;
  materials: (MaterialWeight & { dmt: Dmt; override: { LN: string | null; RP: string | null; P: string | null; note: string | null } | null })[];
  lines: (TransportLine & { compositionId: string | null; description: string; unit: string; unitCost: string | null })[];
}

export async function computeBudgetTransport(prisma: PrismaClient, budgetId: string): Promise<BudgetTransport | null> {
  const b = await prisma.budget.findUniqueOrThrow({
    where: { id: budgetId },
    include: { priceTable: true, transportDmts: true, project: { select: { companyId: true } }, nodes: { where: { kind: "SERVICE", autoKind: null } } },
  });
  if (b.priceTable.origin !== "SICRO") return null;
  const defaults: Dmt = { LN: n(b.dmtNatural), RP: n(b.dmtPrimary), P: n(b.dmtPaved) };
  const overrides = new Map(b.transportDmts.map((o) => [o.materialCode, o]));
  const services = b.nodes.filter((s) => s.compositionId || s.ownCompositionId);
  const { catalog } = await loadBudgetCatalog(prisma, b.priceTableId, b.project.companyId, {
    official: services.flatMap((s) => (s.compositionId ? [s.compositionId] : [])),
    own: services.flatMap((s) => (s.ownCompositionId ? [s.ownCompositionId] : [])),
  });
  const weights = materialWeights(services.map((s) => ({
    nodeId: s.id, compositionKey: s.ownCompositionId ? ownCompositionKey(s.ownCompositionId) : s.compositionId!, quantity: s.quantity?.toString() ?? "0",
  })), catalog);
  const dmtFor = (code: string): Dmt => {
    const o = overrides.get(code);
    return { LN: o?.dmtNatural != null ? n(o.dmtNatural) : defaults.LN, RP: o?.dmtPrimary != null ? n(o.dmtPrimary) : defaults.RP, P: o?.dmtPaved != null ? n(o.dmtPaved) : defaults.P };
  };
  const fit = b.fit?.toString() ?? "1";
  const moments = transportMoments(weights, dmtFor, fit);
  const comps = moments.length
    ? await prisma.composition.findMany({ where: { priceTableId: b.priceTableId, code: { in: moments.map((m) => m.code) } }, select: { id: true, code: true, description: true, unit: true, unitCost: true } })
    : [];
  const byCode = new Map(comps.map((c) => [c.code, c]));
  return {
    configured: [defaults.LN, defaults.RP, defaults.P].some((v) => Number(v) > 0) || b.transportDmts.some((o) => [o.dmtNatural, o.dmtPrimary, o.dmtPaved].some((v) => n(v) > 0)),
    defaults, fit,
    materials: weights.map((m) => {
      const o = overrides.get(m.code);
      return { ...m, dmt: dmtFor(m.code), override: o ? { LN: o.dmtNatural?.toString() ?? null, RP: o.dmtPrimary?.toString() ?? null, P: o.dmtPaved?.toString() ?? null, note: o.note } : null };
    }),
    lines: moments.map((m) => {
      const c = byCode.get(m.code);
      return { ...m, compositionId: c?.id ?? null, description: c?.description ?? `Transporte ${m.code} (não existe nesta base)`, unit: c?.unit ?? "tkm", unitCost: c?.unitCost?.toString() ?? null };
    }),
  };
}

/** Keeps the generated "Transportes" stage equal to the computed moments. */
export async function syncTransportNodes(prisma: PrismaClient, budgetId: string): Promise<void> {
  const t = await computeBudgetTransport(prisma, budgetId);
  if (!t) return;
  const auto = await prisma.wbsNode.findMany({ where: { budgetId, autoKind: { not: null } } });
  const stage = auto.find((a) => a.autoKind === TRANSPORT_STAGE) ?? null;
  const children = auto.filter((a) => a.autoKind === TRANSPORT_LINE);
  const lines = t.lines.filter((l) => l.compositionId);

  if (!lines.length) {
    if (stage) await prisma.wbsNode.delete({ where: { id: stage.id } }); // linhas filhas em cascata
    else if (children.length) await prisma.wbsNode.deleteMany({ where: { id: { in: children.map((c) => c.id) } } });
    return;
  }

  // Etapa sempre por último entre as etapas da raiz
  const roots = await prisma.wbsNode.findMany({ where: { budgetId, parentId: null }, select: { id: true, position: true } });
  const maxOther = Math.max(-1, ...roots.filter((r) => r.id !== stage?.id).map((r) => r.position));
  let stageId: string;
  if (!stage) {
    stageId = (await prisma.wbsNode.create({ data: { budgetId, parentId: null, kind: "STAGE", position: maxOther + 1, code: "", description: TRANSPORT_STAGE_NAME, autoKind: TRANSPORT_STAGE } })).id;
  } else {
    stageId = stage.id;
    if (stage.position <= maxOther) await prisma.wbsNode.update({ where: { id: stage.id }, data: { position: maxOther + 1 } });
  }

  const keep = new Set<string>();
  let pos = Math.max(-1, ...children.map((c) => c.position)) + 1;
  for (const l of lines) {
    const existing = children.find((c) => c.compositionId === l.compositionId);
    const quantity = l.moment.toFixed(4);
    if (existing) {
      keep.add(existing.id);
      if (existing.quantity?.toFixed(4) !== quantity || existing.parentId !== stageId) {
        await prisma.wbsNode.update({ where: { id: existing.id }, data: { quantity, parentId: stageId } });
      }
    } else {
      await prisma.wbsNode.create({
        data: { budgetId, parentId: stageId, kind: "SERVICE", position: pos++, code: "", description: l.description, compositionId: l.compositionId, unit: l.unit, quantity, autoKind: TRANSPORT_LINE },
      });
    }
  }
  const stale = children.filter((c) => !keep.has(c.id) && !lines.some((l) => l.compositionId === c.compositionId));
  if (stale.length) await prisma.wbsNode.deleteMany({ where: { id: { in: stale.map((c) => c.id) } } });
}

/** Services whose composition has transport (grupo F) while no DMT is informed (decisão #39). */
export async function servicesWithPendingTransport(
  prisma: PrismaClient, priceTableId: string, companyId: string,
  nodes: { id: string; kind: string; compositionId: string | null; ownCompositionId: string | null; autoKind?: string | null }[],
  transportConfigured: boolean,
): Promise<Set<string>> {
  if (transportConfigured) return new Set();
  const services = nodes.filter((n) => n.kind === "SERVICE" && !n.autoKind && (n.compositionId || n.ownCompositionId));
  if (!services.length) return new Set();
  const { catalog } = await loadBudgetCatalog(prisma, priceTableId, companyId, {
    official: services.flatMap((s) => (s.compositionId ? [s.compositionId] : [])),
    own: services.flatMap((s) => (s.ownCompositionId ? [s.ownCompositionId] : [])),
  });
  const cache = new Map<string, CompositionCost>();
  const out = new Set<string>();
  for (const s of services) {
    const key = s.ownCompositionId ? ownCompositionKey(s.ownCompositionId) : s.compositionId!;
    if (catalog.getComposition(key) && calculateCompositionCost(key, catalog, cache).transportPending) out.add(s.id);
  }
  return out;
}

export function isTransportConfigured(b: { dmtNatural: Num; dmtPrimary: Num; dmtPaved: Num }, overrides: { dmtNatural: Num; dmtPrimary: Num; dmtPaved: Num }[]): boolean {
  return [b.dmtNatural, b.dmtPrimary, b.dmtPaved].some((v) => n(v) > 0) || overrides.some((o) => [o.dmtNatural, o.dmtPrimary, o.dmtPaved].some((v) => n(v) > 0));
}

