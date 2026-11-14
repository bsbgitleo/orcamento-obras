// src/lib/exports/budget-export.ts
// Everything the exports need from one budget (latest revision), computed by
// the same engine as the screens: lines as stored after recalculation,
// compositions opened item by item, schedule and ABC curves (decisões #59–#61).
import "server-only";
import { prisma } from "@/lib/prisma";
import { calculateCompositionCost, type Catalog, type CompositionChild, type CompositionCost } from "@/core/composition";
import { isMissingKey, isOwnCompositionKey, isOwnInputKey, ownCompositionKey } from "@/core/own-composition";
import { computeScheduleTree, type ScheduleTreeResult } from "@/core/schedule";
import type { Dec } from "@/core/money";
import { loadBudgetCatalog } from "@/lib/pricing/budget-catalog";
import { buildAbcReport, type AbcReport } from "@/lib/pricing/abc";

export interface ExportLine {
  id: string;
  parentId: string | null;
  level: number;
  kind: "STAGE" | "SERVICE";
  item: string; // 1.2.3
  compositionCode: string | null;
  /** SINAPI, SICRO ou Própria */
  source: string | null;
  description: string;
  unit: string | null;
  quantity: string | null;
  unitCost: string | null;
  totalCost: string | null;
  unitPrice: string | null;
  totalPrice: string | null;
  isSupplyItem: boolean;
  specification: string | null;
  measurementCriteria: string | null;
  requiresBrand: boolean;
  compositionKey: string | null;
}

export interface AnalyticItem {
  kind: string; // Insumo, Composição auxiliar, Tempo fixo, Acréscimo…
  group: string | null; // SICRO A–F
  code: string;
  description: string;
  unit: string;
  coefficient: string | null;
  unitPrice: Dec | null;
  cost: Dec | null;
}

export interface AnalyticComposition {
  key: string;
  code: string;
  description: string;
  unit: string;
  source: string;
  method: "SINAPI" | "SICRO";
  production: string | null;
  fic: string | null;
  cost: CompositionCost;
  items: AnalyticItem[];
  /** Linhas da EAP que usam a composição */
  usedBy: string[];
}

export interface BudgetExport {
  company: { name: string; document: string | null; address: string | null; phone: string | null; email: string | null; technicalLead: string | null; technicalRegistry: string | null };
  project: { id: string; code: string; name: string; type: string; category: string; uf: string; address: string | null; biddingAgency: string | null; biddingNumber: string | null; biddingModality: string | null };
  client: { name: string; document: string | null; address: string | null } | null;
  budget: {
    id: string; revision: number; status: string; updatedAt: Date;
    base: { origin: string; uf: string; referenceMonth: string; regime: string };
    bdi: { name: string; percent: string; workType: string; centralAdministration: string; insurance: string; risk: string; guarantee: string; financialExpenses: string; profit: string; pis: string; cofins: string; iss: string; cprb: string };
    supplyBdi: { name: string; percent: string } | null;
    socialCharges: { name: string; hourlyPct: string; monthlyPct: string };
    directCost: string; salePrice: string;
    proposalValidityDays: number | null; executionTerm: string | null; paymentTerms: string | null; proposalNotes: string | null;
    bidderInstructions: string | null; bidderPremises: string | null;
    scheduleMonths: number;
  };
  lines: ExportLine[];
  analytic: AnalyticComposition[];
  schedule: ScheduleTreeResult | null;
  abc: AbcReport;
}

const GROUP_KIND: Record<string, string> = {
  A: "Equipamento", B: "Mão de obra", C: "Material", D: "Atividade auxiliar", E: "Tempo fixo", F: "Transporte",
};

