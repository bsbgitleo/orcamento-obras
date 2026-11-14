// src/components/transport-forms.tsx
"use client";
import { useActionState, useState } from "react";
import { addTrafficSegment, removeTrafficSegment, saveFitSettings, saveMaterialDmt, saveTransportDefaults } from "@/lib/actions/transport";
import { idle, type ActionState } from "@/lib/forms";
import { ConfirmButton } from "./confirm-button";
import { Field, FormMessage, SubmitButton, err, val } from "./form";

const comma = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));

export function TransportDefaultsForm({ budgetId, data, readOnly }: { budgetId: string; data: { dmtNatural: string | null; dmtPrimary: string | null; dmtPaved: string | null; dmtUrban: string | null }; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveTransportDefaults.bind(null, budgetId), idle);
  const field = (name: keyof typeof data, label: string, hint?: string) => (
    <Field label={label} name={name} error={err(state, name)} hint={hint}>
      <input id={name} name={name} inputMode="decimal" defaultValue={val(state, name, comma(data[name]))} placeholder="0" />
    </Field>
  );
  return (
    <form action={action}>
      <FormMessage state={state} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {field("dmtNatural", "Leito natural (km)")}
          {field("dmtPrimary", "Revestimento primário (km)")}
          {field("dmtPaved", "Pavimentada — rodovia rural (km)", "DMTr")}
          {field("dmtUrban", "Pavimentada — via urbana (km)", "DMTu: trecho por centros urbanos")}
        </div>
      </fieldset>
      {!readOnly && <div className="actions"><SubmitButton>Salvar e recalcular</SubmitButton></div>}
    </form>
  );
}

export interface FitFormData {
  mode: "CALCULATED" | "MANUAL"; manual: string | null; stopGo: boolean; urbanSpeed: string | null; source: string | null; stopGoInBudget: boolean;
}

export function FitForm({ budgetId, data, readOnly }: { budgetId: string; data: FitFormData; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveFitSettings.bind(null, budgetId), idle);
  const [mode, setMode] = useState(val(state, "fitMode", data.mode));
  const [stopGo, setStopGo] = useState(data.stopGo);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" name="fitMode" value="CALCULATED" checked={mode === "CALCULATED"} onChange={() => setMode("CALCULATED")} /> Calcular pelo Volume 05 do DNIT (2025), por material
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" name="fitMode" value="MANUAL" checked={mode === "MANUAL"} onChange={() => setMode("MANUAL")} /> Informar um FIT único
          </label>
        </div>
        <div hidden={mode !== "CALCULATED"}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <input type="checkbox" name="stopGo" defaultChecked={data.stopGo} onChange={(e) => setStopGo(e.target.checked)} /> A obra tem operação PARE e SIGA (uma faixa para os dois sentidos)
          </label>
          {stopGo && !data.stopGoInBudget && (
            <div className="form-error" style={{ background: "#fff8ec", borderColor: "#f0d9a8", color: "#7a5300" }}>
              A planilha não tem a composição 5213850 (operação de sinalização por bandeirola ou placa). O Volume 05 exige o serviço de sinalização
              no orçamento para considerar o atraso do PARE e SIGA; inclua-o ou um serviço similar.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <Field label="Velocidade em via urbana (km/h)" name="urbanSpeed" error={err(state, "urbanSpeed")} hint="Em branco = 30 km/h; outro valor exige justificativa técnica">
              <input id="urbanSpeed" name="urbanSpeed" inputMode="decimal" defaultValue={val(state, "urbanSpeed", comma(data.urbanSpeed))} placeholder="30" />
            </Field>
            <Field label="Fonte do VMD e justificativas" name="trafficSource" error={err(state, "trafficSource")} hint="Estudo de tráfego, PNCT ou PNCV — vai para a memória do orçamento">
              <input id="trafficSource" name="trafficSource" defaultValue={val(state, "trafficSource", data.source ?? "")} placeholder="ex.: PNCT 2024, posto BR-060 km 12" />
            </Field>
          </div>
        </div>
        <div hidden={mode !== "MANUAL"}>
          <Field label="FIT (multiplica a DMT pavimentada de todos os materiais)" name="fit" error={err(state, "fit")} hint="Em branco = 1,00">
            <input id="fit" name="fit" inputMode="decimal" defaultValue={val(state, "fit", comma(data.manual))} placeholder="1,00" style={{ maxWidth: 160 }} />
          </Field>
        </div>
      </fieldset>
      {!readOnly && <div className="actions"><SubmitButton>Salvar e recalcular</SubmitButton></div>}
    </form>
  );
}

export function TrafficSegmentForm({ budgetId }: { budgetId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addTrafficSegment.bind(null, budgetId), idle);
  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
      <input name="description" defaultValue={state.status === "error" ? val(state, "description", "") : ""} aria-label="Segmento" placeholder="segmento (ex.: km 0 a 12)" style={{ width: 200, padding: "3px 6px" }} />
      <input name="lengthKm" defaultValue={state.status === "error" ? val(state, "lengthKm", "") : ""} inputMode="decimal" aria-label="Extensão (km)" placeholder="extensão (km)" title={err(state, "lengthKm") ?? "Extensão (km)"}
        style={{ width: 110, padding: "3px 6px", textAlign: "right", borderColor: err(state, "lengthKm") ? "var(--danger)" : undefined }} />
      <input name="vmdPerLane" defaultValue={state.status === "error" ? val(state, "vmdPerLane", "") : ""} inputMode="decimal" aria-label="VMD por faixa" placeholder="VMD por faixa" title={err(state, "vmdPerLane") ?? "VMD por faixa (veículos/dia)"}
        style={{ width: 120, padding: "3px 6px", textAlign: "right", borderColor: err(state, "vmdPerLane") ? "var(--danger)" : undefined }} />
      <SubmitButton className="btn small secondary">Incluir segmento</SubmitButton>
      {state.status === "error" && <span style={{ fontSize: 12, color: "var(--danger)" }}>{err(state, "lengthKm") ?? err(state, "vmdPerLane") ?? state.message}</span>}
    </form>
  );
}

