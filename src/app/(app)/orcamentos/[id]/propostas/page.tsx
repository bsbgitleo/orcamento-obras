// src/app/(app)/orcamentos/[id]/propostas/page.tsx
// Propostas recebidas: envio com conferência, resumo com equalização e mapa
// comparativo por item (decisões #76–#79).
import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { brl } from "@/lib/format";
import { BudgetTabs } from "@/components/budget-tabs";
import { isSicroProject } from "@/lib/budget-origin";
import { loadBudgetProposals } from "@/lib/proposals/load";
import type { Cell } from "@/core/proposals/compare";
import { DeleteProposalButton, ProposalRulesForm, ProposalUpload } from "@/components/proposals";

export const dynamic = "force-dynamic";

const pct = (d: Decimal | null) => (d === null ? "—" : `${d.gte(0) ? "+" : ""}${d.times(100).toDecimalPlaces(1).toNumber().toLocaleString("pt-BR", { minimumFractionDigits: 1 })} %`);
const unitFmt = (d: Decimal | null) => (d === null ? "—" : d.toNumber().toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const qtyFmt = (v: string | null) => (v === null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 }));
const FLAG_LABEL = { prazo: "prazo acima do exigido", validade: "validade abaixo da exigida", inexequivel: "abaixo de 75 % do orçado: possível inexequível", soma: "total declarado ≠ soma dos itens" } as const;
const WARN = { background: "#fff8ec", color: "#7a5300" };

