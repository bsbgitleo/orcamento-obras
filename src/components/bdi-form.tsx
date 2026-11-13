// src/components/bdi-form.tsx
"use client";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { saveBdi, deleteBdi } from "@/lib/actions/bdi";
import { idle, type ActionState } from "@/lib/forms";
import { calculateBdi, classifyBdi, TCU_BDI_RANGES, type WorkType } from "@/core/bdi";
import { WORK_TYPE_LABEL } from "@/lib/format";
import { Field, FormMessage, SubmitButton, err, val } from "./form";

export interface BdiData {
  id: string; name: string; workType: WorkType;
  centralAdministration: string; insurance: string; risk: string; guarantee: string;
  financialExpenses: string; profit: string; pis: string; cofins: string; iss: string; cprb: string;
  notes: string | null;
}

/** Valores médios do Acórdão 2622/2013 para edificações (ponto de partida). */
const DEFAULTS = {
  workType: "EDIFICACOES" as WorkType,
  centralAdministration: "4.00", insurance: "0.80", risk: "1.27", guarantee: "0",
  financialExpenses: "1.23", profit: "7.40", pis: "0.65", cofins: "3.00", iss: "3.00", cprb: "0",
};

const parts: { name: keyof typeof DEFAULTS; label: string; hint?: string }[] = [
  { name: "centralAdministration", label: "Administração central (AC) %" },
  { name: "insurance", label: "Seguro (S) %" },
  { name: "guarantee", label: "Garantia (G) %" },
  { name: "risk", label: "Risco (R) %" },
  { name: "financialExpenses", label: "Despesas financeiras (DF) %" },
  { name: "profit", label: "Lucro (L) %" },
];
const taxes: { name: keyof typeof DEFAULTS; label: string; hint?: string }[] = [
  { name: "pis", label: "PIS %", hint: "Regime cumulativo: 0,65 %" },
  { name: "cofins", label: "COFINS %", hint: "Regime cumulativo: 3,00 %" },
  { name: "iss", label: "ISS efetivo %", hint: "Alíquota do município sobre a base de cálculo (2 a 5 %)" },
  { name: "cprb", label: "CPRB %", hint: "Só com desoneração da folha (ex.: 4,5 %)" },
];

const toNum = (s: string) => s.replace(",", ".");

export function BdiForm({ bdi }: { bdi: BdiData | null }) {
  const action = saveBdi.bind(null, bdi?.id ?? null);
  const [state, formAction] = useActionState<ActionState, FormData>(action, idle);
  const initial = (k: keyof typeof DEFAULTS) => val(state, k, bdi ? bdi[k] : DEFAULTS[k]);

  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, initial(k as keyof typeof DEFAULTS)])));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const live = useMemo(() => {
    try {
      const r = calculateBdi({
        centralAdministration: toNum(form.centralAdministration), insurance: toNum(form.insurance), risk: toNum(form.risk),
        guarantee: toNum(form.guarantee), financialExpenses: toNum(form.financialExpenses), profit: toNum(form.profit),
        taxes: { pis: toNum(form.pis), cofins: toNum(form.cofins), iss: toNum(form.iss), cprb: toNum(form.cprb || "0") },
      });
      const wt = form.workType as WorkType;
      return { percent: r.percent.toFixed(2), taxes: r.taxesPct.toFixed(2), status: classifyBdi(r.percent, wt), range: TCU_BDI_RANGES[wt] };
    } catch {
      return null;
    }
  }, [form]);

  return (
    <form action={formAction}>
      <FormMessage state={state} />
      <div className="card">
        <div className="form-grid">
          <Field label="Nome do BDI" name="name" error={err(state, "name")}>
            <input id="name" name="name" type="text" defaultValue={val(state, "name", bdi?.name)} required placeholder="Ex.: Edificações – padrão" />
          </Field>
          <Field label="Tipo de obra (faixas do TCU)" name="workType" error={err(state, "workType")}>
            <select id="workType" name="workType" value={form.workType} onChange={set("workType")}>
              {Object.entries(WORK_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>

        <h2>Despesas indiretas e lucro</h2>
        <div className="form-grid">
          {parts.map((p) => (
            <Field key={p.name} label={p.label} name={p.name} error={err(state, p.name)} hint={p.hint}>
              <input id={p.name} name={p.name} type="text" inputMode="decimal" value={form[p.name]} onChange={set(p.name)} />
            </Field>
          ))}
        </div>

        <h2>Tributos (I)</h2>
        <div className="form-grid">
          {taxes.map((p) => (
            <Field key={p.name} label={p.label} name={p.name} error={err(state, p.name)} hint={p.hint}>
              <input id={p.name} name={p.name} type="text" inputMode="decimal" value={form[p.name]} onChange={set(p.name)} />
            </Field>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 10 }}>IRPJ e CSLL não entram no BDI (Súmula TCU 254).</p>

        <h2>Observações</h2>
        <textarea name="notes" defaultValue={val(state, "notes", bdi?.notes)} placeholder="Memória de cálculo, justificativas para valores fora das faixas, base de cálculo do ISS…" />
      </div>

      <div className="card result-box">
        <div className="muted">BDI = [(1 + AC + S + R + G) × (1 + DF) × (1 + L) / (1 − I)] − 1 &nbsp;·&nbsp; Acórdão TCU 2622/2013</div>
        {live ? (
          <>
            <div className="big">{live.percent.replace(".", ",")} %</div>
            <div>Tributos (I): {live.taxes.replace(".", ",")} % &nbsp;·&nbsp; Faixa de referência ({WORK_TYPE_LABEL[form.workType]}): {live.range.q1.replace(".", ",")} % a {live.range.q3.replace(".", ",")} % (médio {live.range.median.replace(".", ",")} %) &nbsp;
              {live.status === "WITHIN" && <span className="badge ok">dentro da faixa</span>}
              {live.status === "BELOW" && <span className="badge warn">abaixo do 1º quartil</span>}
              {live.status === "ABOVE" && <span className="badge warn">acima do 3º quartil — justificar</span>}
            </div>
          </>
        ) : <div className="badge danger">valores inválidos</div>}
      </div>

      <div className="actions">
        {bdi && <button type="button" className="btn danger" onClick={() => { if (confirm("Excluir este BDI?")) deleteBdi(bdi.id); }}>Excluir</button>}
        <Link className="btn secondary" href="/bdi">Cancelar</Link>
        <SubmitButton>Salvar</SubmitButton>
      </div>
    </form>
  );
}
