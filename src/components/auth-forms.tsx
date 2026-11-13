// src/components/auth-forms.tsx
"use client";
import { useActionState } from "react";
import Link from "next/link";
import { changePassword, login, register } from "@/lib/actions/auth";
import { idle, type ActionState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton, err, val } from "./form";

export function LoginForm() {
  const [state, action] = useActionState<ActionState, FormData>(login, idle);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
        <Field label="E-mail" name="email" error={err(state, "email")}>
          <input id="email" name="email" type="email" required autoComplete="email" defaultValue={val(state, "email", "")} autoFocus />
        </Field>
        <Field label="Senha" name="password" error={err(state, "password")}>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </Field>
      </div>
      <div className="actions"><SubmitButton>Entrar</SubmitButton></div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState<ActionState, FormData>(register, idle);
  return (
    <form action={action}>
      <FormMessage state={state} />
      <div className="form-grid">
        <Field label="Nome da empresa" name="companyName" error={err(state, "companyName")} span2>
          <input id="companyName" name="companyName" type="text" required defaultValue={val(state, "companyName", "")} autoFocus />
        </Field>
        <Field label="CNPJ" name="companyDocument" error={err(state, "companyDocument")}>
          <input id="companyDocument" name="companyDocument" type="text" defaultValue={val(state, "companyDocument", "")} />
        </Field>
        <Field label="Seu nome" name="name" error={err(state, "name")}>
          <input id="name" name="name" type="text" required defaultValue={val(state, "name", "")} />
        </Field>
        <Field label="E-mail" name="email" error={err(state, "email")} span2>
          <input id="email" name="email" type="email" required autoComplete="email" defaultValue={val(state, "email", "")} />
        </Field>
        <Field label="Senha" name="password" error={err(state, "password")} hint="Mínimo 8 caracteres">
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Confirmar senha" name="passwordConfirm" error={err(state, "passwordConfirm")}>
          <input id="passwordConfirm" name="passwordConfirm" type="password" required autoComplete="new-password" />
        </Field>
      </div>
      <div className="actions"><SubmitButton>Criar conta</SubmitButton></div>
    </form>
  );
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(changePassword, idle);
  return (
    <form action={action} className="card" style={{ maxWidth: 520 }}>
      {forced && state.status !== "ok" && <div className="form-error">Defina uma nova senha para continuar.</div>}
      <FormMessage state={state} />
      <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
        <Field label="Senha atual" name="currentPassword" error={err(state, "currentPassword")} hint={forced ? "A senha inicial que você recebeu" : undefined}>
          <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" autoFocus />
        </Field>
        <Field label="Nova senha" name="password" error={err(state, "password")} hint="Mínimo 8 caracteres">
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Confirmar nova senha" name="passwordConfirm" error={err(state, "passwordConfirm")}>
          <input id="passwordConfirm" name="passwordConfirm" type="password" required autoComplete="new-password" />
        </Field>
      </div>
      <div className="actions"><SubmitButton>Alterar senha</SubmitButton></div>
      {state.status === "ok" && forced && <p><Link href="/">Ir para o início</Link></p>}
    </form>
  );
}
