// src/app/bdi/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { WORK_TYPE_LABEL, pct } from "@/lib/format";
import { classifyBdi } from "@/core/bdi";

export const dynamic = "force-dynamic";

export default async function BdiListPage() {
  const { company, role } = await requireAuth();
  const list = await prisma.bdiProfile.findMany({ where: { companyId: company.id }, orderBy: { name: "asc" } });
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>BDI</h1>
        {canEdit(role) && <Link className="btn" href="/bdi/novo">Novo BDI</Link>}
      </div>
      {list.length === 0 ? (
        <div className="empty">Nenhum BDI cadastrado. Cadastre ao menos um para criar orçamentos.</div>
      ) : (
        <table className="list">
          <thead><tr><th>Nome</th><th>Tipo de obra</th><th className="num">AC</th><th className="num">S+G</th><th className="num">R</th><th className="num">DF</th><th className="num">L</th><th className="num">Tributos</th><th className="num">BDI</th><th>Faixa TCU</th></tr></thead>
          <tbody>
            {list.map((b) => {
              const taxes = Number(b.pis) + Number(b.cofins) + Number(b.iss) + Number(b.cprb);
              const status = classifyBdi(b.percent.toString(), b.workType);
              return (
                <tr key={b.id}>
                  <td><Link href={`/bdi/${b.id}`}>{b.name}</Link></td>
                  <td>{WORK_TYPE_LABEL[b.workType]}</td>
                  <td className="num">{pct(b.centralAdministration)}</td>
                  <td className="num">{pct(Number(b.insurance) + Number(b.guarantee))}</td>
                  <td className="num">{pct(b.risk)}</td>
                  <td className="num">{pct(b.financialExpenses)}</td>
                  <td className="num">{pct(b.profit)}</td>
                  <td className="num">{pct(taxes)}</td>
                  <td className="num"><strong>{pct(b.percent)}</strong></td>
                  <td>{status === "WITHIN" ? <span className="badge ok">dentro</span> : status === "ABOVE" ? <span className="badge warn">acima</span> : <span className="badge warn">abaixo</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
