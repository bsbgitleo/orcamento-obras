// src/app/(app)/orcamentos/[id]/memoria/page.tsx
// Memória de cálculo dos quantitativos: parâmetros com sigla, valor ou fórmula,
// e o vínculo das quantidades da planilha (decisões #80–#81).
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { BudgetTabs } from "@/components/budget-tabs";
import { isSicroProject } from "@/lib/budget-origin";
import { loadMemoryData } from "@/lib/pricing/memory-data";
import { CalcRowForm, CalcRowTools, NoteForm, QuantityLink } from "@/components/calc-memory";

export const dynamic = "force-dynamic";

const fmt = (v: string | null) => (v === null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 6 }));
const normUnit = (u: string | null) => (u ?? "").toLowerCase().replace("²", "2").replace("³", "3").replace(/\s|\./g, "");

export default async function MemoryPage(props: PageProps<"/orcamentos/[id]/memoria">) {
  const { id } = await props.params;
  const { company, role } = await requireAuth();
  const project = await prisma.project.findFirst({ where: { id, companyId: company.id }, include: { budgets: { orderBy: { revision: "desc" }, take: 1, select: { id: true } } } });
  if (!project) notFound();
  const readOnly = !canEdit(role);
  const d = await loadMemoryData(prisma, project.budgets[0].id);
  const params = d.rows.filter((r) => r.kind === "PARAM" && r.code);
  const paramById = new Map(params.map((p) => [p.id, p]));
  const services = d.tree.filter((t) => !t.stage && !t.auto);
  const errors = params.filter((p) => p.error).length;

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{project.code}</span> · {project.name}</h1>
      </div>
      <BudgetTabs projectId={project.id} sicro={await isSicroProject(project.id)} />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Memória de cálculo dos quantitativos {errors > 0 && <span className="badge warn" style={{ marginLeft: 8 }}>{errors} com erro</span>}</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Parâmetros com sigla: valor medido ou estimado, ou fórmula com as siglas dos outros (o app calcula na ordem certa e aponta erros).
          Uma quantidade da planilha pode acompanhar um parâmetro (abaixo). A memória vai para a planilha das proponentes e para a planilha
          orçamentária em Excel, com as fórmulas vivas.
        </p>
        <NoteForm projectId={project.id} field="calcMemoryNote" value={d.calcMemoryNote} readOnly={readOnly} label="Aviso no alto da memória"
          placeholder="ATENÇÃO: os quantitativos foram estimados a partir dos projetos fornecidos; a proponente deve conferi-los na vistoria." />
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="list" style={{ fontSize: 13 }}>
            <thead><tr><th>Ref.</th><th>Descrição</th><th className="num">Valor</th><th>Und</th><th>Origem / fórmula</th>{!readOnly && <th />}</tr></thead>
            <tbody>
              {d.rows.length === 0 && <tr><td colSpan={6} className="muted">Nenhum parâmetro. Comece pelos dados de projeto (dimensões, quantidades contadas) e depois as fórmulas.</td></tr>}
              {d.rows.map((r, k) => (
                <tr key={r.id} style={r.kind === "SECTION" ? { background: "#eef2f6" } : undefined}>
                  {r.kind === "SECTION" ? (
                    <td colSpan={5}><strong>{r.description}</strong></td>
                  ) : (
                    <>
                      <td className="mono"><strong>{r.code}</strong></td>
                      <td>
                        {r.description}
                        {r.estimated && <span className="badge warn" style={{ marginLeft: 6 }}>estimado — conferir em campo</span>}
                        {r.linked.length > 0 && <div className="muted" style={{ fontSize: 11 }}>quantidade de {r.linked.join(", ")}</div>}
                      </td>
                      <td className="num" style={r.error ? { color: "var(--danger)" } : undefined} title={r.error ?? undefined}>
                        {r.error ? <span style={{ fontSize: 12 }}>{r.error}</span> : <strong>{fmt(r.result)}</strong>}
                      </td>
                      <td>{r.unit ?? "—"}</td>
                      <td style={{ fontSize: 12 }}>
                        {r.formula && <div className="mono">= {r.formula}</div>}
                        {r.source && <div className="muted">{r.source}</div>}
                      </td>
                    </>
                  )}
                  {!readOnly && <td style={{ whiteSpace: "nowrap" }}><CalcRowTools projectId={project.id} row={r} first={k === 0} last={k === d.rows.length - 1} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && <div style={{ marginTop: 12 }}><h3 style={{ margin: "0 0 6px" }}>Incluir</h3><CalcRowForm projectId={project.id} row={null} /></div>}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Quantidades vinculadas</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Escolha o parâmetro de cada serviço que deve acompanhar a memória: mudou a medida, muda a quantidade (4 casas) e o orçamento é recalculado.
          Sem vínculo, a quantidade continua digitada na planilha.
        </p>
        {services.length === 0 ? <div className="empty">A planilha está vazia.</div> : params.length === 0 ? <div className="empty">Inclua parâmetros na memória para vincular quantidades.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="list" style={{ fontSize: 12 }}>
              <thead><tr><th>Item</th><th>Serviço</th><th>Und</th><th className="num">Quantidade</th><th>Parâmetro</th></tr></thead>
              <tbody>
                {d.tree.filter((t) => !t.auto).map((t) => t.stage ? (
                  <tr key={t.id} style={{ background: "#eef2f6" }}><td className="mono"><strong>{t.code}</strong></td><td colSpan={4}><strong>{t.description}</strong></td></tr>
                ) : (
                  <tr key={t.id}>
                    <td className="mono">{t.code}</td>
                    <td style={{ maxWidth: 420 }}>{t.description}</td>
                    <td>{t.unit ?? "—"}</td>
                    <td className="num">{fmt(t.quantity)}</td>
                    <td>
                      <QuantityLink projectId={project.id} nodeId={t.id} value={t.quantityParamId} readOnly={readOnly}
                        options={params.map((p) => ({ id: p.id, code: p.code!, description: p.description, unit: p.unit }))} />
                      {t.quantityParamId && paramById.get(t.quantityParamId) && normUnit(paramById.get(t.quantityParamId)!.unit) !== normUnit(t.unit) && (
                        <div style={{ fontSize: 11, color: "#7a5300" }}>unidade do parâmetro ({paramById.get(t.quantityParamId)!.unit ?? "—"}) diferente da do serviço</div>
                      )}
                      {t.quantityParamId && paramById.get(t.quantityParamId)?.error && <div style={{ fontSize: 11, color: "var(--danger)" }}>parâmetro com erro: ficou o último valor</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
