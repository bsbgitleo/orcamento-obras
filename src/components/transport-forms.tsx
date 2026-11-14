// src/components/transport-forms.tsx
"use client";
import { useActionState } from "react";
import { saveMaterialDmt, saveTransportDefaults } from "@/lib/actions/transport";
import { idle, type ActionState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton, err, val } from "./form";

const comma = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));

export function TransportDefaultsForm({ budgetId, data, readOnly }: { budgetId: string; data: { dmtNatural: string | null; dmtPrimary: string | null; dmtPaved: string | null; fit: string | null }; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveTransportDefaults.bind(null, budgetId), idle);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <Field label="Leito natural (km)" name="dmtNatural" error={err(state, "dmtNatural")}><input id="dmtNatural" name="dmtNatural" inputMode="decimal" defaultValue={val(state, "dmtNatural", comma(data.dmtNatural))} placeholder="0" /></Field>
          <Field label="Revestimento primário (km)" name="dmtPrimary" error={err(state, "dmtPrimary")}><input id="dmtPrimary" name="dmtPrimary" inputMode="decimal" defaultValue={val(state, "dmtPrimary", comma(data.dmtPrimary))} placeholder="0" /></Field>
          <Field label="Pavimentada (km)" name="dmtPaved" error={err(state, "dmtPaved")}><input id="dmtPaved" name="dmtPaved" inputMode="decimal" defaultValue={val(state, "dmtPaved", comma(data.dmtPaved))} placeholder="0" /></Field>
          <Field label="FIT (multiplica a pavimentada)" name="fit" error={err(state, "fit")} hint="Em branco = 1,00"><input id="fit" name="fit" inputMode="decimal" defaultValue={val(state, "fit", comma(data.fit))} placeholder="1,00" /></Field>
        </div>
      </fieldset>
      {!readOnly && <div className="actions"><SubmitButton>Salvar e recalcular</SubmitButton></div>}
    </form>
  );
}

export function MaterialDmtForm({ budgetId, code, data, readOnly }: { budgetId: string; code: string; data: { LN: string | null; RP: string | null; P: string | null; note: string | null } | null; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveMaterialDmt.bind(null, budgetId, code), idle);
  const input = (name: string, v: string | null | undefined, label: string) => (
    <input name={name} inputMode="decimal" aria-label={label} title={err(state, name) ?? label} defaultValue={val(state, name, comma(v))} placeholder="padrão"
      style={{ width: 72, padding: "3px 6px", textAlign: "right", borderColor: err(state, name) ? "var(--danger)" : undefined }} disabled={readOnly} />
  );
  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {input("dmtNatural", data?.LN, "DMT leito natural (km)")}
      {input("dmtPrimary", data?.RP, "DMT revestimento primário (km)")}
      {input("dmtPaved", data?.P, "DMT pavimentada (km)")}
      <input name="note" aria-label="Origem" placeholder="origem (ex.: pedreira X)" defaultValue={val(state, "note", data?.note ?? "")} style={{ width: 170, padding: "3px 6px" }} disabled={readOnly} />
      {!readOnly && <SubmitButton className="btn small secondary">Salvar</SubmitButton>}
      {state.status === "ok" && <span className="muted" style={{ fontSize: 12 }}>{state.message}</span>}
      {state.status === "error" && <span style={{ fontSize: 12, color: "var(--danger)" }}>{state.message}</span>}
    </form>
  );
}
