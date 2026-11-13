// src/components/own-items-editor.tsx
// Items of an own composition, priced in the reference base shown on the page.
"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { addOwnItem, moveOwnItem, removeOwnItem, searchOwnItemCandidates, updateOwnItemCoefficient, type ItemHit } from "@/lib/actions/own";
import { idle, type ActionState } from "@/lib/forms";
import { brl } from "@/lib/format";
import { FormMessage, err } from "./form";

type ItemType = "OFFICIAL_INPUT" | "OFFICIAL_COMPOSITION" | "OWN_INPUT" | "OWN_COMPOSITION";

export interface OwnItemRow {
  id: string; type: ItemType; code: string; description: string; unit: string; coefficient: string;
  unitPrice: string | null; cost: string | null; missing: boolean; href: string | null;
}

const TYPE_LABEL: Record<ItemType, string> = {
  OFFICIAL_INPUT: "Insumo oficial",
  OFFICIAL_COMPOSITION: "Composição oficial (auxiliar)",
  OWN_INPUT: "Insumo próprio",
  OWN_COMPOSITION: "Composição própria (auxiliar)",
};
const TYPE_SHORT: Record<ItemType, string> = {
  OFFICIAL_INPUT: "insumo", OFFICIAL_COMPOSITION: "composição", OWN_INPUT: "insumo próprio", OWN_COMPOSITION: "comp. própria",
};

const comma = (s: string) => s.replace(".", ",");