function CellView({ c, lowest }: { c: Cell; lowest: boolean }) {
  const missing = c.flags.includes("sem-preco");
  const color = c.flags.includes("acima") ? "#b42318" : c.flags.includes("abaixo") ? "#175cd3" : undefined;
  const title = [
    missing ? (c.flags.includes("preenchido") ? "sem preço: equalizado com o maior preço das demais (ou a referência)" : "sem preço") : null,
    c.vsMedian ? `${pct(c.vsMedian)} da mediana` : null,
    c.vsReference ? `${pct(c.vsReference)} da referência` : null,
    c.flags.includes("quantidade") ? `quantidade da proponente: ${qtyFmt(c.quantity?.toString() ?? null)}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <>
      <td className="num" title={title} style={{ color, fontWeight: lowest ? 700 : undefined, ...(missing ? WARN : {}) }}>
        {missing ? <span style={{ fontStyle: "italic" }}>{c.equalizedUnit ? unitFmt(c.equalizedUnit) : "—"}*</span> : unitFmt(c.unitPrice)}
        {c.flags.includes("quantidade") && <span title={title} style={{ color: "#7a5300" }}> Δq</span>}
      </td>
      <td className="num" style={missing ? WARN : undefined}>{brl(c.equalizedTotal.toString())}</td>
    </>
  );
}

export default async function ProposalsPage(props: PageProps<"/orcamentos/[id]/propostas">) {
  const { id } = await props.params;
  const { company, role } = await requireAuth();
  const data = await loadBudgetProposals(prisma, company.id, id);
  if (!data) notFound();
  const project = await prisma.project.findUniqueOrThrow({ where: { id }, select: { id: true, code: true, name: true } });
  const readOnly = !canEdit(role);
  const { comparison: cmp, proposals } = data;
  const summaryById = new Map(cmp.proposals.map((s) => [s.id, s]));

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{project.code}</span> · {project.name}</h1>
        {proposals.length > 0 && <a className="btn secondary" href={`/api/orcamentos/${project.id}/mapa`} download>Mapa comparativo (.xlsx)</a>}
      </div>
      <BudgetTabs projectId={project.id} sicro={await isSicroProject(project.id)} />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Propostas recebidas</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Envie a proposta de cada proponente. O app lê os itens, casa com a planilha pela numeração (ou pela descrição) e mostra para você
          conferir antes de gravar. Na equalização vale a quantidade do orçamento; item sem preço recebe o maior preço das demais proponentes
          (ou o de referência); itens acrescentados pela proponente ficam à parte.
        </p>
        <ProposalRulesForm projectId={project.id} readOnly={readOnly} data={{ maxDays: data.rules.maxExecutionDays, minValidity: data.rules.minValidityDays }} />
        {!readOnly && <ProposalUpload projectId={project.id} />}
      </div>

      {proposals.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Resumo <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {cmp.referenceTotal.gt(0) ? `referência ${brl(cmp.referenceTotal.toString())}` : "orçamento sem preços de referência: a comparação é só entre as propostas"}</span></h2>
          <div style={{ overflowX: "auto" }}>
            <table className="list" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>#</th><th>Proponente</th><th className="num">Prazo</th><th className="num">Validade</th><th className="num">Como cotado</th>
                  <th className="num">Equalizado</th><th className="num">× referência</th><th>Itens</th><th>Alertas</th>{!readOnly && <th />}
                </tr>
              </thead>
              <tbody>
                {[...cmp.proposals].sort((a, b) => a.rank - b.rank).map((s) => {
                  const p = proposals.find((x) => x.id === s.id)!;
                  return (
                    <tr key={s.id}>
                      <td className="mono">{s.rank}º</td>
                      <td>
                        <strong>{s.name}</strong>
                        <div className="muted" style={{ fontSize: 11 }}>{[p.document, p.fileName].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="num" style={s.flags.includes("prazo") ? { color: "#b42318", fontWeight: 600 } : undefined}>{s.executionDays ?? "—"}{s.executionDays ? " d" : ""}</td>
                      <td className="num" style={s.flags.includes("validade") ? { color: "#b42318", fontWeight: 600 } : undefined}>{s.validityDays ?? "—"}{s.validityDays ? " d" : ""}</td>
                      <td className="num">
                        {brl(s.quotedTotal.toString())}
                        {s.declaredTotal && <div className="muted" style={{ fontSize: 11 }}>declarado {brl(s.declaredTotal.toString())}</div>}
                      </td>
                      <td className="num"><strong>{brl(s.equalizedTotal.toString())}</strong></td>
                      <td className="num">{pct(s.vsReference)}</td>
                      <td style={{ fontSize: 12 }}>
                        {s.counts.missing > 0 && <div>{s.counts.missing} sem preço{s.counts.filled ? ` (${s.counts.filled} equalizado${s.counts.filled > 1 ? "s" : ""})` : ""}</div>}
                        {s.counts.quantity > 0 && <div>{s.counts.quantity} com quantidade alterada</div>}
                        {s.counts.outliers > 0 && <div>{s.counts.outliers} fora de ±30 %</div>}
                        {s.extras.length > 0 && <div>{s.extras.length} acrescentado{s.extras.length > 1 ? "s" : ""} ({brl(s.extrasTotal.toString())})</div>}
                        {!s.counts.missing && !s.counts.quantity && !s.counts.outliers && !s.extras.length && <span className="muted">sem desvios</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {s.flags.length ? s.flags.map((f) => <div key={f} style={{ color: "#b42318" }}>{FLAG_LABEL[f]}{f === "soma" && s.arithmeticGap ? ` (${brl(s.arithmeticGap.toString())})` : ""}</div>) : <span className="muted">—</span>}
                      </td>
                      {!readOnly && <td><DeleteProposalButton projectId={project.id} proposalId={s.id} /></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {proposals.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Mapa comparativo</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Preço unitário e total equalizado (quantidade do orçamento) de cada proponente. <strong>Negrito</strong>: menor preço do item.
            <span style={{ color: "#b42318" }}> Vermelho</span>: 30 % acima da mediana ou da referência; <span style={{ color: "#175cd3" }}>azul</span>: 30 % abaixo.
            <span style={{ ...WARN, padding: "0 4px" }}>Fundo amarelo*</span>: sem preço, equalizado. Δq: quantidade alterada pela proponente.
            Passe o mouse no preço para ver os desvios.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="list" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th rowSpan={2}>Item</th><th rowSpan={2}>Descrição</th><th rowSpan={2}>Und</th><th rowSpan={2} className="num">Quant.</th>
                  <th colSpan={2} style={{ textAlign: "center" }}>Referência</th>
                  {cmp.proposals.map((s) => <th key={s.id} colSpan={2} style={{ textAlign: "center" }}>{s.name}</th>)}
                </tr>
                <tr>
                  <th className="num">Unit.</th><th className="num">Total</th>
                  {cmp.proposals.map((s) => [<th key={`${s.id}u`} className="num">Unit.</th>, <th key={`${s.id}t`} className="num">Total eq.</th>])}
                </tr>
              </thead>
              <tbody>
                {data.layout.map((e, k) => {
                  if (e.kind === "STAGE") {
                    return <tr key={`s${k}`} style={{ background: "#eef2f6" }}><td className="mono"><strong>{e.item}</strong></td><td colSpan={5 + cmp.proposals.length * 2}><strong>{e.description}</strong></td></tr>;
                  }
                  const row = cmp.rows[e.index];
                  return (
                    <tr key={row.ref.nodeId}>
                      <td className="mono">{row.ref.item}</td>
                      <td style={{ maxWidth: 320 }}>{row.ref.description}</td>
                      <td>{row.ref.unit ?? "—"}</td>
                      <td className="num">{qtyFmt(row.ref.quantity)}</td>
                      <td className="num muted">{row.ref.unitPrice ? unitFmt(new Decimal(row.ref.unitPrice)) : "—"}</td>
                      <td className="num muted">{row.ref.unitPrice ? brl(row.referenceTotal.toString()) : "—"}</td>
                      {row.cells.map((c, j) => <CellView key={j} c={c} lowest={row.lowest === j && cmp.proposals.length > 1} />)}
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={5} style={{ textAlign: "right" }}><strong>Total equalizado</strong></td>
                  <td className="num"><strong>{cmp.referenceTotal.gt(0) ? brl(cmp.referenceTotal.toString()) : "—"}</strong></td>
                  {cmp.proposals.map((s) => [<td key={`${s.id}r`} className="num muted">{s.rank}º</td>, <td key={`${s.id}t`} className="num"><strong>{brl(s.equalizedTotal.toString())}</strong></td>])}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cmp.proposals.some((s) => s.extras.length) && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Itens acrescentados pelas proponentes</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Fora da planilha do orçamento (ou repetidos). Não entram no total equalizado: avalie se são necessários ou se duplicam itens já cotados.</p>
          <table className="list" style={{ fontSize: 12 }}>
            <thead><tr><th>Proponente</th><th>Item</th><th>Descrição</th><th>Und</th><th className="num">Quant.</th><th className="num">Preço unit.</th><th className="num">Total</th></tr></thead>
            <tbody>
              {cmp.proposals.flatMap((s) => s.extras.map((x, k) => (
                <tr key={`${s.id}${k}`}>
                  <td>{summaryById.get(s.id)?.name}</td><td className="mono">{x.item ?? "—"}</td><td style={{ maxWidth: 380 }}>{x.description}</td><td>{x.unit ?? "—"}</td>
                  <td className="num">{qtyFmt(x.quantity)}</td><td className="num">{x.unitPrice ? unitFmt(new Decimal(x.unitPrice)) : "—"}</td><td className="num">{brl(x.total.toString())}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
