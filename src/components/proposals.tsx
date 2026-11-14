// src/components/proposals.tsx
// Propostas recebidas: envio com conferência, exigências e exclusão (decisões #76–#79).
"use client";
import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProposalAction, readProposalAction, saveProposalAction, saveProposalRulesAction, type ReadProposalResult, type ReviewLine } from "@/lib/actions/proposals";
import { idle, type ActionState } from "@/lib/forms";
import { ConfirmButton } from "./confirm-button";
import { Field, FormMessage, SubmitButton, err, val } from "./form";

const money = (v: string | null) => (v === null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const qtyFmt = (v: string | null) => (v === null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 }));
/** "1.234,56" / "1234.56" → "1234.56"; vazio → null */
const toNum = (s: string) => {
  let t = s.trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
};
const toInt = (s: string) => (/^\d{1,4}$/.test(s.trim()) ? Number(s.trim()) : null);

export function ProposalRulesForm({ projectId, data, readOnly }: { projectId: string; data: { maxDays: number | null; minValidity: number | null }; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(saveProposalRulesAction.bind(null, projectId), idle);
  return (
    <form action={action} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
      <FormMessage state={state} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Field label="Prazo máximo de execução (dias)" name="bidderMaxDays" error={err(state, "bidderMaxDays")}>
          <input id="bidderMaxDays" name="bidderMaxDays" inputMode="numeric" defaultValue={val(state, "bidderMaxDays", data.maxDays)} placeholder="sem limite" style={{ width: 150 }} />
        </Field>
        <Field label="Validade mínima da proposta (dias)" name="bidderMinValidityDays" error={err(state, "bidderMinValidityDays")}>
          <input id="bidderMinValidityDays" name="bidderMinValidityDays" inputMode="numeric" defaultValue={val(state, "bidderMinValidityDays", data.minValidity)} placeholder="sem limite" style={{ width: 150 }} />
        </Field>
      </fieldset>
      {!readOnly && <div style={{ paddingBottom: 14 }}><SubmitButton className="btn secondary">Salvar</SubmitButton></div>}
      {state.status === "ok" && <span className="muted" style={{ paddingBottom: 20, fontSize: 13 }}>{state.message}</span>}
    </form>
  );
}

export function DeleteProposalButton({ projectId, proposalId }: { projectId: string; proposalId: string }) {
  return <ConfirmButton label="Excluir" confirmLabel="Excluir proposta" className="btn small danger" action={() => deleteProposalAction(projectId, proposalId)} />;
}

type Ok = Extract<ReadProposalResult, { ok: true }>;

export function ProposalUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Ok | null>(null);
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [head, setHead] = useState({ bidderName: "", document: "", technicalLead: "", executionDays: "", validityDays: "", declaredTotal: "" });
  const [saved, setSaved] = useState<string | null>(null);

  const onFile = (fd: FormData) => start(async () => {
    setError(null); setSaved(null);
    const r = await readProposalAction(projectId, fd);
    if (!r.ok) { setError(r.message); setRead(null); return; }
    setRead(r);
    setLines(r.lines);
    const h = r.header;
    setHead({
      bidderName: h.company ?? "", document: h.document ?? "", technicalLead: h.technicalLead ?? "",
      executionDays: h.executionDays?.toString() ?? "", validityDays: h.validityDays?.toString() ?? "",
      declaredTotal: h.declaredTotal ? Number(h.declaredTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
    });
  });

  const stats = useMemo(() => {
    if (!read) return null;
    const used = new Set(lines.map((l) => l.nodeId).filter(Boolean));
    return {
      matched: lines.filter((l) => l.nodeId).length,
      extras: lines.filter((l) => !l.nodeId).length,
      noPrice: lines.filter((l) => l.nodeId && !l.unitPrice).length,
      notQuoted: read.ref.filter((r) => !used.has(r.nodeId)),
    };
  }, [read, lines]);

  const save = () => start(async () => {
    if (!read) return;
    setError(null);
    const r = await saveProposalAction(projectId, {
      bidderName: head.bidderName, document: head.document || null, technicalLead: head.technicalLead || null,
      executionDays: toInt(head.executionDays), validityDays: toInt(head.validityDays), declaredTotal: toNum(head.declaredTotal),
      fileName: read.fileName, fileKind: read.fileKind,
      lines: lines.map((l) => ({ nodeId: l.nodeId, item: l.item, description: l.description, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice, totalPrice: l.totalPrice })),
    });
    if (!r.ok) { setError(r.message); return; }
    setSaved(`Proposta de ${head.bidderName} gravada.`);
    setRead(null); setLines([]);
    router.refresh();
  });

  const setHeadField = (k: keyof typeof head) => (e: React.ChangeEvent<HTMLInputElement>) => setHead({ ...head, [k]: e.target.value });
  const used = new Map<string, number>();
  for (const l of lines) if (l.nodeId) used.set(l.nodeId, (used.get(l.nodeId) ?? 0) + 1);

  return (
    <div>
      <form action={onFile} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" name="file" accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Arquivo da proposta" />
        <button type="submit" className="btn secondary" disabled={pending}>{pending && !read ? "Lendo…" : "Ler a proposta"}</button>
        <span className="muted" style={{ fontSize: 12 }}>.xlsx (inclusive a planilha para proponentes devolvida) ou PDF com texto; até 10 MB</span>
      </form>
      {error && <div className="form-error" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      {saved && <p className="muted" style={{ marginBottom: 0 }}>{saved}</p>}

      {read && stats && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 6px" }}>Conferência — {read.fileName}</h3>
          {read.warnings.map((w) => <div key={w} className="form-error" style={{ background: "#fff8ec", borderColor: "#f0d9a8", color: "#7a5300" }}>{w}</div>)}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <Field label="Proponente" name="bidderName"><input id="bidderName" value={head.bidderName} onChange={setHeadField("bidderName")} /></Field>
            <Field label="CNPJ" name="document"><input id="document" value={head.document} onChange={setHeadField("document")} /></Field>
            <Field label="RT / CREA" name="technicalLead"><input id="technicalLead" value={head.technicalLead} onChange={setHeadField("technicalLead")} /></Field>
            <Field label="Prazo (dias)" name="executionDays"><input id="executionDays" inputMode="numeric" value={head.executionDays} onChange={setHeadField("executionDays")} /></Field>
            <Field label="Validade (dias)" name="validityDays"><input id="validityDays" inputMode="numeric" value={head.validityDays} onChange={setHeadField("validityDays")} /></Field>
            <Field label="Total declarado (R$)" name="declaredTotal"><input id="declaredTotal" inputMode="decimal" value={head.declaredTotal} onChange={setHeadField("declaredTotal")} /></Field>
          </div>
          <p style={{ fontSize: 13 }}>
            {stats.matched} linha(s) casada(s) com a planilha · {stats.extras} acrescentada(s) pela proponente · {stats.noPrice} sem preço
            {stats.notQuoted.length > 0 && <> · <strong>{stats.notQuoted.length} item(ns) do orçamento ausente(s) da proposta</strong> ({stats.notQuoted.slice(0, 6).map((r) => r.item).join(", ")}{stats.notQuoted.length > 6 ? "…" : ""})</>}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="list" style={{ fontSize: 12 }}>
              <thead><tr><th>Item</th><th>Descrição na proposta</th><th>Und</th><th className="num">Quant.</th><th className="num">Preço unit.</th><th className="num">Total</th><th>Item do orçamento</th></tr></thead>
              <tbody>
                {lines.map((l, k) => {
                  const dup = l.nodeId && (used.get(l.nodeId) ?? 0) > 1;
                  return (
                    <tr key={k} style={{ background: !l.nodeId ? "#fff8ec" : dup ? "#fdecec" : undefined }}>
                      <td className="mono">{l.item ?? "—"}</td>
                      <td style={{ maxWidth: 360 }}>{l.description.length > 140 ? `${l.description.slice(0, 140)}…` : l.description || "—"}</td>
                      <td>{l.unit ?? "—"}</td>
                      <td className="num">{qtyFmt(l.quantity)}</td>
                      <td className="num">{l.unitPrice ? money(l.unitPrice) : <span style={{ color: "var(--danger)" }}>sem preço</span>}</td>
                      <td className="num">{money(l.totalPrice)}</td>
                      <td>
                        <select aria-label={`Item do orçamento para a linha ${l.item ?? k + 1}`} value={l.nodeId ?? ""} style={{ maxWidth: 300, fontSize: 12 }}
                          onChange={(e) => setLines(lines.map((x, j) => (j === k ? { ...x, nodeId: e.target.value || null, matchedBy: null } : x)))}>
                          <option value="">— acrescentado pela proponente —</option>
                          {read.ref.map((r) => <option key={r.nodeId} value={r.nodeId}>{r.item} · {r.description.slice(0, 70)}</option>)}
                        </select>
                        {l.matchedBy === "description" && <div className="muted" style={{ fontSize: 11 }}>casado pela descrição</div>}
                        {dup && <div style={{ fontSize: 11, color: "var(--danger)" }}>item repetido: só o primeiro entra no mapa</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="actions" style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={save} disabled={pending || !head.bidderName.trim()}>{pending ? "Gravando…" : "Gravar proposta"}</button>
            <button type="button" className="btn secondary" onClick={() => { setRead(null); setLines([]); }} disabled={pending}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
