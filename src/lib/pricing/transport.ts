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
import { calculateFit, FIT_URBAN_SPEED, weightedVmd, type FitResult } from "@/core/fit";
import { loadBudgetCatalog } from "./budget-catalog";

export const TRANSPORT_STAGE = "TRANSPORT_STAGE";
export const TRANSPORT_LINE = "TRANSPORT";
export const TRANSPORT_STAGE_NAME = "Transportes (momento de transporte — SICRO)";
/** Operação de sinalização por bandeirola ou placa (PARE e SIGA) — Volume 05, 3.2.1.1 */
export const STOP_GO_COMPOSITION = "5213850";

type Num = { toString(): string } | null;
const n = (v: Num) => (v === null ? 0 : Number(v.toString()));

export interface MaterialOverride { LN: string | null; RP: string | null; P: string | null; U: string | null; passesWorksite: boolean; applyFit: boolean; note: string | null }

export interface BudgetFit {
  mode: "CALCULATED" | "MANUAL";
  /** FIT informado (modo MANUAL) */
  manual: string;
  stopGo: boolean;
  urbanSpeed: string;
  /** VMD por faixa ponderado pelos segmentos (Eq. 1) */
  vmd: string | null;
  segments: { id: string; description: string | null; lengthKm: string; vmdPerLane: string }[];
  source: string | null;
  /** A composição de PARE e SIGA (5213850) está na planilha */
  stopGoInBudget: boolean;
}

export interface BudgetTransport {
  configured: boolean;
  /** DMT padrão; P = pavimentada rural (DMTr) */
  defaults: Dmt;
  /** DMT padrão em via urbana pavimentada (DMTu) */
  defaultUrban: number;
  fit: BudgetFit;
  materials: (MaterialWeight & {
    /** DMT efetiva; P = pavimentada total (rural + urbana), antes do FIT */
    dmt: Dmt;
    dmtRural: number; dmtUrban: number;
    passesWorksite: boolean; applyFit: boolean;
    fit: Pick<FitResult, "reason"> & { value: string; a1: string; a2: string };
    override: MaterialOverride | null;
  })[];
  lines: (TransportLine & { compositionId: string | null; description: string; unit: string; unitCost: string | null })[];
}

