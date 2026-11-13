// src/app/orcamentos/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BUDGET_STATUS_LABEL, CATEGORY_LABEL, PROJECT_TYPE_LABEL, REGIME_LABEL, WORK_TYPE_LABEL, brl, dateTimeBR, pct, refMonth } from "@/lib/format";
import { WbsEditor, type WbsLine } from "@/components/wbs-editor";
import { BudgetTabs } from "@/components/budget-tabs";

export const dynamic = "force-dynamic";

export default async function BudgetPage(props: PageProps<"/orcamentos/[id]">) {
  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      budgets: {
        orderBy: { revision: "desc" }, take: 1,
        include: { priceTable: true, bdi: true, supplyBdi: true, socialCharges: true, nodes: { include: { composition: { select: { code: true } } } } },
      },
    },
  });
  if (!project) notFound();
  const budget = project.budgets[0];

  // Flatten the tree in display order (parentId + position), with the stored codes/totals
  const byParent = new Map<string | null, typeof budget.nodes>();
  for (const n of budget.nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
  const lines: WbsLine[] = [];
  const walk = (parentId: string | null, level: number) => {
    const list = (byParent.get(parentId) ?? []).sort((a, b) => a.position - b.position);
    list.forEach((n, i) => {
      lines.push({
        id: n.id, parentId: n.parentId, code: n.code, level, kind: n.kind, description: n.description, unit: n.unit,
        quantity: n.quantity?.toString() ?? null, unitCost: n.unitCost?.toString() ?? null, totalCost: n.totalCost?.toString() ?? null,
        unitPrice: n.unitPrice?.toString() ?? null, totalPrice: n.totalPrice?.toString() ?? null,
        isSupplyItem: n.isSupplyItem, compositionCode: n.composition?.code ?? null, isFirst: i === 0, isLast: i === list.length - 1,
      });
      if (n.kind === "STAGE") walk(n.id, level + 1);
    });
  };
  walk(null, 1);
  const incomplete = lines.filter((l) => l.kind === "SERVICE" && l.unitCost === null).length;
  const services = lines.filter((l) => l.kind === "SERVICE").length;

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{project.code}</span> · {project.name}</h1>
        <span className="badge">{BUDGET_STATUS_LABEL[budget.status]} · R{budget.revision}</span>
      </div>
      <BudgetTabs projectId={project.id} />

      <div className="totals" style={{ marginBottom: 18 }}>
        <div className="box"><div className="label">Custo direto</div><div className="value">{brl(budget.directCost)}</div></div>
        <div className="box"><div className="label">BDI {pct(budget.bdi.percent)}{budget.supplyBdi ? ` · fornecimento ${pct(budget.supplyBdi.percent)}` : ""}</div><div className="value">{brl(Number(budget.salePrice) - Number(budget.directCost))}</div></div>
        <div className="box"><div className="label">Preço de venda</div><div className="value" style={{ color: "var(--primary)" }}>{brl(budget.salePrice)}</div></div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Planilha orçamentária <span className="muted" style={{ fontWeight: 400 }}>· {services} serviço(s)</span></h2>
        {incomplete > 0 && <div className="form-error">{incomplete} serviço(s) sem custo: a composição tem insumo sem preço nesta base. Eles não entram nos totais.</div>}
        <WbsEditor budgetId={budget.id} lines={lines} hasSupplyBdi={!!budget.supplyBdi} />
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Dados gerais e parâmetros de cálculo</summary>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 14 }}>
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
          <dl className="kv">
            <dt>Base de preços</dt><dd>{budget.priceTable.origin} {budget.priceTable.uf} {refMonth(budget.priceTable.referenceMonth)} — {REGIME_LABEL[budget.priceTable.regime]}</dd>
            <dt>Encargos sociais</dt><dd><Link href={`/encargos/${budget.socialCharges.id}`}>{budget.socialCharges.name}</Link> (horista {pct(budget.socialCharges.hourlyPct)}, mensalista {pct(budget.socialCharges.monthlyPct)})</dd>
            <dt>BDI</dt><dd><Link href={`/bdi/${budget.bdi.id}`}>{budget.bdi.name}</Link> — {pct(budget.bdi.percent)} ({WORK_TYPE_LABEL[budget.bdi.workType]})</dd>
            {budget.supplyBdi && <><dt>BDI fornecimento</dt><dd><Link href={`/bdi/${budget.supplyBdi.id}`}>{budget.supplyBdi.name}</Link> — {pct(budget.supplyBdi.percent)}</dd></>}
            <dt>Arredondamento</dt><dd>TRUNC(coef × preço, 2) por item; TRUNC(qtd × custo, 2); preço unit. = TRUNC(custo × (1 + BDI), 2)</dd>
          </dl>
        </div>
      </details>
    </>
  );
}
