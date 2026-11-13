// src/components/form.tsx
"use client";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/forms";

export function Field({ label, name, error, hint, children, span2 }: {
  label: string; name: string; error?: string; hint?: string; children: React.ReactNode; span2?: boolean;
}) {
  return (
    <div className={`field${span2 ? " span-2" : ""}`}>
      <label htmlFor={name}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function SubmitButton({ children, className = "btn" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending}>{pending ? "Salvando…" : children}</button>;
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "error" && state.message) return <div className="form-error">{state.message}</div>;
  if (state.status === "ok" && state.message) return <div className="form-ok">{state.message}</div>;
  return null;
}

/** Value to show in an input: the submitted value (after an error) or the stored one. */
export function val(state: ActionState, name: string, fallback: string | number | null | undefined): string {
  if (state.status === "error" && state.values && name in state.values) return state.values[name];
  return fallback === null || fallback === undefined ? "" : String(fallback);
}

export function err(state: ActionState, name: string): string | undefined {
  return state.status === "error" ? state.fieldErrors?.[name] : undefined;
}
