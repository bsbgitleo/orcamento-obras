// src/app/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BUDGET_STATUS_LABEL, REGIME_LABEL, dateBR, refMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [projects, tables, counts] = await Promise.all([
    prisma.project.findMany({ orderBy: { updatedAt: "desc" }, take: 5, include: { client: true, budgets: { orderBy: { revision: "desc" }, take: 1 } } }),
    prisma.priceTable.findMany({ orderBy: [{ referenceMonth: "desc" }, { uf: "asc" }] }),
    Promise.all([prisma.client.count(), prisma.bdiProfile.count(), prisma.socialChargesProfile.count()]),
  ]);
  const [clients, bdis, charges] = counts;

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Início</h1>
        <Link className="btn" href="/orcamentos/novo">Criar orçamento</Link>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Orçamentos recentes</h2>
        {projects.length === 0 ? (
          <p className="muted">Nenhum orçamento ainda. <Link href="/orcamentos/novo">Crie o primeiro</Link>.</p>
        ) : (
          <table className="list">
            <thead><tr><th>Código</th><th>Descrição</th><th>Cliente</th><th>Revisão</th><th>Situação</th><th>Atualizado</th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="mono"><Link href={`/orcamentos/${p.id}`}>{p.code}</Link></td>
                  <td>{p.name}</td>
                  <td>{p.client?.name ?? "—"}</td>
                  <td>R{p.budgets[0]?.revision ?? 0}</td>
                  <td><span className="badge">{BUDGET_STATUS_LABEL[p.budgets[0]?.status ?? "DRAFT"]}</span></td>
                  <td>{dateBR(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Bases de preço</h2>
        {tables.length === 0 ? (
          <p className="muted">Nenhuma tabela importada. Rode <code>npm run sinapi:import</code>.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {tables.map((t) => <li key={t.id}>{t.origin} {t.uf} {refMonth(t.referenceMonth)} — {REGIME_LABEL[t.regime]}</li>)}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Cadastros</h2>
        <p><Link href="/clientes">{clients} cliente(s)</Link> · <Link href="/bdi">{bdis} BDI(s)</Link> · <Link href="/encargos">{charges} tabela(s) de encargos sociais</Link></p>
      </div>
    </>
  );
}