function describeChild(child: CompositionChild, catalog: Catalog): Omit<AnalyticItem, "unitPrice" | "cost"> {
  const group = "group" in child ? child.group ?? null : null;
  if (child.type === "PERCENTUAL") {
    return { kind: "Acréscimo", group, code: "", description: child.label ?? `${child.percent} % sobre o grupo ${group}`, unit: "%", coefficient: String(child.percent) };
  }
  if (child.type === "TRANSPORTE") {
    const ref = child.inputId ? catalog.getInput(child.inputId) : child.compositionId ? catalog.getComposition(child.compositionId) : undefined;
    return { kind: "Transporte", group: "F", code: ref?.code ?? "", description: `${ref?.description ?? ""} — DMT não informada (sem custo)`, unit: "t", coefficient: String(child.coefficient) };
  }
  if (child.type === "COMPOSICAO_AUXILIAR") {
    const c = catalog.getComposition(child.compositionId);
    const own = isOwnCompositionKey(child.compositionId);
    return {
      kind: group === "E" ? "Tempo fixo" : own ? "Composição própria" : "Composição auxiliar", group,
      code: c?.code ?? "?", description: c?.description ?? "(não encontrada)", unit: c?.unit ?? "", coefficient: String(child.coefficient),
    };
  }
  const i = catalog.getInput(child.inputId);
  const kind = group ? GROUP_KIND[group] ?? "Insumo" : isOwnInputKey(child.inputId) ? "Insumo próprio" : isMissingKey(child.inputId) ? "Não existe na base" : "Insumo";
  return { kind, group, code: i?.code ?? "?", description: i?.description ?? "(não encontrado)", unit: i?.unit ?? "", coefficient: String(child.coefficient) };
}