export function OwnItemsEditor({ compositionId, tableId, tableLabel, items, readOnly }: {
  compositionId: string; tableId: string | null; tableLabel: string; items: OwnItemRow[]; readOnly: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();
  return (
    <div>
      {items.length === 0 ? (
        <div className="empty">Nenhum item ainda. {readOnly ? "" : "Inclua insumos e composições abaixo."}</div>
      ) : (
        <table className="list">
          <thead>
            <tr><th>Tipo</th><th>Código</th><th>Descrição</th><th>Un.</th><th className="num">Coeficiente</th><th className="num">Preço unit.</th><th className="num">Custo</th>{!readOnly && <th></th>}</tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <td><span className={`badge ${it.type.startsWith("OWN") ? "ok" : ""}`}>{TYPE_SHORT[it.type]}</span></td>
                <td className="mono">{it.href ? <Link href={it.href}>{it.code}</Link> : it.code}</td>
                <td>
                  {it.description}
                  {it.missing && <span className="badge danger" style={{ marginLeft: 6 }} title={`Este código não existe em ${tableLabel}`}>não existe nesta base</span>}
                  {!it.missing && it.unitPrice === null && <span className="badge danger" style={{ marginLeft: 6 }}>sem preço</span>}
                </td>
                <td>{it.unit}</td>
                <td className="num">{readOnly ? comma(it.coefficient) : <CoefficientCell itemId={it.id} value={it.coefficient} />}</td>
                <td className="num">{brl(it.unitPrice)}</td>
                <td className="num">{brl(it.cost)}</td>
                {!readOnly && (
                  <td className="row-actions" style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="icon" title="Mover para cima" disabled={i === 0} onClick={() => start(() => moveOwnItem(it.id, "UP"))}>↑</button>
                    <button type="button" className="icon" title="Mover para baixo" disabled={i === items.length - 1} onClick={() => start(() => moveOwnItem(it.id, "DOWN"))}>↓</button>
                    <RemoveButton onConfirm={() => start(() => removeOwnItem(it.id))} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!readOnly && (adding
        ? <AddItem compositionId={compositionId} tableId={tableId} tableLabel={tableLabel} onDone={() => setAdding(false)} />
        : <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>+ Item</button>)}
    </div>
  );
}

function RemoveButton({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="icon danger" title="Retirar item" onClick={() => setAsking(true)}>✕</button>;
  return (
    <>
      <button type="button" className="btn small danger" onClick={onConfirm}>Retirar</button>
      <button type="button" className="btn small secondary" onClick={() => setAsking(false)}>Não</button>
    </>
  );
}

function CoefficientCell({ itemId, value }: { itemId: string; value: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateOwnItemCoefficient.bind(null, itemId), idle);
  const [draft, setDraft] = useState(comma(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setDraft(comma(value)); }
  const formRef = useRef<HTMLFormElement>(null);
  const changed = draft !== comma(value);
  return (
    <form ref={formRef} action={action} style={{ display: "inline" }}>
      <input name="coefficient" value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="decimal" aria-label="Coeficiente"
        onBlur={() => { if (changed) formRef.current?.requestSubmit(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (changed) formRef.current?.requestSubmit(); } }}
        style={{ width: 110, textAlign: "right", padding: "3px 6px", borderColor: err(state, "coefficient") ? "var(--danger)" : undefined }}
        title={err(state, "coefficient")} />
    </form>
  );
}

function AddItem({ compositionId, tableId, tableLabel, onDone }: { compositionId: string; tableId: string | null; tableLabel: string; onDone: () => void }) {
  const [type, setType] = useState<ItemType>("OFFICIAL_INPUT");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ItemHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ItemHit | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, action] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const r = await addOwnItem(compositionId, tableId, prev, fd);
    if (r.status === "ok") { setPicked(null); setQuery(""); setHits([]); }
    return r;
  }, idle);

  const schedule = (q: string, t: ItemType) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try { setHits(await searchOwnItemCandidates(compositionId, tableId, t, q)); } finally { setSearching(false); }
    }, 250);
  };
  const official = type === "OFFICIAL_INPUT" || type === "OFFICIAL_COMPOSITION";

  return (
    <div className="service-form" style={{ marginTop: 12 }}>
      <FormMessage state={state} />
      {!picked ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={type} onChange={(e) => { const t = e.target.value as ItemType; setType(t); schedule(query, t); }} aria-label="Tipo de item" style={{ width: 230 }}>
              {(Object.keys(TYPE_LABEL) as ItemType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <input value={query} onChange={(e) => { setQuery(e.target.value); schedule(e.target.value, type); }} autoFocus style={{ flex: 1, minWidth: 220 }}
              placeholder={official ? "Código ou palavras (ex.: 370, cimento cp ii)" : "Código ou palavras"} aria-label="Buscar item" />
            <button type="button" className="btn small secondary" onClick={onDone}>Fechar</button>
          </div>
          {official && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Busca em {tableLabel}. O item fica guardado pelo código e é precificado na base de cada orçamento.</div>}
          {searching && <div className="muted" style={{ padding: 6 }}>Buscando…</div>}
          {!searching && query.trim().length >= 2 && hits.length === 0 && <div className="muted" style={{ padding: 6 }}>Nada encontrado.</div>}
          {hits.length > 0 && (
            <table className="list" style={{ marginTop: 8 }}>
              <thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th className="num">{type.endsWith("COMPOSITION") ? "Custo" : "Preço"}</th><th></th></tr></thead>
              <tbody>
                {hits.map((h) => (
                  <tr key={h.ref}>
                    <td className="mono">{h.code}</td>
                    <td>{h.description}{h.detail && <span className="muted" style={{ fontSize: 12 }}> · {h.detail}</span>}</td>
                    <td>{h.unit}</td>
                    <td className="num">{type === "OWN_COMPOSITION" ? "—" : brl(h.price)}</td>
                    <td className="num"><button type="button" className="btn small" onClick={() => setPicked(h)}>Escolher</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <form action={action} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="ref" value={picked.ref} />
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="muted" style={{ fontSize: 12 }}>{TYPE_LABEL[type]}</div>
            <div><span className="mono">{picked.code}</span> · {picked.description} <span className="muted">({picked.unit})</span></div>
          </div>
          <div className="field" style={{ width: 150 }}>
            <label htmlFor="coef">Coeficiente ({picked.unit})</label>
            <input id="coef" name="coefficient" inputMode="decimal" required autoFocus aria-invalid={!!err(state, "coefficient")} />
            {err(state, "coefficient") && <span className="error">{err(state, "coefficient")}</span>}
          </div>
          <button type="button" className="btn small secondary" onClick={() => setPicked(null)}>Trocar</button>
          <button type="submit" className="btn small">Incluir</button>
        </form>
      )}
    </div>
  );
}
