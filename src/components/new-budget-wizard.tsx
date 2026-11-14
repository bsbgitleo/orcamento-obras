// src/components/new-budget-wizard.tsx
"use client";
import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { createBudget } from "@/lib/actions/budgets";
import { idle, type ActionState } from "@/lib/forms";
import { CATEGORY_LABEL, REGIME_LABEL, UFS, WORK_TYPE_LABEL, pct, refMonth } from "@/lib/format";
import { Field, FormMessage, err, val } from "./form";
import { useFormStatus } from "react-dom";

export interface WizardOptions {
  clients: { id: string; name: string }[];
  bdis: { id: string; name: string; percent: string; workType: string }[];
  charges: { id: string; name: string; regime: string; hourlyPct: string; monthlyPct: string }[];
  tables: { id: string; origin: string; uf: string; referenceMonth: string; regime: string; compositions: number }[];
  nextCode: string;
}

const STEPS = ["Dados gerais", "Arredondamento, encargos e BDI", "Base de preços"];
const STEP_FIELDS: string[][] = [
  ["type", "name", "clientId", "category", "uf", "address", "deadlineDays", "biddingModality", "biddingNumber", "biddingAgency", "biddingOpensAt"],
  ["socialChargesId", "bdiId", "supplyBdiId", "useSupplyBdi"],
  ["priceTableId"],
];

function stepOfFirstError(state: ActionState): number | null {
  if (state.status !== "error" || !state.fieldErrors) return null;
  const keys = Object.keys(state.fieldErrors);
  for (let i = 0; i < STEP_FIELDS.length; i++) if (keys.some((k) => STEP_FIELDS[i].includes(k))) return i;
  return null;
}

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn" disabled={pending}>{pending ? "Criando…" : "Criar orçamento"}</button>;
}

