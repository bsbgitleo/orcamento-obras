// src/app/orcamentos/[id]/curva-abc/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { buildAbcReport } from "@/lib/pricing/abc";
import { BudgetTabs } from "@/components/budget-tabs";
import { INPUT_KIND_LABEL, brl } from "@/lib/format";

export const dynamic = "force-dynamic";

const fmtPct = (v: { toFixed(n: number): string }) => v.toFixed(2).replace(".", ",") + " %";
const fmtQty = (v: { toFixed(n: number): string }) => Number(v.toFixed(4)).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const classBadge = (c: string) => <span className={`badge ${c === "A" ? "danger" : c === "B" ? "warn" : ""}`}>{c}</span>;

export default async function AbcPage(props: PageProps<"/orcamentos/[id]/curva-abc">) {
  const { id } = await props.params;
  const { company } = await requireAuth();
  const project = await prisma.project.findFirst({ where: { id, companyId: company.id }, include: { budgets: { orderBy: { revision: "desc" }, take: 1 } } });
  if (!project) notFound();
  const budget = project.budgets[0];
  const report = await buildAbcReport(prisma, budget.id);
  const count = (rows: { abcClass: string }[], c: string) => rows.filter((r) => r.abcClass === c).length;

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{project.code}</span> · {project.name}</h1>
      </div>
      <BudgetTabs projectId={project.id} />

      {report.skipped > 0 && <div className="form-error">{report.skipped} serviço(s) sem custo foram ignorados.</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Curva ABC de serviços <span className="muted" style={{ fontWeight: 400 }}>· A: {count(report.services, "A")} · B: {count(report.services, "B")} · C: {count(report.services, "C")} · custo direto {brl(report.servicesTotal)}</span></h2>
        {report.services.length === 0 ? <div className="empty">Sem serviços com custo.</div> : (
          <table className="list">
            <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>Un.</th><th className="num">Quant.</th><th className="num">Custo unit.</th><th className="num">Custo total</th><th className="num">%</th><th className="num">% acum.</th><th>Classe</th></tr></thead>
            <tbody>
              {report.services.map((r) => (
                <tr key={r.item.compositionId ?? r.rank}>
                  <td>{r.rank}</td><td className="mono">{r.item.code}</td><td>{r.item.description}</td><td>{r.item.unit}</td>
                  <td className="num">{fmtQty(r.item.quantity)}</td><td className="num">{brl(r.item.unitCost)}</td><td className="num">{brl(r.total)}</td>
                  <td className="num">{fmtPct(r.sharePct)}</td><td className="num">{fmtPct(r.cumulativePct)}</td><td>{classBadge(r.abcClass)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Curva ABC de insumos <span className="muted" style={{ fontWeight: 400 }}>· A: {count(report.inputs, "A")} · B: {count(report.inputs, "B")} · C: {count(report.inputs, "C")} · total {brl(report.inputsTotal)}</span></h2>
        <p className="muted">Quantidades obtidas pela explosão das composições (quantidade do serviço × coeficientes, atravessando as auxiliares). O total difere em centavos do custo direto por causa do truncamento item a item do SINAPI. Use a classe A para pesquisar preços no mercado local (TCU, guia 4.2.9).</p>
        {report.inputs.length === 0 ? <div className="empty">Sem insumos.</div> : (
          <table className="list">
            <thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>Tipo</th><th>Un.</th><th className="num">Quant.</th><th className="num">Preço unit.</th><th className="num">Total</th><th className="num">%</th><th className="num">% acum.</th><th>Classe</th></tr></thead>
            <tbody>
              {report.inputs.map((r) => (
                <tr key={r.item.inputId}>
                  <td>{r.rank}</td><td className="mono">{r.item.code}</td><td>{r.item.description}</td><td className="muted" style={{ whiteSpace: "nowrap" }}>{INPUT_KIND_LABEL[r.item.kind] ?? r.item.kind}</td><td>{r.item.unit}</td>
                  <td className="num">{fmtQty(r.item.quantity)}</td><td className="num">{brl(r.item.unitPrice)}</td><td className="num">{brl(r.total)}</td>
                  <td className="num">{fmtPct(r.sharePct)}</td><td className="num">{fmtPct(r.cumulativePct)}</td><td>{classBadge(r.abcClass)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
