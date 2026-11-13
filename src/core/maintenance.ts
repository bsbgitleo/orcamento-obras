// src/core/maintenance.ts
// Alerts for a budget priced on an older reference: which of its compositions
// and inputs the official base changed or deactivated afterwards (decisão #33).
// Pure: the caller supplies the items the budget uses and the maintenance log.

export type MaintenanceSeverity = "CRITICAL" | "CHANGE" | "INFO";

/** Severity of one SINAPI maintenance text ("DESATIVAÇÃO", "ALTERAÇÃO DE ITENS/COEFICIENTES"…). */
export function maintenanceSeverity(text: string): MaintenanceSeverity {
  const t = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (t.includes("DESATIVA") || t.includes("SUSPENS") || t.includes("EXCLU")) return "CRITICAL";
  if (t.startsWith("CRIACAO") || t.startsWith("INICIO DIVULGACAO") || t.startsWith("INICIO DA DIVULGACAO")) return "INFO";
  return "CHANGE"; // alteração de itens/coeficientes, família, unidade, descrição e textos novos
}

const RANK: Record<MaintenanceSeverity, number> = { CRITICAL: 0, CHANGE: 1, INFO: 2 };

export interface MaintenanceRecord {
  referenceMonth: string; // "2026-11"
  itemType: "INSUMO" | "COMPOSICAO";
  code: string;
  description: string;
  maintenance: string;
}

export interface UsedItem {
  itemType: "INSUMO" | "COMPOSICAO";
  code: string;
  description: string;
  /** Códigos da EAP dos serviços que usam o item (direta ou indiretamente) */
  usedBy: string[];
}

export interface MaintenanceAlert extends UsedItem {
  severity: MaintenanceSeverity;
  events: { referenceMonth: string; maintenance: string; severity: MaintenanceSeverity }[];
}

/**
 * Keeps only maintenances published after the budget's reference month, for
 * items the budget uses. One alert per item, with every event in month order;
 * the alert takes the most severe event. Sorted: critical first, then by type
 * (compositions before inputs) and code.
 */
export function maintenanceAlerts(used: UsedItem[], records: MaintenanceRecord[], budgetMonth: string): MaintenanceAlert[] {
  const key = (t: string, c: string) => `${t}:${c}`;
  const usedByKey = new Map(used.map((u) => [key(u.itemType, u.code), u]));
  const alerts = new Map<string, MaintenanceAlert>();
  for (const r of records) {
    if (r.referenceMonth <= budgetMonth) continue;
    const k = key(r.itemType, r.code);
    const u = usedByKey.get(k);
    if (!u) continue;
    const severity = maintenanceSeverity(r.maintenance);
    let a = alerts.get(k);
    if (!a) { a = { ...u, severity, events: [] }; alerts.set(k, a); }
    a.events.push({ referenceMonth: r.referenceMonth, maintenance: r.maintenance, severity });
    if (RANK[severity] < RANK[a.severity]) a.severity = severity;
  }
  for (const a of alerts.values()) a.events.sort((x, y) => x.referenceMonth.localeCompare(y.referenceMonth));
  return [...alerts.values()].sort((a, b) =>
    RANK[a.severity] - RANK[b.severity]
    || (a.itemType === b.itemType ? 0 : a.itemType === "COMPOSICAO" ? -1 : 1)
    || a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
}
