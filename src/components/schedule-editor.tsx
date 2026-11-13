// src/components/schedule-editor.tsx
"use client";
import { useActionState, useMemo, useState } from "react";
import { saveSchedule } from "@/lib/actions/schedule";
import { idle, type ActionState } from "@/lib/forms";
import { computeScheduleTree, linearPercents, type ScheduleTreeStage } from "@/core/schedule";
import { brl } from "@/lib/format";
import { FormMessage, SubmitButton } from "./form";

interface Props {
  budgetId: string;
  stages: ScheduleTreeStage[];
  initialMonths: number;
  initialCells: { nodeId: string; month: number; percent: string }[];
  readOnly?: boolean;
}

const toInput = (s: string) => (s === "0" ? "" : s.replace(".", ","));
const toDec = (s: string) => (s.trim() === "" ? "0" : s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
const fmtPct = (v: { toFixed(n: number): string }) => v.toFixed(2).replace(".", ",") + " %";

export function ScheduleEditor({ budgetId, stages, initialMonths, initialCells, readOnly = false }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(saveSchedule.bind(null, budgetId), idle);
  const [months, setMonths] = useState(initialMonths);
  const [grid, setGrid] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialCells.map((c) => [`${c.nodeId}:${c.month}`, toInput(c.percent.replace(/\.?0+$/, "") || "0")])));

  const set = (nodeId: string, month: number, v: string) => setGrid((g) => ({ ...g, [`${nodeId}:${month}`]: v }));
  const fillLinear = (nodeId: string) => {
    const p = linearPercents(months);
    setGrid((g) => {
      const n = { ...g };
      for (let m = 1; m <= months; m++) n[`${nodeId}:${m}`] = p[m - 1].toString().replace(".", ",");
      return n;
    });
  };
  const clearRow = (nodeId: string) => setGrid((g) => { const n = { ...g }; for (let m = 1; m <= months; m++) delete n[`${nodeId}:${m}`]; return n; });

  const result = useMemo(() => {
    const cells = Object.entries(grid).flatMap(([k, v]) => {
      const [nodeId, month] = k.split(":");
      const d = toDec(v);
      return /^\d+(\.\d+)?$/.test(d) && Number(month) <= months ? [{ nodeId, month: Number(month), percent: d }] : [];
    });
    return computeScheduleTree(stages, cells, months);
  }, [grid, months, stages]);

  const monthIdx = Array.from({ length: months }, (_, i) => i + 1);

  return (
    <form action={action}>
      <FormMessage state={state} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="toolbar">
        <label className="checkbox">Duração (meses):&nbsp;
          <input type="number" name="months" min={1} max={60} value={months} onChange={(e) => setMonths(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} style={{ width: 80 }} />
        </label>
        {!readOnly && <SubmitButton>Salvar cronograma</SubmitButton>}
      </div>
      {result.incompleteRows > 0 && <div className="form-error">{result.incompleteRows} etapa(s) com percentual diferente de 100 %. Em obra pública, cada etapa deve somar 100 %.</div>}
      <p className="muted">Preencha os percentuais nas etapas sem subetapas; as etapas-pai mostram a soma. Uma etapa com serviços diretos e subetapas ganha a linha &ldquo;Serviços diretos&rdquo;.</p>

      <div style={{ overflowX: "auto" }}>
        <table className="list schedule">
          <thead>
            <tr>
              <th>Item</th><th>Etapa</th><th className="num">Preço (R$)</th>
              {monthIdx.map((m) => <th key={m} className="num">Mês {m}</th>)}
              <th className="num">Total %</th><th></th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={`${row.stage.id}:${row.editable ? "e" : "p"}`} className={row.incomplete ? "incomplete" : undefined} style={row.editable ? undefined : { fontWeight: 600, background: row.level === 1 ? "#f4f6f8" : "#fafbfc" }}>
                <td className="mono">{row.stage.code}</td>
                <td style={{ paddingLeft: 8 + (row.level - 1) * 18 }}>{row.stage.description}</td>
                <td className="num">{brl(row.price)}</td>
                {!row.editable && monthIdx.map((m) => (
                  <td key={m} className="num">{row.values[m - 1].isZero() ? <span className="muted">—</span> : <>{fmtPct(row.percents[m - 1])}<div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{brl(row.values[m - 1])}</div></>}</td>
                ))}
                {row.editable && monthIdx.map((m) => {
                  const key = `p_${row.stage.id}_${m}`;
                  const bad = state.status === "error" && state.fieldErrors?.[key];
                  return (
                    <td key={m} className="num">
                      <input name={key} value={grid[`${row.stage.id}:${m}`] ?? ""} onChange={(e) => set(row.stage.id, m, e.target.value)} inputMode="decimal"
                        aria-label={`${row.stage.description} mês ${m} (%)`} placeholder="%" title={bad || undefined}
                        style={{ width: 70, textAlign: "right", padding: "3px 5px", borderColor: bad ? "var(--danger)" : undefined }} />
                      <div className="muted" style={{ fontSize: 11 }}>{row.values[m - 1].isZero() ? "" : brl(row.values[m - 1])}</div>
                    </td>
                  );
                })}
                <td className="num" style={{ fontWeight: 600, color: row.incomplete ? "var(--danger)" : row.totalPct.eq(100) ? "var(--ok)" : undefined }}>{fmtPct(row.totalPct)}</td>
                <td className="row-actions">
                  {row.editable && <>
                    <button type="button" className="icon" title="Distribuir linearmente" onClick={() => fillLinear(row.stage.id)}>linear</button>
                    <button type="button" className="icon" title="Limpar linha" onClick={() => clearRow(row.stage.id)}>limpar</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 600, background: "#f4f6f8" }}>
              <td colSpan={2}>Total do mês</td><td className="num">{brl(result.total)}</td>
              {monthIdx.map((m) => <td key={m} className="num">{brl(result.monthTotals[m - 1])}<div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{fmtPct(result.monthPct[m - 1])}</div></td>)}
              <td colSpan={2}></td>
            </tr>
            <tr style={{ fontWeight: 600, background: "#f4f6f8" }}>
              <td colSpan={2}>Acumulado</td><td></td>
              {monthIdx.map((m) => <td key={m} className="num">{brl(result.cumulative[m - 1])}<div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{fmtPct(result.cumulativePct[m - 1])}</div></td>)}
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      </fieldset>
      <p className="muted" style={{ marginTop: 10 }}>Valores = preço de venda da etapa × %. O último mês de cada etapa recebe a diferença de centavos para a soma fechar exatamente.</p>
    </form>
  );
}
