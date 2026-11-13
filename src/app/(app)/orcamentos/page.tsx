// src/app/orcamentos/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { BUDGET_STATUS_LABEL, CATEGORY_LABEL, PROJECT_TYPE_LABEL, brl, dateBR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const { company, role } = await requireAuth();
  const projects = await prisma.project.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    include: { client: true, budgets: { orderBy: { revision: "desc" }, take: 1 } },
  });
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Orçamentos</h1>
        {canEdit(role) && <Link className="btn" href="/orcamentos/novo">Criar orçamento</Link>}
      </div>
      {projects.length === 0 ? (
        <div className="empty">Nenhum orçamento. <Link href="/orcamentos/novo">Crie o primeiro</Link>.</div>
      ) : (
        <table className="list">
          <thead><tr><th>Código</th><th>Descrição</th><th>Tipo</th><th>Categoria</th><th>Cliente</th><th>Rev.</th><th>Situação</th><th className="num">Preço de venda</th><th>Criado</th></tr></thead>
          <tbody>
            {projects.map((p) => {
              const b = p.budgets[0];
              return (
                <tr key={p.id}>
                  <td className="mono"><Link href={`/orcamentos/${p.id}`}>{p.code}</Link></td>
                  <td>{p.name}</td>
                  <td>{PROJECT_TYPE_LABEL[p.type]}</td>
                  <td>{CATEGORY_LABEL[p.category]}</td>
                  <td>{p.client?.name ?? "—"}</td>
                  <td>R{b?.revision ?? 0}</td>
                  <td><span className="badge">{BUDGET_STATUS_LABEL[b?.status ?? "DRAFT"]}</span></td>
                  <td className="num">{brl(b?.salePrice)}</td>
                  <td>{dateBR(p.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
