// src/components/export-forms.tsx
"use client";
import { useActionState } from "react";
import { saveBidderData, saveCompanyData, saveProposalData, saveServiceSpec } from "@/lib/actions/exports";
import { idle, type ActionState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton, err, val } from "./form";

export function CompanyForm({ company, readOnly }: { company: { name: string; document: string | null; address: string | null; phone: string | null; email: string | null; technicalLead: string | null; technicalRegistry: string | null }; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveCompanyData, idle);
  return (
    <form action={action} className="card">
      <FormMessage state={state} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        <div className="form-grid">
          <Field label="Razão social" name="name" error={err(state, "name")} span2><input id="name" name="name" defaultValue={val(state, "name", company.name)} required /></Field>
          <Field label="CNPJ" name="document" error={err(state, "document")}><input id="document" name="document" defaultValue={val(state, "document", company.document)} /></Field>
          <Field label="Telefone" name="phone" error={err(state, "phone")}><input id="phone" name="phone" defaultValue={val(state, "phone", company.phone)} /></Field>
          <Field label="Endereço" name="address" error={err(state, "address")} span2><input id="address" name="address" defaultValue={val(state, "address", company.address)} /></Field>
          <Field label="E-mail" name="email" error={err(state, "email")}><input id="email" name="email" type="email" defaultValue={val(state, "email", company.email)} /></Field>
          <span />
          <Field label="Responsável técnico" name="technicalLead" error={err(state, "technicalLead")} hint="Assina a proposta e as planilhas."><input id="technicalLead" name="technicalLead" defaultValue={val(state, "technicalLead", company.technicalLead)} /></Field>
          <Field label="Registro (CREA / CAU)" name="technicalRegistry" error={err(state, "technicalRegistry")}><input id="technicalRegistry" name="technicalRegistry" defaultValue={val(state, "technicalRegistry", company.technicalRegistry)} placeholder="Ex.: CREA 12.345/D-DF" /></Field>
        </div>
      </fieldset>
      {!readOnly && <div className="actions"><SubmitButton>Salvar</SubmitButton></div>}
    </form>
  );
}

export function ProposalForm({ budgetId, data, readOnly }: { budgetId: string; data: { proposalValidityDays: number | null; executionTerm: string | null; paymentTerms: string | null; proposalNotes: string | null }; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveProposalData.bind(null, budgetId), idle);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        <div className="form-grid">
          <Field label="Validade da proposta (dias)" name="proposalValidityDays" error={err(state, "proposalValidityDays")}><input id="proposalValidityDays" name="proposalValidityDays" inputMode="numeric" defaultValue={val(state, "proposalValidityDays", data.proposalValidityDays)} placeholder="60" /></Field>
          <Field label="Prazo de execução" name="executionTerm" error={err(state, "executionTerm")}><input id="executionTerm" name="executionTerm" defaultValue={val(state, "executionTerm", data.executionTerm)} placeholder="90 dias corridos a partir da ordem de serviço" /></Field>
          <Field label="Condições de pagamento" name="paymentTerms" error={err(state, "paymentTerms")} span2><textarea id="paymentTerms" name="paymentTerms" rows={2} defaultValue={val(state, "paymentTerms", data.paymentTerms)} placeholder="Medições mensais pelo executado, pagamento em até 10 dias após a aprovação" /></Field>
          <Field label="Observações" name="proposalNotes" error={err(state, "proposalNotes")} span2><textarea id="proposalNotes" name="proposalNotes" rows={3} defaultValue={val(state, "proposalNotes", data.proposalNotes)} placeholder="Inclusões, exclusões, premissas da proposta…" /></Field>
        </div>
      </fieldset>
      {!readOnly && <div className="actions"><SubmitButton>Salvar dados da proposta</SubmitButton></div>}
    </form>
  );
}

export function BidderForm({ budgetId, data, readOnly }: { budgetId: string; data: { bidderInstructions: string | null; bidderPremises: string | null }; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveBidderData.bind(null, budgetId), idle);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        <div className="form-grid">
          <Field label="Instruções às proponentes (aba própria no Excel)" name="bidderInstructions" span2 hint="Objeto, visita técnica, prazo e forma de envio, documentos, medições e pagamento. Uma linha por parágrafo.">
            <textarea id="bidderInstructions" name="bidderInstructions" rows={6} defaultValue={val(state, "bidderInstructions", data.bidderInstructions)} />
          </Field>
          <Field label="Premissas (aba própria no Excel)" name="bidderPremises" span2 hint="Escopo, ordem de execução, origem dos quantitativos, regras de preenchimento.">
            <textarea id="bidderPremises" name="bidderPremises" rows={6} defaultValue={val(state, "bidderPremises", data.bidderPremises)} />
          </Field>
        </div>
      </fieldset>
      {!readOnly && <div className="actions"><SubmitButton>Salvar textos</SubmitButton></div>}
    </form>
  );
}

export function ServiceSpecForm({ nodeId, data, readOnly }: { nodeId: string; data: { specification: string | null; measurementCriteria: string | null; requiresBrand: boolean }; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveServiceSpec.bind(null, nodeId), idle);
  return (
    <form action={action} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "start" }}>
      <textarea name="specification" rows={3} aria-label="Especificação técnica" placeholder="Especificação técnica, materiais e procedimento" defaultValue={val(state, "specification", data.specification)} disabled={readOnly} />
      <textarea name="measurementCriteria" rows={3} aria-label="Critério de medição e aceitação" placeholder="Critério de medição e aceitação" defaultValue={val(state, "measurementCriteria", data.measurementCriteria)} disabled={readOnly} />
      <div style={{ display: "grid", gap: 6, minWidth: 130 }}>
        <label className="checkbox" style={{ fontWeight: 400, fontSize: 13 }}><input type="checkbox" name="requiresBrand" defaultChecked={data.requiresBrand} disabled={readOnly} /> Exige marca/produto</label>
        {!readOnly && <SubmitButton className="btn small">Salvar</SubmitButton>}
        {state.status === "ok" && <span className="muted" style={{ fontSize: 12 }}>Salvo.</span>}
        {state.status === "error" && <span className="error" style={{ fontSize: 12, color: "var(--danger)" }}>{state.message}</span>}
      </div>
    </form>
  );
}