export function RemoveSegmentButton({ budgetId, segmentId }: { budgetId: string; segmentId: string }) {
  return <ConfirmButton label="Excluir" confirmLabel="Excluir segmento" className="btn small danger" action={() => removeTrafficSegment(budgetId, segmentId)} />;
}

export function MaterialDmtForm({ budgetId, code, data, readOnly }: {
  budgetId: string; code: string; readOnly: boolean;
  data: { LN: string | null; RP: string | null; P: string | null; U: string | null; passesWorksite: boolean; applyFit: boolean; note: string | null } | null;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveMaterialDmt.bind(null, budgetId, code), idle);
  const input = (name: string, v: string | null | undefined, label: string) => (
    <input name={name} inputMode="decimal" aria-label={label} title={err(state, name) ?? label} defaultValue={val(state, name, comma(v))} placeholder="padrão"
      style={{ width: 64, padding: "3px 6px", textAlign: "right", borderColor: err(state, name) ? "var(--danger)" : undefined }} disabled={readOnly} />
  );
  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {input("dmtNatural", data?.LN, "DMT leito natural (km)")}
      {input("dmtPrimary", data?.RP, "DMT revestimento primário (km)")}
      {input("dmtPaved", data?.P, "DMT pavimentada rural (km)")}
      {input("dmtUrban", data?.U, "DMT pavimentada urbana (km)")}
      <input name="note" aria-label="Origem" placeholder="origem (ex.: pedreira X)" defaultValue={val(state, "note", data?.note ?? "")} style={{ width: 150, padding: "3px 6px" }} disabled={readOnly} />
      <label style={{ fontSize: 12, display: "flex", gap: 3, alignItems: "center" }} title="O transporte passa pela extensão da obra (atraso do PARE e SIGA)">
        <input type="checkbox" name="passesWorksite" defaultChecked={data?.passesWorksite ?? true} disabled={readOnly} /> passa pela obra
      </label>
      <label style={{ fontSize: 12, display: "flex", gap: 3, alignItems: "center" }} title="Aplicar o FIT a este material">
        <input type="checkbox" name="applyFit" defaultChecked={data?.applyFit ?? true} disabled={readOnly} /> FIT
      </label>
      {!readOnly && <SubmitButton className="btn small secondary">Salvar</SubmitButton>}
      {state.status === "ok" && <span className="muted" style={{ fontSize: 12 }}>{state.message}</span>}
      {state.status === "error" && <span style={{ fontSize: 12, color: "var(--danger)" }}>{state.message}</span>}
    </form>
  );
}