export async function computeBudgetTransport(prisma: PrismaClient, budgetId: string): Promise<BudgetTransport | null> {
  const b = await prisma.budget.findUniqueOrThrow({
    where: { id: budgetId },
    include: {
      priceTable: true, transportDmts: true, trafficSegments: { orderBy: { position: "asc" } },
      project: { select: { companyId: true } }, nodes: { where: { kind: "SERVICE", autoKind: null } },
    },
  });
  if (b.priceTable.origin !== "SICRO") return null;
  const defaults: Dmt = { LN: n(b.dmtNatural), RP: n(b.dmtPrimary), P: n(b.dmtPaved) };
  const defaultUrban = n(b.dmtUrban);
  const overrides = new Map(b.transportDmts.map((o) => [o.materialCode, o]));
  const services = b.nodes.filter((s) => s.compositionId || s.ownCompositionId);
  const { catalog } = await loadBudgetCatalog(prisma, b.priceTableId, b.project.companyId, {
    official: services.flatMap((s) => (s.compositionId ? [s.compositionId] : [])),
    own: services.flatMap((s) => (s.ownCompositionId ? [s.ownCompositionId] : [])),
  });
  const weights = materialWeights(services.map((s) => ({
    nodeId: s.id, compositionKey: s.ownCompositionId ? ownCompositionKey(s.ownCompositionId) : s.compositionId!, quantity: s.quantity?.toString() ?? "0",
  })), catalog);
  const rural = (code: string) => { const o = overrides.get(code); return o?.dmtPaved != null ? n(o.dmtPaved) : defaults.P as number; };
  const urban = (code: string) => { const o = overrides.get(code); return o?.dmtUrban != null ? n(o.dmtUrban) : defaultUrban; };
  const dmtFor = (code: string): Dmt => {
    const o = overrides.get(code);
    return { LN: o?.dmtNatural != null ? n(o.dmtNatural) : defaults.LN, RP: o?.dmtPrimary != null ? n(o.dmtPrimary) : defaults.RP, P: rural(code) + urban(code) };
  };

  // FIT (decisões #71–#74)
  const vmd = weightedVmd(b.trafficSegments.map((g) => ({ lengthKm: g.lengthKm.toString(), vmdPerLane: g.vmdPerLane.toString() })));
  const urbanSpeed = b.urbanSpeed?.toString() ?? String(FIT_URBAN_SPEED);
  const manual = b.fit?.toString() ?? "1";
  const fitOf = new Map<string, { value: string; a1: string; a2: string; reason: FitResult["reason"] }>();
  for (const m of weights) {
    const o = overrides.get(m.code);
    if (b.fitMode === "MANUAL") { fitOf.set(m.code, { value: manual, a1: "0", a2: "0", reason: null }); continue; }
    if (o && !o.applyFit) { fitOf.set(m.code, { value: "1", a1: "0", a2: "0", reason: null }); continue; }
    const r = calculateFit({ dmtRural: rural(m.code), dmtUrban: urban(m.code), vmdPerLane: vmd, stopGo: b.stopGo, passesWorksite: o?.passesWorksite ?? true, urbanSpeed });
    fitOf.set(m.code, { value: r.fit.toString(), a1: r.a1.toDecimalPlaces(2).toString(), a2: r.a2.toDecimalPlaces(2).toString(), reason: r.reason });
  }
  const moments = transportMoments(weights, dmtFor, (code) => fitOf.get(code)?.value ?? "1");
  const [comps, stopGoInBudget] = await Promise.all([
    moments.length
      ? prisma.composition.findMany({ where: { priceTableId: b.priceTableId, code: { in: moments.map((m) => m.code) } }, select: { id: true, code: true, description: true, unit: true, unitCost: true } })
      : Promise.resolve([]),
    prisma.wbsNode.count({ where: { budgetId, composition: { code: STOP_GO_COMPOSITION } } }).then((c) => c > 0),
  ]);
  const byCode = new Map(comps.map((c) => [c.code, c]));
  return {
    configured: isTransportConfigured(b, b.transportDmts),
    defaults, defaultUrban,
    fit: {
      mode: b.fitMode, manual, stopGo: b.stopGo, urbanSpeed, vmd: vmd ? vmd.toDecimalPlaces(1).toString() : null,
      segments: b.trafficSegments.map((g) => ({ id: g.id, description: g.description, lengthKm: g.lengthKm.toString(), vmdPerLane: g.vmdPerLane.toString() })),
      source: b.trafficSource, stopGoInBudget,
    },
    materials: weights.map((m) => {
      const o = overrides.get(m.code);
      return {
        ...m, dmt: dmtFor(m.code), dmtRural: rural(m.code), dmtUrban: urban(m.code),
        passesWorksite: o?.passesWorksite ?? true, applyFit: o?.applyFit ?? true, fit: fitOf.get(m.code)!,
        override: o ? { LN: o.dmtNatural?.toString() ?? null, RP: o.dmtPrimary?.toString() ?? null, P: o.dmtPaved?.toString() ?? null, U: o.dmtUrban?.toString() ?? null, passesWorksite: o.passesWorksite, applyFit: o.applyFit, note: o.note } : null,
      };
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

export function isTransportConfigured(
  b: { dmtNatural: Num; dmtPrimary: Num; dmtPaved: Num; dmtUrban?: Num },
  overrides: { dmtNatural: Num; dmtPrimary: Num; dmtPaved: Num; dmtUrban?: Num }[],
): boolean {
  const any = (o: { dmtNatural: Num; dmtPrimary: Num; dmtPaved: Num; dmtUrban?: Num }) => [o.dmtNatural, o.dmtPrimary, o.dmtPaved, o.dmtUrban ?? null].some((v) => n(v) > 0);
  return any(b) || overrides.some(any);
}
