// src/components/maintenance-panel.tsx
// Shows which compositions/inputs of a budget the SINAPI changed or
// deactivated after the budget's reference month (decisão #33).
import type { BudgetMaintenanceCheck } from "@/lib/pricing/maintenance-alerts";
import { refMonth } from "@/lib/format";

const SEVERITY: Record<string, { label: string; badge: string }> = {
  CRITICAL: { label: "desativada", badge: "danger" },
  CHANGE: { label: "alterada", badge: "warn" },
  INFO: { label: "informativo", badge: "" },
};

export function MaintenancePanel({ check }: { check: BudgetMaintenanceCheck }) {
  if (!check.reportMonth || check.reportMonth <= check.budgetMonth) return null;
  const { alerts } = check;
  const critical = alerts.filter((a) => a.severity === "CRITICAL").length;
  if (!alerts.length) {
    return (
      <p className="muted" style={{ marginTop: -6 }}>
        Nenhuma composição ou insumo deste orçamento mudou no SINAPI entre {refMonth(check.budgetMonth)} e {refMonth(check.reportMonth)}.
      </p>
    );
  }
  return (
    <details className="card" open={critical > 0}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>
        Mudanças no SINAPI depois de {refMonth(check.budgetMonth)}: {alerts.length} item(ns) deste orçamento
        {critical > 0 && <> · <span className="badge danger">{critical} desativado(s) ou suspenso(s)</span></>}
      </summary>
      <p className="muted" style={{ fontSize: 13 }}>
        Conferido com o relatório de manutenções de {refMonth(check.reportMonth)}. O orçamento continua calculado na base de {refMonth(check.budgetMonth)};
        os itens abaixo mudaram ou deixaram de existir nas referências seguintes.
      </p>
      <table className="list">
        <thead><tr><th>Situação</th><th>Tipo</th><th>Código</th><th>Descrição</th><th>Manutenções</th><th>Serviços da EAP</th></tr></thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={`${a.itemType}:${a.code}`}>
              <td><span className={`badge ${SEVERITY[a.severity].badge}`}>{SEVERITY[a.severity].label}</span></td>
              <td>{a.itemType === "COMPOSICAO" ? "Composição" : "Insumo"}</td>
              <td className="mono">{a.code}</td>
              <td>{a.description}</td>
              <td style={{ fontSize: 12.5 }}>{a.events.map((e, i) => <div key={i}>{refMonth(e.referenceMonth)} — {e.maintenance.toLowerCase()}</div>)}</td>
              <td className="mono" style={{ fontSize: 12.5 }}>{a.usedBy.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
