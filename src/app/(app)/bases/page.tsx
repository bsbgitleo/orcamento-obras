// src/app/bases/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { reconcileStaleJobs } from "@/lib/imports/jobs";
import { IMPORT_STATUS_LABEL, REGIME_LABEL, dateTimeBR, pct, refMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PriceTablesPage() {
  const { company, user } = await requireAuth();
  const isAdmin = user.isPlatformAdmin;
  if (isAdmin) await reconcileStaleJobs();
  const [tables, maintenance, jobs] = await Promise.all([
    prisma.priceTable.findMany({
      where: { OR: [{ companyId: null }, { companyId: company.id }] },
      orderBy: [{ referenceMonth: "desc" }, { uf: "asc" }, { regime: "asc" }],
      include: { _count: { select: { inputs: true, compositions: true } } },
    }),
    prisma.sourceMaintenance.groupBy({ by: ["fileMonth"], where: { origin: "SINAPI" }, _count: true, orderBy: { fileMonth: "desc" }, take: 1 }),
    isAdmin
      ? prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { createdBy: { select: { name: true } } } })
      : Promise.resolve([]),
  ]);
  const budgetsByTable = new Map(
    (await prisma.budget.groupBy({ by: ["priceTableId"], where: { project: { companyId: company.id } }, _count: true }))
      .map((b) => [b.priceTableId, b._count]),
  );
  const maint = maintenance[0];

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Tabelas de preço importadas</h1>
        {isAdmin && <Link className="btn" href="/bases/importar">Importar SINAPI</Link>}
      </div>
      {tables.length === 0 ? (
        <div className="empty">
          Nenhuma tabela. {isAdmin ? <>Use <Link href="/bases/importar">Importar SINAPI</Link> com o ZIP baixado no site da Caixa.</> : "O administrador da plataforma ainda não importou as bases oficiais."}
        </div>
      ) : (
        <table className="list">
          <thead><tr><th>Origem</th><th>UF</th><th>Referência</th><th>Regime</th><th className="num">Insumos</th><th className="num">Composições</th><th className="num">Encargos horista</th><th className="num">Encargos mensalista</th><th className="num">Seus orçamentos</th><th>Importada em</th></tr></thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.id}>
                <td>{t.origin}</td><td>{t.uf}</td><td>{refMonth(t.referenceMonth)}</td><td>{REGIME_LABEL[t.regime]}</td>
                <td className="num">{t._count.inputs.toLocaleString("pt-BR")}</td>
                <td className="num">{t._count.compositions.toLocaleString("pt-BR")}</td>
                <td className="num">{t.socialChargesHourly === null ? "—" : pct(Number(t.socialChargesHourly) * 100)}</td>
                <td className="num">{t.socialChargesMonthly === null ? "—" : pct(Number(t.socialChargesMonthly) * 100)}</td>
                <td className="num">{budgetsByTable.get(t.id) ?? 0}</td>
                <td>{dateTimeBR(t.importedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted" style={{ marginTop: 14 }}>
        {maint
          ? <>Manutenções do SINAPI: relatório de {refMonth(maint.fileMonth)} ({maint._count.toLocaleString("pt-BR")} registros). Orçamentos em referência anterior mostram as composições e insumos desativados ou alterados depois.</>
          : <>Manutenções do SINAPI ainda não importadas: os orçamentos não recebem alerta de composições desativadas ou alteradas.</>}
      </p>

      {isAdmin && jobs.length > 0 && (
        <>
          <h2>Últimas importações</h2>
          <table className="list">
            <thead><tr><th>Enviada em</th><th>Por</th><th>Arquivos</th><th>UFs</th><th>Situação</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><Link href={`/bases/importacoes/${j.id}`}>{dateTimeBR(j.createdAt)}</Link></td>
                  <td>{j.createdBy.name}</td>
                  <td>{j.fileNames.join(", ")}</td>
                  <td>{j.ufs.join(", ") || "—"}</td>
                  <td>
                    <span className={`badge ${j.status === "DONE" ? (j.error ? "warn" : "ok") : j.status === "FAILED" ? "danger" : ""}`}>{IMPORT_STATUS_LABEL[j.status]}</span>
                    {j.error && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{j.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
