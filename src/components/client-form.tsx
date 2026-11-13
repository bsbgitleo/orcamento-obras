// src/components/client-form.tsx
"use client";
import { useActionState } from "react";
import Link from "next/link";
import { saveClient, deleteClient } from "@/lib/actions/clients";
import { idle, type ActionState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton, err, val } from "./form";

export interface ClientData { id: string; name: string; document: string | null; email: string | null; phone: string | null; address: string | null }

export function ClientForm({ client }: { client: ClientData | null }) {
  const action = saveClient.bind(null, client?.id ?? null);
  const [state, formAction] = useActionState<ActionState, FormData>(action, idle);
  return (
    <form action={formAction} className="card">
      <FormMessage state={state} />
      <div className="form-grid">
        <Field label="Nome" name="name" error={err(state, "name")} span2>
          <input id="name" name="name" type="text" defaultValue={val(state, "name", client?.name)} required aria-invalid={!!err(state, "name")} />
        </Field>
        <Field label="CNPJ / CPF" name="document" error={err(state, "document")}>
          <input id="document" name="document" type="text" defaultValue={val(state, "document", client?.document)} />
        </Field>
        <Field label="E-mail" name="email" error={err(state, "email")}>
          <input id="email" name="email" type="email" defaultValue={val(state, "email", client?.email)} aria-invalid={!!err(state, "email")} />
        </Field>
        <Field label="Telefone" name="phone" error={err(state, "phone")}>
          <input id="phone" name="phone" type="text" defaultValue={val(state, "phone", client?.phone)} />
        </Field>
        <Field label="Endereço" name="address" error={err(state, "address")} span2>
          <input id="address" name="address" type="text" defaultValue={val(state, "address", client?.address)} />
        </Field>
      </div>
      <div className="actions">
        {client && (
          <button type="button" className="btn danger" onClick={() => { if (confirm("Excluir este cliente?")) deleteClient(client.id); }}>Excluir</button>
        )}
        <Link className="btn secondary" href="/clientes">Cancelar</Link>
        <SubmitButton>Salvar</SubmitButton>
      </div>
    </form>
  );
}
