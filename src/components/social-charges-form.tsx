// src/components/social-charges-form.tsx
"use client";
import { useActionState } from "react";
import Link from "next/link";
import { saveSocialCharges, deleteSocialCharges } from "@/lib/actions/social-charges";
import { idle, type ActionState } from "@/lib/forms";
import { REGIME_LABEL } from "@/lib/format";
import { Field, FormMessage, SubmitButton, err, val } from "./form";

export interface SocialChargesData { id: string; name: string; regime: string; hourlyPct: string; monthlyPct: string; source: string | null }

export function SocialChargesForm({ item }: { item: SocialChargesData | null }) {
  const action = saveSocialCharges.bind(null, item?.id ?? null);
  const [state, formAction] = useActionState<ActionState, FormData>(action, idle);
  return (
    <form action={formAction} className="card">
      <FormMessage state={state} />
      <div className="form-grid">
        <Field label="Nome" name="name" error={err(state, "name")} span2>
          <input id="name" name="name" type="text" defaultValue={val(state, "name", item?.name)} required placeholder="Ex.: SINAPI DF 10/2026 — sem desoneração" />
        </Field>
        <Field label="Regime" name="regime" error={err(state, "regime")}>
          <select id="regime" name="regime" defaultValue={val(state, "regime", item?.regime ?? "NAO_DESONERADO")}>
            {Object.entries(REGIME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Fonte" name="source" error={err(state, "source")}>
          <input id="source" name="source" type="text" defaultValue={val(state, "source", item?.source)} placeholder="Ex.: SINAPI DF 10/2026" />
        </Field>
        <Field label="Horista %" name="hourlyPct" error={err(state, "hourlyPct")} hint="Sobre o salário-hora. SINAPI DF 10/2026 sem desoneração: 110,08 %">
          <input id="hourlyPct" name="hourlyPct" type="text" inputMode="decimal" defaultValue={val(state, "hourlyPct", item?.hourlyPct)} required />
        </Field>
        <Field label="Mensalista %" name="monthlyPct" error={err(state, "monthlyPct")} hint="Sobre o salário mensal. SINAPI DF 10/2026 sem desoneração: 69,94 %">
          <input id="monthlyPct" name="monthlyPct" type="text" inputMode="decimal" defaultValue={val(state, "monthlyPct", item?.monthlyPct)} required />
        </Field>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>Os preços de mão de obra do SINAPI já incluem os encargos do regime escolhido; esta tabela serve ao demonstrativo exigido em obra pública e à base própria.</p>
      <div className="actions">
        {item && <button type="button" className="btn danger" onClick={() => { if (confirm("Excluir esta tabela?")) deleteSocialCharges(item.id); }}>Excluir</button>}
        <Link className="btn secondary" href="/encargos">Cancelar</Link>
        <SubmitButton>Salvar</SubmitButton>
      </div>
    </form>
  );
}
