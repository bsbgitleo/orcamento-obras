// src/app/orcamentos/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BUDGET_STATUS_LABEL, CATEGORY_LABEL, PROJECT_TYPE_LABEL, REGIME_LABEL, WORK_TYPE_LABEL, brl, dateTimeBR, pct, refMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BudgetPage(props: PageProps<"/orcamentos/[id]">) {
  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      budgets: { orderBy: { revision: "desc" }, include: { priceTable: true, bdi: true, supplyBdi: true, socialCharges: true, _count: { select: { nodes: true } } } },
    },
  });
  if (!project) notFound();
  const budget = project.budgets[0];

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{project.code}</span> · {project.name}</h1>
        <span className="badge">{BUDGET_STATUS_LABEL[budget.status]} · R{budget.revision}</span>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dados gerais</h2>
        <dl className="kv">
          <dt>Tipo</dt><dd>{PROJECT_TYPE_LABEL[project.type]}</dd>
          <dt>Categoria</dt><dd>{CATEGORY_LABEL[project.category]}</dd>
          <dt>Cliente</dt><dd>{project.client ? <Link href={`/clientes/${project.client.id}`}>{project.client.name}</Link> : "—"}</dd>
          <dt>UF / local</dt><dd>{project.uf}{project.address ? ` — ${project.address}` : ""}</dd>
          <dt>Prazo de entrega</dt><dd>{project.deadlineDays === null ? "—" : `${project.deadlineDays} dias`}</dd>
          {project.type === "PUBLIC" && (
            <>
              <dt>Órgão licitante</dt><dd>{project.biddingAgency ?? "—"}</dd>
              <dt>Modalidade</dt><dd>{project.biddingModality ?? "—"}</dd>
              <dt>Processo / edital</dt><dd>{project.biddingNumber ?? "—"}</dd>
              <dt>Abertura</dt><dd>{dateTimeBR(project.biddingOpensAt)}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Parâmetros de cálculo</h2>
        <dl className="kv">
          <dt>Base de preços</dt><dd>{budget.priceTable.origin} {budget.priceTable.uf} {refMonth(budget.priceTable.referenceMonth)} — {REGIME_LABEL[budget.priceTable.regime]}</dd>
          <dt>Encargos sociais</dt><dd><Link href={`/encargos/${budget.socialCharges.id}`}>{budget.socialCharges.name}</Link> (horista {pct(budget.socialCharges.hourlyPct)}, mensalista {pct(budget.socialCharges.monthlyPct)})</dd>
          <dt>BDI</dt><dd><Link href={`/bdi/${budget.bdi.id}`}>{budget.bdi.name}</Link> — {pct(budget.bdi.percent)} ({WORK_TYPE_LABEL[budget.bdi.workType]})</dd>
          {budget.supplyBdi && <><dt>BDI mero fornecimento</dt><dd><Link href={`/bdi/${budget.supplyBdi.id}`}>{budget.supplyBdi.name}</Link> — {pct(budget.supplyBdi.percent)}</dd></>}
          <dt>Arredondamento</dt><dd>TRUNC(coef × preço, 2) por item; soma por composição (regra SINAPI)</dd>
        </dl>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Planilha orçamentária</h2>
        <dl className="kv">
          <dt>Itens na EAP</dt><dd>{budget._count.nodes}</dd>
          <dt>Custo direto</dt><dd>{brl(budget.directCost)}</dd>
          <dt>Preço de venda</dt><dd>{brl(budget.salePrice)}</dd>
        </dl>
        <p className="muted" style={{ marginTop: 12 }}>A montagem da EAP (etapas e serviços) e a busca de composições entram na próxima etapa de desenvolvimento.</p>
      </div>
    </>
  );
}
