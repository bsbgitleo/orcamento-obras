// src/components/calc-memory.tsx
// Memória de cálculo, vínculo de quantidades e especificação de materiais (decisões #80–#83).
"use client";
import { useActionState, useState, useTransition } from "react";
import {
  deleteCalcRow, deleteMaterialSpec, linkQuantity, moveCalcRow, moveMaterialSpec, saveCalcNote, saveCalcRow, saveMaterialSpec,
} from "@/lib/actions/calc-memory";
import { idle, type ActionState } from "@/lib/forms";
import { ConfirmButton } from "./confirm-button";
import { Field, FormMessage, SubmitButton, err, val } from "./form";

const comma = (v: string | null | undefined) => (v === null || v === undefined ? "" : v.replace(".", ","));

export function NoteForm({ projectId, field, value, label, placeholder, readOnly }: { projectId: string; field: "calcMemoryNote" | "materialsNote"; value: string | null; label: string; placeholder: string; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveCalcNote.bind(null, projectId, field), idle);
  return (
    <form action={action}>
      <Field label={label} name={`note-${field}`}>
        <textarea id={`note-${field}`} name="note" rows={2} defaultValue={val(state, "note", value)} placeholder={placeholder} disabled={readOnly} style={{ width: "100%" }} />
      </Field>
      {!readOnly && <div style={{ display: "flex", gap: 8, alignItems: "center" }}><SubmitButton className="btn small secondary">Salvar aviso</SubmitButton>{state.status === "ok" && <span className="muted" style={{ fontSize: 12 }}>{state.message}</span>}</div>}
    </form>
  );
}

export interface CalcRowData {
  id: string; kind: "SECTION" | "PARAM"; code: string | null; description: string; unit: string | null;
  value: string | null; formula: string | null; source: string | null; estimated: boolean;
}

export function CalcRowForm({ projectId, row, onSaved }: { projectId: string; row: CalcRowData | null; onSaved?: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(async (prev: ActionState, fd: FormData) => {
    const r = await saveCalcRow(projectId, row?.id ?? null, prev, fd);
    if (r.status === "ok") onSaved?.();
    return r;
  }, idle);
  const [kind, setKind] = useState<"SECTION" | "PARAM">(row?.kind ?? "PARAM");
  return (
    <form action={action} key={state.status === "ok" && !row ? state.message : "f"} style={{ background: "#fafbfc", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
      <FormMessage state={state} />
      <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 13 }}>
        <label><input type="radio" name="kind" value="PARAM" checked={kind === "PARAM"} onChange={() => setKind("PARAM")} /> Parâmetro</label>
        <label><input type="radio" name="kind" value="SECTION" checked={kind === "SECTION"} onChange={() => setKind("SECTION")} /> Título de grupo</label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: kind === "PARAM" ? "110px 1fr 90px" : "1fr", gap: 10 }}>
        {kind === "PARAM" && <Field label="Sigla" name="code" error={err(state, "code")}><input id="code" name="code" defaultValue={val(state, "code", row?.code)} placeholder="AT" style={{ textTransform: "uppercase" }} /></Field>}
        <Field label={kind === "PARAM" ? "Descrição" : "Título do grupo"} name="description" error={err(state, "description")}>
          <input id="description" name="description" defaultValue={val(state, "description", row?.description)} placeholder={kind === "PARAM" ? "Área total da faixa em textura das empenas" : "1. GEOMETRIA DO EDIFÍCIO"} />
        </Field>
        {kind === "PARAM" && <Field label="Unidade" name="unit" error={err(state, "unit")}><input id="unit" name="unit" defaultValue={val(state, "unit", row?.unit)} placeholder="m²" /></Field>}
      </div>
      {kind === "PARAM" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10 }}>
            <Field label="Valor" name="value" error={err(state, "value")} hint="Sem fórmula">
              <input id="value" name="value" inputMode="decimal" defaultValue={val(state, "value", comma(row?.value))} placeholder="11,25" />
            </Field>
            <Field label="Fórmula (com as siglas)" name="formula" error={err(state, "formula")} hint="Ex.: L * HT * NE · ARREDONDAR.PARA.CIMA(L / CB; 0) * NE · funções: ARRED, ARREDONDAR.PARA.CIMA/BAIXO, TRUNCAR, MÁXIMO, MÍNIMO, SOMA, ABS, RAIZ (argumentos separados por ;)">
              <input id="formula" name="formula" className="mono" defaultValue={val(state, "formula", row?.formula)} placeholder="L * HT * NE" />
            </Field>
          </div>
          <Field label="Origem / justificativa" name="source" error={err(state, "source")}>
            <input id="source" name="source" defaultValue={val(state, "source", row?.source)} placeholder="Projeto aprovado — planta de situação; ou: L x HT x NE — pano cego, sem vãos" />
          </Field>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name="estimated" defaultChecked={val(state, "estimated", row?.estimated ? "on" : "") === "on"} /> Estimativa — conferir em campo
          </label>
        </>
      )}
      <div className="actions" style={{ marginTop: 8 }}><SubmitButton className="btn small">{row ? "Salvar" : "Incluir"}</SubmitButton></div>
    </form>
  );
}

export function CalcRowTools({ projectId, row, first, last }: { projectId: string; row: CalcRowData; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn small secondary" onClick={() => setEditing(!editing)}>{editing ? "Fechar" : "Editar"}</button>
        <button type="button" className="btn small secondary" aria-label="Subir" disabled={first || pending} onClick={() => start(() => moveCalcRow(projectId, row.id, -1))}>↑</button>
        <button type="button" className="btn small secondary" aria-label="Descer" disabled={last || pending} onClick={() => start(() => moveCalcRow(projectId, row.id, 1))}>↓</button>
        <ConfirmButton label="Excluir" confirmLabel="Excluir linha" className="btn small danger" action={() => deleteCalcRow(projectId, row.id)} />
      </span>
      {editing && <div style={{ marginTop: 8, minWidth: 520 }}><CalcRowForm projectId={projectId} row={row} onSaved={() => setEditing(false)} /></div>}
    </>
  );
}