export async function loadBudgetExport(companyId: string, projectId: string): Promise<BudgetExport | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    include: {
      company: true, client: true,
      budgets: {
        orderBy: { revision: "desc" }, take: 1,
        include: {
          priceTable: true, bdi: true, supplyBdi: true, socialCharges: true, schedule: true,
          nodes: { include: { composition: { select: { code: true } }, ownComposition: { select: { code: true } } } },
        },
      },
    },
  });
  if (!project?.budgets[0]) return null;
  const budget = project.budgets[0];
  const sourceLabel = budget.priceTable.origin === "SICRO" ? "SICRO" : "SINAPI";

  // EAP em ordem de exibição
  const byParent = new Map<string | null, typeof budget.nodes>();
  for (const n of budget.nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
  const lines: ExportLine[] = [];
  const walk = (parentId: string | null, level: number) => {
    for (const n of (byParent.get(parentId) ?? []).sort((a, b) => a.position - b.position)) {
      const key = n.ownCompositionId ? ownCompositionKey(n.ownCompositionId) : n.compositionId;
      lines.push({
        id: n.id, parentId: n.parentId, level, kind: n.kind, item: n.code,
        compositionCode: n.ownComposition?.code ?? n.composition?.code ?? null,
        source: n.kind === "STAGE" ? null : n.ownCompositionId ? "Própria" : n.compositionId ? sourceLabel : null,
        description: n.description, unit: n.unit, quantity: n.quantity?.toString() ?? null,
        unitCost: n.unitCost?.toString() ?? null, totalCost: n.totalCost?.toString() ?? null,
        unitPrice: n.unitPrice?.toString() ?? null, totalPrice: n.totalPrice?.toString() ?? null,
        isSupplyItem: n.isSupplyItem, specification: n.specification, measurementCriteria: n.measurementCriteria, requiresBrand: n.requiresBrand,
        compositionKey: key,
      });
      if (n.kind === "STAGE") walk(n.id, level + 1);
    }
  };
  walk(null, 1);

  // Composições abertas (cada composição uma vez, com as linhas que a usam)
  const services = lines.filter((l) => l.kind === "SERVICE" && l.compositionKey);
  const analytic: AnalyticComposition[] = [];
  if (services.length) {
    const nodeById = new Map(budget.nodes.map((n) => [n.id, n]));
    const { catalog } = await loadBudgetCatalog(prisma, budget.priceTableId, companyId, {
      official: services.flatMap((s) => { const n = nodeById.get(s.id)!; return n.compositionId ? [n.compositionId] : []; }),
      own: services.flatMap((s) => { const n = nodeById.get(s.id)!; return n.ownCompositionId ? [n.ownCompositionId] : []; }),
    });
    const cache = new Map<string, CompositionCost>();
    const seen = new Map<string, AnalyticComposition>();
    for (const s of services) {
      const key = s.compositionKey!;
      const comp = catalog.getComposition(key);
      if (!comp) continue;
      let entry = seen.get(key);
      if (!entry) {
        const cost = calculateCompositionCost(key, catalog, cache);
        entry = {
          key, code: comp.code, description: comp.description, unit: comp.unit,
          source: isOwnCompositionKey(key) ? "Própria" : sourceLabel, method: comp.method === "SICRO" ? "SICRO" : "SINAPI",
          production: comp.production?.toString() ?? null, fic: comp.fic?.toString() ?? null, cost,
          items: cost.items.map((ic) => ({ ...describeChild(ic.item, catalog), unitPrice: ic.unitPrice, cost: ic.item.type === "TRANSPORTE" ? null : ic.cost })),
          usedBy: [],
        };
        seen.set(key, entry);
        analytic.push(entry);
      }
      entry.usedBy.push(s.item);
    }
  }

  // Cronograma (mesma montagem da tela)
  const stages = lines.filter((l) => l.kind === "STAGE").map((l) => ({ id: l.id, parentId: l.parentId, level: l.level, code: l.item, description: l.description, totalPrice: l.totalPrice ?? "0" }));
  const schedule = stages.length
    ? computeScheduleTree(stages, budget.schedule.map((c) => ({ nodeId: c.nodeId, month: c.month, percent: c.percent.toString() })), budget.scheduleMonths)
    : null;

  const abc = await buildAbcReport(prisma, budget.id);
  const s = (v: { toString(): string } | null | undefined) => v?.toString() ?? "0";
  return {
    company: {
      name: project.company.name, document: project.company.document, address: project.company.address, phone: project.company.phone,
      email: project.company.email, technicalLead: project.company.technicalLead, technicalRegistry: project.company.technicalRegistry,
    },
    project: {
      id: project.id, code: project.code, name: project.name, type: project.type, category: project.category, uf: project.uf, address: project.address,
      biddingAgency: project.biddingAgency, biddingNumber: project.biddingNumber, biddingModality: project.biddingModality,
    },
    client: project.client ? { name: project.client.name, document: project.client.document, address: project.client.address } : null,
    budget: {
      id: budget.id, revision: budget.revision, status: budget.status, updatedAt: budget.updatedAt,
      base: { origin: budget.priceTable.origin, uf: budget.priceTable.uf, referenceMonth: budget.priceTable.referenceMonth, regime: budget.priceTable.regime },
      bdi: {
        name: budget.bdi.name, percent: s(budget.bdi.percent), workType: budget.bdi.workType,
        centralAdministration: s(budget.bdi.centralAdministration), insurance: s(budget.bdi.insurance), risk: s(budget.bdi.risk), guarantee: s(budget.bdi.guarantee),
        financialExpenses: s(budget.bdi.financialExpenses), profit: s(budget.bdi.profit), pis: s(budget.bdi.pis), cofins: s(budget.bdi.cofins), iss: s(budget.bdi.iss), cprb: s(budget.bdi.cprb),
      },
      supplyBdi: budget.supplyBdi ? { name: budget.supplyBdi.name, percent: s(budget.supplyBdi.percent) } : null,
      socialCharges: { name: budget.socialCharges.name, hourlyPct: s(budget.socialCharges.hourlyPct), monthlyPct: s(budget.socialCharges.monthlyPct) },
      directCost: s(budget.directCost), salePrice: s(budget.salePrice),
      proposalValidityDays: budget.proposalValidityDays, executionTerm: budget.executionTerm, paymentTerms: budget.paymentTerms, proposalNotes: budget.proposalNotes,
      bidderInstructions: budget.bidderInstructions, bidderPremises: budget.bidderPremises, scheduleMonths: budget.scheduleMonths,
    },
    lines, analytic, schedule, abc,
  };
}
