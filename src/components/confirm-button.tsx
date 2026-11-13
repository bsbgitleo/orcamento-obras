// src/components/confirm-button.tsx
// Two-step destructive button (no window.confirm): the first click asks,
// the second runs the action. Shows the error message the action returns.
"use client";
import { useState, useTransition } from "react";
import type { ActionState } from "@/lib/forms";

export function ConfirmButton({ label, confirmLabel, action, className = "btn danger" }: {
  label: string; confirmLabel: string; action: () => Promise<ActionState | void>; className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!asking) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className={className} onClick={() => { setError(null); setAsking(true); }}>{label}</button>
        {error && <span className="form-error" role="alert" style={{ margin: 0, padding: "4px 8px" }}>{error}</span>}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className={className} disabled={pending}
        onClick={() => start(async () => {
          const r = await action();
          if (r && r.status === "error") { setError(r.message ?? "Não foi possível."); setAsking(false); }
        })}>
        {pending ? "Aguarde…" : confirmLabel}
      </button>
      <button type="button" className="btn secondary" onClick={() => setAsking(false)} disabled={pending}>Não</button>
    </span>
  );
}