export function QuantityLink({ projectId, nodeId, value, options, readOnly }: { projectId: string; nodeId: string; value: string | null; options: { id: string; code: string; description: string; unit: string | null }[]; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <select aria-label="Parâmetro da quantidade" defaultValue={value ?? ""} disabled={readOnly || pending} style={{ fontSize: 12, maxWidth: 280 }}
        onChange={(e) => { const v = e.target.value || null; start(async () => setMsg(await linkQuantity(projectId, nodeId, v))); }}>
        <option value="">— digitada na planilha —</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.code}{o.unit ? ` (${o.unit})` : ""} · {o.description.slice(0, 50)}</option>)}
      </select>
      {pending && <span className="muted" style={{ fontSize: 11 }}>salvando…</span>}
      {!pending && msg?.status === "error" && <span style={{ fontSize: 11, color: "var(--danger)" }}>{msg.message}</span>}
    </span>
  );
}

/* ---------- materiais ---------- */

export interface MaterialSpecData { id: string; material: string; specification: string | null; references: string | null; standards: string | null; nodeIds: string[] }
export interface ServiceOption { id: string; code: string; description: string; stage: boolean; level: number }

export function MaterialSpecForm({ projectId, spec, services, onSaved }: { projectId: string; spec: MaterialSpecData | null; services: ServiceOption[]; onSaved?: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(async (prev: ActionState, fd: FormData) => {
    const r = await saveMaterialSpec(projectId, spec?.id ?? null, prev, fd);
    if (r.status === "ok") onSaved?.();
    return r;
  }, idle);
  const [chosen, setChosen] = useState<Set<string>>(new Set(spec?.nodeIds ?? []));
  const toggle = (id: string) => { const s = new Set(chosen); if (s.has(id)) s.delete(id); else s.add(id); setChosen(s); };
  return (
    <form action={action} key={state.status === "ok" && !spec ? state.message : "m"} style={{ background: "#fafbfc", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
      <FormMessage state={state} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        <Field label="Material" name="material" error={err(state, "material")}><input id="material" name="material" defaultValue={val(state, "material", spec?.material)} placeholder="Selante de juntas de movimentação" /></Field>
        <Field label="Normas" name="standards" error={err(state, "standards")}><input id="standards" name="standards" defaultValue={val(state, "standards", spec?.standards)} placeholder="NBR 9575; NBR 13755" /></Field>
      </div>
      <Field label="Especificação mínima" name="specification" error={err(state, "specification")}>
        <textarea id="specification" name="specification" rows={2} defaultValue={val(state, "specification", spec?.specification)} placeholder="PU ou híbrido MS monocomponente, baixo módulo, pintável, movimentação ≥ ±25%, uso externo" />
      </Field>
      <Field label="Referências comerciais (ou equivalente técnico)" name="references" error={err(state, "references")}>
        <input id="references" name="references" defaultValue={val(state, "references", spec?.references)} placeholder="Sikaflex Construction (Sika); MC-Flex 488 MS (MC-Bauchemie)" />
      </Field>
      <details open={!spec}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Itens da planilha que usam o material · {chosen.size} marcado(s)</summary>
        <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 8, marginTop: 6, background: "#fff" }}>
          {services.length === 0 && <span className="muted" style={{ fontSize: 12 }}>A planilha está vazia.</span>}
          {services.map((s) => s.stage ? (
            <div key={s.id} style={{ fontSize: 12, fontWeight: 700, marginTop: 4, paddingLeft: (s.level - 1) * 12 }}>{s.code} {s.description}</div>
          ) : (
            <label key={s.id} style={{ display: "flex", gap: 6, fontSize: 12, paddingLeft: (s.level - 1) * 12 }}>
              <input type="checkbox" name="nodeIds" value={s.id} checked={chosen.has(s.id)} onChange={() => toggle(s.id)} />
              <span className="mono">{s.code}</span> <span>{s.description.slice(0, 110)}</span>
            </label>
          ))}
        </div>
      </details>
      <div className="actions" style={{ marginTop: 8 }}><SubmitButton className="btn small">{spec ? "Salvar" : "Incluir material"}</SubmitButton></div>
    </form>
  );
}

export function MaterialSpecTools({ projectId, spec, services, first, last }: { projectId: string; spec: MaterialSpecData; services: ServiceOption[]; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn small secondary" onClick={() => setEditing(!editing)}>{editing ? "Fechar" : "Editar"}</button>
        <button type="button" className="btn small secondary" aria-label="Subir" disabled={first || pending} onClick={() => start(() => moveMaterialSpec(projectId, spec.id, -1))}>↑</button>
        <button type="button" className="btn small secondary" aria-label="Descer" disabled={last || pending} onClick={() => start(() => moveMaterialSpec(projectId, spec.id, 1))}>↓</button>
        <ConfirmButton label="Excluir" confirmLabel="Excluir material" className="btn small danger" action={() => deleteMaterialSpec(projectId, spec.id)} />
      </span>
      {editing && <div style={{ marginTop: 8, minWidth: 520 }}><MaterialSpecForm projectId={projectId} spec={spec} services={services} onSaved={() => setEditing(false)} /></div>}
    </>
  );
}
