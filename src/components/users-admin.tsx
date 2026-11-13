// src/components/users-admin.tsx
"use client";
import { useActionState, useState, useTransition } from "react";
import { inviteUser, removeUser, resetUserPassword, updateUserRole, type InviteResult } from "@/lib/actions/auth";
import { idle, type ActionState } from "@/lib/forms";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { Field, FormMessage, SubmitButton, err, val } from "./form";

interface Member { userId: string; name: string; email: string; role: Role; pending: boolean }

export function UsersAdmin({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const [state, action] = useActionState<InviteResult, FormData>(inviteUser, idle);
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null);
  const [, start] = useTransition();
  const asState = (s: InviteResult): ActionState => (s.status === "invited" ? idle : s);

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Convidar usuário</h2>
        {state.status === "invited" && (
          <div className="form-ok">
            Usuário <strong>{state.email}</strong> criado. Senha inicial (mostrada só agora): <code style={{ fontSize: 15 }}>{state.initialPassword}</code>
            <div className="muted">Envie ao usuário; ele precisará trocá-la no primeiro acesso.</div>
          </div>
        )}
        <form action={action}>
          <FormMessage state={asState(state)} />
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr auto auto", alignItems: "end" }}>
            <Field label="Nome" name="name" error={err(asState(state), "name")}>
              <input id="name" name="name" type="text" required defaultValue={val(asState(state), "name", "")} />
            </Field>
            <Field label="E-mail" name="email" error={err(asState(state), "email")}>
              <input id="email" name="email" type="email" required defaultValue={val(asState(state), "email", "")} />
            </Field>
            <Field label="Papel" name="role">
              <select id="role" name="role" defaultValue="ESTIMATOR">
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </Field>
            <SubmitButton>Convidar</SubmitButton>
          </div>
        </form>
      </div>

      {reset && (
        <div className="form-ok">
          Nova senha inicial de <strong>{reset.email}</strong>: <code style={{ fontSize: 15 }}>{reset.password}</code> <span className="muted">(mostrada só agora)</span>
        </div>
      )}

      <table className="list">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId}>
              <td>{m.name}{m.userId === currentUserId && <span className="muted"> (você)</span>}</td>
              <td>{m.email}</td>
              <td><RoleSelect userId={m.userId} role={m.role} /></td>
              <td>{m.pending ? <span className="badge warn">senha inicial</span> : <span className="badge ok">ativo</span>}</td>
              <td className="row-actions">
                <button type="button" className="icon" title="Gerar nova senha inicial" onClick={() => { if (confirm(`Gerar nova senha inicial para ${m.email}? As sessões atuais serão encerradas.`)) start(async () => { const r = await resetUserPassword(m.userId); setReset({ email: m.email, password: r.initialPassword }); }); }}>nova senha</button>
                {m.userId !== currentUserId && (
                  <button type="button" className="icon danger" title="Remover da empresa" onClick={() => { if (confirm(`Remover ${m.email} da empresa?`)) start(() => removeUser(m.userId)); }}>remover</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 12 }}>Gestor: aprova orçamentos e administra usuários. Orçamentista: cria e edita. Leitura: só consulta.</p>
    </>
  );
}

function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  const [state, action] = useActionState<ActionState, FormData>(updateUserRole.bind(null, userId), idle);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <select name="role" defaultValue={role} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Papel" style={{ width: 150 }}>
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
      {state.status === "error" && <span className="error" style={{ color: "var(--danger)", fontSize: 12 }}>{state.message}</span>}
    </form>
  );
}
