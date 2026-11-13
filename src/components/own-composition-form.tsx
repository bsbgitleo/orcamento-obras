// src/components/own-composition-form.tsx
// Header of an own composition. New: optionally copies an official
// composition (items kept by code). Edit: code, description, unit, group,
// justification.
"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { createOwnComposition, deleteOwnComposition, updateOwnComposition } from "@/lib/actions/own";
import { idle, type ActionState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton, err, val } from "./form";
import { ConfirmButton } from "./confirm-button";

export interface OwnCompositionHeader {
  id: string; code: string; description: string; unit: string; group: string | null; justification: string | null;
  derivedFrom: string | null;
}

export function OwnCompositionForm({ composition, suggestedCode, tables, defaultTableId, copyCode, readOnly = false }: {
  composition: OwnCompositionHeader | null; suggestedCode: string;
  tables?: { id: string; label: string }[]; defaultTableId?: string | null; copyCode?: string | null; readOnly?: boolean;
}) {
  const action = composition ? updateOwnComposition.bind(null, composition.id) : createOwnComposition;
  const [state, formAction] = useActionState<ActionState, FormData>(action, idle);
  const [copy, setCopy] = useState(!!copyCode);
  return (
    <form action={formAction} className="card">
      <FormMessage state={state} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        {!composition && (
          <div style={{ marginBottom: 14 }}>
            <label className="checkbox"><input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Partir de uma composição oficial (copia os itens e coeficientes para você ajustar)</label>
            {copy && (
              <div className="form-grid" style={{ marginTop: 10 }}>
                <Field label="Base de origem" name="copyFromTableId" error={err(state, "copyFromTableId")}>
                  <select id="copyFromTableId" name="copyFromTableId" defaultValue={val(state, "copyFromTableId", defaultTableId ?? "")}>
                    {tables?.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Código da composição oficial" name="copyFromCode" error={err(state, "copyFromCode")} hint="Ex.: 87879. A descrição e a unidade abaixo podem ficar em branco para copiar as da oficial.">
                  <input id="copyFromCode" name="copyFromCode" inputMode="numeric" defaultValue={val(state, "copyFromCode", copyCode ?? "")} />
                </Field>
              </div>
            )}
          </div>
        )}
        <div className="form-grid">
          <Field label="Código" name="code" error={err(state, "code")} hint={composition ? undefined : "Sugerido pelo app; pode trocar."}>
            <input id="code" name="code" defaultValue={val(state, "code", composition?.code ?? suggestedCode)} required aria-invalid={!!err(state, "code")} />
          </Field>
          <Field label="Unidade" name="unit" error={err(state, "unit")}>
            <input id="unit" name="unit" defaultValue={val(state, "unit", composition?.unit)} required={!copy} aria-invalid={!!err(state, "unit")} placeholder="M, M2, M3, UN…" />
          </Field>
          <Field label="Descrição" name="description" error={err(state, "description")} span2>
            <input id="description" name="description" defaultValue={val(state, "description", composition?.description)} required={!copy} aria-invalid={!!err(state, "description")} />
          </Field>
          <Field label="Grupo (opcional)" name="group" error={err(state, "group")}>
            <input id="group" name="group" defaultValue={val(state, "group", composition?.group)} placeholder="Ex.: Fachadas, Impermeabilização" />
          </Field>
          {composition?.derivedFrom && (
            <Field label="Origem" name="origin"><input id="origin" value={composition.derivedFrom} disabled readOnly /></Field>
          )}
          <Field label="Justificativa técnica" name="justification" error={err(state, "justification")} span2
            hint="Por que a composição foi criada ou o que mudou em relação à oficial. Em obra pública o TCU exige essa justificativa.">
            <textarea id="justification" name="justification" rows={3} defaultValue={val(state, "justification", composition?.justification)} />
          </Field>
        </div>
      </fieldset>
      {!readOnly && (
        <div className="actions">
          {composition && <ConfirmButton label="Excluir composição" confirmLabel="Excluir de vez" action={() => deleteOwnComposition(composition.id)} />}
          {!composition && <Link className="btn secondary" href="/composicoes-proprias">Cancelar</Link>}
          <SubmitButton>{composition ? "Salvar dados" : copy ? "Copiar e criar" : "Criar composição"}</SubmitButton>
        </div>
      )}
    </form>
  );
}