export function NewBudgetWizard({ options }: { options: WizardOptions }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createBudget, idle);
  const [step, setStep] = useState(0);
  const [type, setType] = useState(val(state, "type", "PUBLIC"));
  const [useSupply, setUseSupply] = useState(val(state, "useSupplyBdi", "") === "on");
  const [tableId, setTableId] = useState(val(state, "priceTableId", options.tables[0]?.id ?? ""));
  const [chargesId, setChargesId] = useState(val(state, "socialChargesId", ""));

  // Choosing a social-charges table pre-selects a price table with the same regime.
  const onChargesChange = (id: string) => {
    setChargesId(id);
    const regime = options.charges.find((c) => c.id === id)?.regime;
    const current = options.tables.find((t) => t.id === tableId);
    if (regime && current?.regime !== regime) {
      const match = options.tables.find((t) => t.regime === regime);
      if (match) setTableId(match.id);
    }
  };
  const formRef = useRef<HTMLFormElement>(null);

  // After a server-side validation error, jump to the step holding the first invalid field.
  const [handledState, setHandledState] = useState<ActionState>(state);
  if (handledState !== state) {
    setHandledState(state);
    const s = stepOfFirstError(state);
    if (s !== null) setStep(s);
  }

  const selectedTable = options.tables.find((t) => t.id === tableId);
  const selectedCharges = options.charges.find((c) => c.id === chargesId);
  const regimeMismatch = selectedTable && selectedCharges && selectedTable.regime !== selectedCharges.regime;

  const next = () => {
    // Native validation only for the fields of the current step
    const form = formRef.current;
    if (form) {
      for (const name of STEP_FIELDS[step]) {
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
        if (el && "reportValidity" in el && !el.reportValidity()) return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const missing: string[] = [];
  if (options.bdis.length === 0) missing.push("um BDI");
  if (options.charges.length === 0) missing.push("uma tabela de encargos sociais");
  if (options.tables.length === 0) missing.push("uma base de preços importada");

  return (
    <form ref={formRef} action={formAction}>
      <div className="steps">
        {STEPS.map((label, i) => (
          <div key={label} className={`step${i === step ? " active" : i < step ? " done" : ""}`}>{i + 1}. {label}</div>
        ))}
      </div>
      <FormMessage state={state} />
      {missing.length > 0 && (
        <div className="form-error">Antes de criar um orçamento, cadastre {missing.join(", ")}. Veja <Link href="/bdi">BDI</Link>, <Link href="/encargos">Encargos sociais</Link> e <Link href="/bases">Bases</Link>.</div>
      )}

      {/* ── Passo 1 ── */}
      <div className="card" hidden={step !== 0}>
        <div className="form-grid">
          <Field label="Tipo de obra" name="type" error={err(state, "type")}>
            <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="PUBLIC">Obra pública (licitação)</option>
              <option value="PRIVATE">Obra privada</option>
            </select>
          </Field>
          <Field label="Código" name="code" hint="Gerado automaticamente">
            <input id="code" type="text" value={options.nextCode} readOnly disabled />
          </Field>
          <Field label="Descrição" name="name" error={err(state, "name")} span2>
            <input id="name" name="name" type="text" required defaultValue={val(state, "name", "")} placeholder="Ex.: Reforma da Escola Classe 12 — Taguatinga" />
          </Field>
          <Field label="Cliente" name="clientId" error={err(state, "clientId")} hint={options.clients.length === 0 ? "Nenhum cliente cadastrado (opcional)" : undefined}>
            <select id="clientId" name="clientId" defaultValue={val(state, "clientId", "")}>
              <option value="">— sem cliente —</option>
              {options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Categoria" name="category" error={err(state, "category")}>
            <select id="category" name="category" required defaultValue={val(state, "category", "")}>
              <option value="">— escolha —</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="UF da obra" name="uf" error={err(state, "uf")}>
            <select id="uf" name="uf" defaultValue={val(state, "uf", "DF")}>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Prazo de entrega do orçamento (dias)" name="deadlineDays" error={err(state, "deadlineDays")}>
            <input id="deadlineDays" name="deadlineDays" type="number" min={0} step={1} defaultValue={val(state, "deadlineDays", "")} />
          </Field>
          <Field label="Endereço / local da obra" name="address" error={err(state, "address")} span2>
            <input id="address" name="address" type="text" defaultValue={val(state, "address", "")} />
          </Field>
        </div>

        <fieldset style={{ marginTop: 18 }} hidden={type !== "PUBLIC"} disabled={type !== "PUBLIC"}>
          <legend>Licitação</legend>
          <div className="form-grid">
            <Field label="Órgão licitante" name="biddingAgency" error={err(state, "biddingAgency")} span2>
              <input id="biddingAgency" name="biddingAgency" type="text" defaultValue={val(state, "biddingAgency", "")} />
            </Field>
            <Field label="Modalidade / critério" name="biddingModality" error={err(state, "biddingModality")} hint="Ex.: Concorrência — menor preço global">
              <input id="biddingModality" name="biddingModality" type="text" defaultValue={val(state, "biddingModality", "")} />
            </Field>
            <Field label="Número do processo / edital" name="biddingNumber" error={err(state, "biddingNumber")}>
              <input id="biddingNumber" name="biddingNumber" type="text" defaultValue={val(state, "biddingNumber", "")} />
            </Field>
            <Field label="Abertura (data e hora)" name="biddingOpensAt" error={err(state, "biddingOpensAt")}>
              <input id="biddingOpensAt" name="biddingOpensAt" type="datetime-local" defaultValue={val(state, "biddingOpensAt", "")} />
            </Field>
          </div>
        </fieldset>
      </div>

      {/* ── Passo 2 ── */}
      <div className="card" hidden={step !== 1}>
        <h2 style={{ marginTop: 0 }}>Arredondamento</h2>
        <p>Custo de cada item = <code>TRUNC(coeficiente × preço, 2)</code>; custo da composição = soma dos itens; custo do serviço = <code>TRUNC(quantidade × custo unitário, 2)</code>. É a regra do SINAPI (conferida centavo a centavo). Nas bases do SICRO, a composição segue o método do DNIT (itens com 4 casas e custo final arredondado meio para cima, também conferido centavo a centavo); o custo do serviço e o preço com BDI seguem a mesma regra acima.</p>

        <h2>Encargos sociais</h2>
        <Field label="Tabela de encargos sociais" name="socialChargesId" error={err(state, "socialChargesId")} hint="Deve ter o mesmo regime (desonerado / não desonerado) da base de preços">
          <select id="socialChargesId" name="socialChargesId" required value={chargesId} onChange={(e) => onChargesChange(e.target.value)}>
            <option value="">— escolha —</option>
            {options.charges.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.name.includes(REGIME_LABEL[c.regime]) ? "" : ` — ${REGIME_LABEL[c.regime]}`} (horista {pct(c.hourlyPct)}, mensalista {pct(c.monthlyPct)})</option>
            ))}
          </select>
        </Field>
        {regimeMismatch && <p className="error" style={{ color: "var(--danger)", marginTop: 6 }}>Atenção: a base de preços selecionada é &ldquo;{REGIME_LABEL[selectedTable!.regime]}&rdquo; e esta tabela de encargos é &ldquo;{REGIME_LABEL[selectedCharges!.regime]}&rdquo;.</p>}

        <h2>BDI</h2>
        <div className="form-grid">
          <Field label="BDI do orçamento" name="bdiId" error={err(state, "bdiId")}>
            <select id="bdiId" name="bdiId" required defaultValue={val(state, "bdiId", "")}>
              <option value="">— escolha —</option>
              {options.bdis.map((b) => <option key={b.id} value={b.id}>{b.name} — {pct(b.percent)} ({WORK_TYPE_LABEL[b.workType]})</option>)}
            </select>
          </Field>
          <div className="field">
            <label className="checkbox" style={{ marginTop: 22 }}>
              <input type="checkbox" name="useSupplyBdi" checked={useSupply} onChange={(e) => setUseSupply(e.target.checked)} />
              Usar BDI reduzido para itens de mero fornecimento
            </label>
            <span className="hint">Materiais e equipamentos relevantes só intermediados pela construtora (Súmula TCU 253)</span>
          </div>
          {useSupply && (
            <Field label="BDI de mero fornecimento" name="supplyBdiId" error={err(state, "supplyBdiId")} span2>
              <select id="supplyBdiId" name="supplyBdiId" defaultValue={val(state, "supplyBdiId", "")}>
                <option value="">— escolha —</option>
                {options.bdis.map((b) => <option key={b.id} value={b.id}>{b.name} — {pct(b.percent)} ({WORK_TYPE_LABEL[b.workType]})</option>)}
              </select>
            </Field>
          )}
        </div>
      </div>

      {/* ── Passo 3 ── */}
      <div className="card" hidden={step !== 2}>
        <h2 style={{ marginTop: 0 }}>Base de preços</h2>
        {options.tables.length === 0 ? (
          <p className="muted">Nenhuma tabela importada.</p>
        ) : (
          <table className="list">
            <thead><tr><th></th><th>Origem</th><th>UF</th><th>Referência</th><th>Regime</th><th className="num">Composições</th></tr></thead>
            <tbody>
              {options.tables.map((t) => (
                <tr key={t.id}>
                  <td><input type="radio" name="priceTableId" value={t.id} checked={tableId === t.id} onChange={() => setTableId(t.id)} aria-label={`Selecionar ${t.origin} ${t.uf} ${refMonth(t.referenceMonth)}`} /></td>
                  <td>{t.origin}</td><td>{t.uf}</td><td>{refMonth(t.referenceMonth)}</td><td>{REGIME_LABEL[t.regime]}</td>
                  <td className="num">{t.compositions.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {err(state, "priceTableId") && <p className="error" style={{ color: "var(--danger)" }}>{err(state, "priceTableId")}</p>}
        <p className="muted" style={{ marginTop: 12 }}>Todo preço do orçamento ficará rastreado a esta origem, UF, mês de referência e regime.</p>
      </div>

      <div className="actions">
        <Link className="btn secondary" href="/orcamentos">Cancelar</Link>
        {step > 0 && <button type="button" className="btn secondary" onClick={() => setStep((s) => s - 1)}>Voltar</button>}
        {step < STEPS.length - 1 && <button type="button" className="btn" onClick={next}>Avançar</button>}
        {step === STEPS.length - 1 && <Submit />}
      </div>
    </form>
  );
}
