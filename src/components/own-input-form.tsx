// src/components/own-input-form.tsx
"use client";
import { useActionState } from "react";
import Link from "next/link";
import { deleteOwnInput, saveOwnInput } from "@/lib/actions/own";
import { idle, type ActionState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton, err, val } from "./form";
import { ConfirmButton } from "./confirm-button";

export interface OwnInputData {
  id: string; code: string; description: string; unit: string; kind: string;
  unitPrice: string; priceDate: string; source: string; notes: string | null;
}

const KINDS = [["MATERIAL", "Material"], ["MAO_DE_OBRA", "Mão de obra"], ["EQUIPAMENTO", "Equipamento"], ["SERVICO", "Serviço"]] as const;

export function OwnInputForm({ input, suggestedCode, readOnly = false }: { input: OwnInputData | null; suggestedCode: string; readOnly?: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveOwnInput.bind(null, input?.id ?? null), idle);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={formAction} className="card">
      <FormMessage state={state} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        <div className="form-grid">
          <Field label="Código" name="code" error={err(state, "code")} hint="Sugerido pelo app; pode trocar.">
            <input id="code" name="code" defaultValue={val(state, "code", input?.code ?? suggestedCode)} required aria-invalid={!!err(state, "code")} />
          </Field>
          <Field label="Tipo" name="kind" error={err(state, "kind")}>
            <select id="kind" name="kind" defaultValue={val(state, "kind", input?.kind ?? "MATERIAL")}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Descrição" name="description" error={err(state, "description")} span2>
            <input id="description" name="description" defaultValue={val(state, "description", input?.description)} required aria-invalid={!!err(state, "description")}
              placeholder="Ex.: PINGADEIRA PRÉ-MOLDADA DE CONCRETO COM FRISO, L = 25 CM" />
          </Field>
          <Field label="Unidade" name="unit" error={err(state, "unit")}>
            <input id="unit" name="unit" defaultValue={val(state, "unit", input?.unit)} required aria-invalid={!!err(state, "unit")} placeholder="M, M2, UN, KG…" />
          </Field>
          <Field label="Preço unitário (R$)" name="unitPrice" error={err(state, "unitPrice")} hint="Mão de obra: informe o valor já com encargos sociais.">
            <input id="unitPrice" name="unitPrice" inputMode="decimal" defaultValue={val(state, "unitPrice", input?.unitPrice.replace(".", ","))} required aria-invalid={!!err(state, "unitPrice")} />
          </Field>
          <Field label="Data do preço" name="priceDate" error={err(state, "priceDate")}>
            <input id="priceDate" name="priceDate" type="date" max={today} defaultValue={val(state, "priceDate", input?.priceDate ?? today)} required aria-invalid={!!err(state, "priceDate")} />
          </Field>
          <Field label="Fonte do preço" name="source" error={err(state, "source")} hint="Fornecedor e nº da cotação, nota fiscal, site com data de acesso…">
            <input id="source" name="source" defaultValue={val(state, "source", input?.source)} required aria-invalid={!!err(state, "source")} />
          </Field>
          <Field label="Observações" name="notes" error={err(state, "notes")} span2>
            <textarea id="notes" name="notes" rows={2} defaultValue={val(state, "notes", input?.notes)} />
          </Field>
        </div>
      </fieldset>
      {!readOnly && (
        <div className="actions">
          {input && <ConfirmButton label="Excluir" confirmLabel="Excluir este insumo" action={() => deleteOwnInput(input.id)} />}
          <Link className="btn secondary" href="/insumos-proprios">Cancelar</Link>
          <SubmitButton>Salvar</SubmitButton>
        </div>
      )}
    </form>
  );
}
