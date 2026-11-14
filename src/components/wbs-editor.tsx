// src/components/wbs-editor.tsx
"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { addService, addStage, deleteNode, moveNode, recalculate, searchCompositionsAction, toggleSupplyItem, updateDescription, updateQuantity, type CompositionBase } from "@/lib/actions/wbs";
import { idle, type ActionState } from "@/lib/forms";
import { brl } from "@/lib/format";
import type { SearchHit, SearchMode } from "@/lib/compositions/search";
import { FormMessage, err, val } from "./form";

export interface WbsLine {
  id: string;
  parentId: string | null;
  code: string;
  level: number;
  kind: "STAGE" | "SERVICE";
  description: string;
  unit: string | null;
  quantity: string | null;
  unitCost: string | null;
  totalCost: string | null;
  unitPrice: string | null;
  totalPrice: string | null;
  isSupplyItem: boolean;
  compositionCode: string | null;
  /** Serviço com composição própria da empresa */
  ownComposition: boolean;
  /** SICRO: composição com momento de transporte sem DMT */
  transportPending?: boolean;
  /** Linha gerada pelo app (etapa de transportes do SICRO) */
  auto?: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export function WbsEditor({ budgetId, projectId, lines, hasSupplyBdi, readOnly = false }: { budgetId: string; projectId: string; lines: WbsLine[]; hasSupplyBdi: boolean; readOnly?: boolean }) {
  const [adding, setAdding] = useState<{ kind: "STAGE" | "SERVICE"; parentId: string | null } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); });

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <span className="muted">{readOnly ? "Seu perfil é somente leitura." : "Clique na quantidade ou na descrição para editar."}</span>
        {!readOnly && <div style={{ display: "flex", gap: 8 }}>
          <button className="btn small secondary" type="button" onClick={() => run(() => recalculate(budgetId))}>Recalcular</button>
          <button className="btn small" type="button" onClick={() => setAdding({ kind: "STAGE", parentId: null })}>+ Etapa</button>
        </div>}
      </div>

      {adding?.kind === "STAGE" && adding.parentId === null && (
        <StageForm budgetId={budgetId} parentId={null} onDone={() => setAdding(null)} />
      )}

      {lines.length === 0 ? (
        <div className="empty">
          A planilha está vazia. Comece adicionando uma etapa (ex.: &ldquo;Serviços preliminares&rdquo;)
          {!readOnly && <> ou <a href={`/orcamentos/${projectId}/importar`}>importe as etapas e os serviços de uma planilha .xlsx</a></>}.
        </div>
      ) : (
        <table className="list wbs">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Item</th>
              <th style={{ width: 80 }}>Código</th>
              <th>Descrição</th>
              <th style={{ width: 50 }}>Un.</th>
              <th className="num" style={{ width: 100 }}>Quant.</th>
              <th className="num" style={{ width: 110 }}>Custo unit.</th>
              <th className="num" style={{ width: 120 }}>Custo total</th>
              <th className="num" style={{ width: 110 }}>Preço unit.</th>
              <th className="num" style={{ width: 120 }}>Preço total</th>
              <th style={{ width: 150 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <LineRow key={l.id} line={l} budgetId={budgetId} hasSupplyBdi={hasSupplyBdi} readOnly={readOnly}
                editing={editing === l.id} onEdit={() => { if (!readOnly) setEditing(l.id); }} onEditDone={() => setEditing(null)}
                onAdd={(kind) => setAdding({ kind, parentId: l.id })} run={run} />
            )).flatMap((row, i) => {
              const l = lines[i];
              const extra = adding && adding.parentId === l.id ? (
                <tr key={`${l.id}-add`}><td colSpan={10} style={{ background: "#f3f8fc" }}>
                  {adding.kind === "STAGE"
                    ? <StageForm budgetId={budgetId} parentId={l.id} onDone={() => setAdding(null)} />
                    : <ServiceForm budgetId={budgetId} parentId={l.id} hasSupplyBdi={hasSupplyBdi} onDone={() => setAdding(null)} />}
                </td></tr>
              ) : null;
              return extra ? [row, extra] : [row];
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LineRow({ line: l, budgetId: _budgetId, hasSupplyBdi, readOnly, editing, onEdit, onEditDone, onAdd, run }: {
  line: WbsLine; budgetId: string; hasSupplyBdi: boolean; readOnly: boolean; editing: boolean;
  onEdit: () => void; onEditDone: () => void; onAdd: (kind: "STAGE" | "SERVICE") => void; run: (fn: () => Promise<unknown>) => void;
}) {
  void _budgetId;
  const isStage = l.kind === "STAGE";
  const indent = { paddingLeft: 12 + (l.level - 1) * 18 };
  return (
    <tr className={isStage ? "stage" : "service"} style={isStage ? { fontWeight: 600, background: l.level === 1 ? "#f4f6f8" : "#fafbfc" } : undefined}>
      <td className="mono">{l.code}</td>
      <td className="mono muted">{l.compositionCode ?? ""}{l.ownComposition && <div><span className="badge" title="Composição própria da empresa, precificada na base deste orçamento">própria</span></div>}</td>
      <td style={indent}>
        {editing && !l.auto ? (
          <DescriptionForm nodeId={l.id} value={l.description} onDone={onEditDone} />
        ) : (
          <span role="button" tabIndex={0} onClick={onEdit} onKeyDown={(e) => e.key === "Enter" && onEdit()} title="Editar descrição" style={{ cursor: "text" }}>
            {l.description}
            {l.isSupplyItem && <span className="badge" style={{ marginLeft: 8 }}>fornecimento</span>}
            {!isStage && l.unitCost === null && <span className="badge danger" style={{ marginLeft: 8 }}>sem custo</span>}
            {l.auto && <span className="badge" style={{ marginLeft: 8 }} title="Calculado pelo app a partir das quantidades e das DMTs (aba Transporte)">automático</span>}
            {l.transportPending && <span className="badge warn" style={{ marginLeft: 8 }} title="Momento de transporte (grupo F) sem DMT: custo igual ao publicado, sem transporte">sem transporte</span>}
          </span>
        )}
      </td>
      <td>{l.unit ?? ""}</td>
      <td className="num">{isStage ? "" : readOnly || l.auto ? (l.quantity ?? "0").replace(".", ",") : <QuantityCell nodeId={l.id} value={l.quantity ?? "0"} />}</td>
      <td className="num">{isStage ? "" : brl(l.unitCost)}</td>
      <td className="num">{brl(l.totalCost)}</td>
      <td className="num">{isStage ? "" : brl(l.unitPrice)}</td>
      <td className="num"><strong>{brl(l.totalPrice)}</strong></td>
      <td className="row-actions">
        {readOnly || l.auto ? null : <>
        {isStage && <button type="button" className="icon" title="Adicionar subetapa" onClick={() => onAdd("STAGE")}>+E</button>}
        {isStage && <button type="button" className="icon" title="Adicionar serviço" onClick={() => onAdd("SERVICE")}>+S</button>}
        {!isStage && hasSupplyBdi && <button type="button" className="icon" title="Alternar mero fornecimento (BDI reduzido)" onClick={() => run(() => toggleSupplyItem(l.id))}>BDI</button>}
        <button type="button" className="icon" title="Mover para cima" disabled={l.isFirst} onClick={() => run(() => moveNode(l.id, "UP"))}>↑</button>
        <button type="button" className="icon" title="Mover para baixo" disabled={l.isLast} onClick={() => run(() => moveNode(l.id, "DOWN"))}>↓</button>
        <button type="button" className="icon danger" title="Excluir" onClick={() => { if (confirm(isStage ? "Excluir esta etapa e tudo que está dentro dela?" : "Excluir este serviço?")) run(() => deleteNode(l.id)); }}>✕</button>
        </>}
      </td>
    </tr>
  );
}

function QuantityCell({ nodeId, value }: { nodeId: string; value: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateQuantity.bind(null, nodeId), idle);
  const [draft, setDraft] = useState(value.replace(".", ","));
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setDraft(value.replace(".", ",")); } // server value changed → reset draft
  const formRef = useRef<HTMLFormElement>(null);
  const changed = draft !== value.replace(".", ",");
  return (
    <form ref={formRef} action={action} style={{ display: "inline" }}>
      <input name="quantity" value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="decimal" aria-label="Quantidade"
        onBlur={() => { if (changed) formRef.current?.requestSubmit(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (changed) formRef.current?.requestSubmit(); } }}
        style={{ width: 90, textAlign: "right", padding: "3px 6px", borderColor: err(state, "quantity") ? "var(--danger)" : undefined }}
        title={err(state, "quantity")} />
    </form>
  );
}

function DescriptionForm({ nodeId, value, onDone }: { nodeId: string; value: string; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(async (prev, fd) => { const r = await updateDescription(nodeId, prev, fd); if (r.status === "ok") onDone(); return r; }, idle);
  return (
    <form action={action} style={{ display: "flex", gap: 6 }}>
      <input name="description" defaultValue={val(state, "description", value)} autoFocus style={{ padding: "3px 6px" }} aria-label="Descrição"
        onKeyDown={(e) => { if (e.key === "Escape") onDone(); }} />
      <button className="btn small" type="submit">OK</button>
      <button className="btn small secondary" type="button" onClick={onDone}>Cancelar</button>
    </form>
  );
}

function StageForm({ budgetId, parentId, onDone }: { budgetId: string; parentId: string | null; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(async (prev, fd) => { const r = await addStage(budgetId, parentId, prev, fd); if (r.status === "ok") onDone(); return r; }, idle);
  return (
    <form action={action} className="inline-form">
      <FormMessage state={state} />
      <input name="description" placeholder={parentId ? "Nova subetapa (ex.: Alvenaria)" : "Nova etapa (ex.: Serviços preliminares)"} autoFocus required aria-label="Descrição da etapa" defaultValue={val(state, "description", "")} style={{ flex: 1 }} />
      <button className="btn small" type="submit">Adicionar</button>
      <button className="btn small secondary" type="button" onClick={onDone}>Cancelar</button>
    </form>
  );
}

function ServiceForm({ budgetId, parentId, hasSupplyBdi, onDone }: { budgetId: string; parentId: string; hasSupplyBdi: boolean; onDone: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(async (prev, fd) => { const r = await addService(budgetId, parentId, prev, fd); if (r.status === "ok") onDone(); return r; }, idle);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("KEYWORDS");
  const [base, setBase] = useState<CompositionBase>("ALL");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search, triggered from the input/select handlers (not an effect).
  const schedule = (q: string, m: SearchMode, b: CompositionBase = base) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try { setHits(await searchCompositionsAction(budgetId, q, m, b)); } finally { setSearching(false); }
    }, 250);
  };

  return (
    <form action={action} className="service-form">
      <FormMessage state={state} />
      {!picked ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={query} onChange={(e) => { setQuery(e.target.value); schedule(e.target.value, mode); }} placeholder="Buscar composição por código ou palavras (ex.: 104658, alvenaria bloco 14x19)" autoFocus aria-label="Buscar composição" style={{ flex: 1 }} />
            <select value={base} onChange={(e) => { const b = e.target.value as CompositionBase; setBase(b); schedule(query, mode, b); }} aria-label="Base" style={{ width: 150 }}>
              <option value="ALL">Oficial e própria</option>
              <option value="OFFICIAL">Só a oficial</option>
              <option value="OWN">Só a própria</option>
            </select>
            <select value={mode} onChange={(e) => { const m = e.target.value as SearchMode; setMode(m); schedule(query, m); }} aria-label="Modo de busca" style={{ width: 160 }}>
              <option value="KEYWORDS">Palavras-chave</option>
              <option value="EXACT">Frase exata</option>
            </select>
            <button className="btn small secondary" type="button" onClick={onDone}>Cancelar</button>
          </div>
          {searching && <div className="muted" style={{ padding: 6 }}>Buscando…</div>}
          {!searching && query.trim().length >= 2 && hits.length === 0 && <div className="muted" style={{ padding: 6 }}>Nada encontrado.</div>}
          {hits.length > 0 && (
            <table className="list" style={{ marginTop: 8 }}>
              <thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th className="num">Custo unit.</th><th></th></tr></thead>
              <tbody>
                {hits.map((h) => (
                  <tr key={`${h.kind}:${h.id}`}>
                    <td className="mono">{h.code}{h.kind === "OWN" && <div><span className="badge">própria</span></div>}</td>
                    <td>{h.description}{h.unitCost === null && <span className="badge danger" style={{ marginLeft: 6 }}>sem custo</span>}</td>
                    <td>{h.unit}</td>
                    <td className="num">{brl(h.unitCost)}</td>
                    <td className="num"><button type="button" className="btn small" onClick={() => setPicked(h)}>Escolher</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "start" }}>
          <div>
            <div><span className="mono">{picked.code}</span>{picked.kind === "OWN" && <span className="badge" style={{ marginLeft: 6 }}>própria</span>} · {picked.description} <span className="muted">({picked.unit}, custo {brl(picked.unitCost)}{picked.kind === "OWN" ? " nesta base" : ""})</span></div>
            <input type="hidden" name={picked.kind === "OWN" ? "ownCompositionId" : "compositionId"} value={picked.id} />
            <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="field" style={{ width: 140 }}>
                <label htmlFor="qty">Quantidade ({picked.unit})</label>
                <input id="qty" name="quantity" inputMode="decimal" required autoFocus defaultValue={val(state, "quantity", "")} aria-invalid={!!err(state, "quantity")} />
                {err(state, "quantity") && <span className="error">{err(state, "quantity")}</span>}
              </div>
              <div className="field" style={{ flex: 1, minWidth: 260 }}>
                <label htmlFor="desc">Descrição no orçamento (opcional)</label>
                <input id="desc" name="description" placeholder={picked.description} defaultValue={val(state, "description", "")} />
              </div>
              {hasSupplyBdi && <label className="checkbox" style={{ paddingBottom: 8 }}><input type="checkbox" name="isSupplyItem" /> Mero fornecimento</label>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn small secondary" type="button" onClick={() => setPicked(null)}>Trocar</button>
            <button className="btn small" type="submit">Adicionar</button>
            <button className="btn small secondary" type="button" onClick={onDone}>Cancelar</button>
          </div>
        </div>
      )}
    </form>
  );
}
