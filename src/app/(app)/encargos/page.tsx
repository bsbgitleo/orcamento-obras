// src/app/encargos/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { REGIME_LABEL, pct, refMonth } from "@/lib/format";
import { createSocialChargesFromTable } from "@/lib/actions/social-charges";

export const dynamic = "force-dynamic";

export default async function SocialChargesPage() {
  const { company, role } = await requireAuth();
  const companyId = company.id;
  const [list, tables] = await Promise.all([
    prisma.socialChargesProfile.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.priceTable.findMany({ where: { socialChargesHourly: { not: null }, OR: [{ companyId: null }, { companyId }] }, orderBy: [{ referenceMonth: "desc" }, { uf: "asc" }] }),
  ]);
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Encargos sociais</h1>
        {canEdit(role) && <Link className="btn" href="/encargos/novo">Nova tabela</Link>}
      </div>
      {list.length === 0 ? (
        <div className="empty">Nenhuma tabela de encargos cadastrada.</div>
      ) : (
        <table className="list">
          <thead><tr><th>Nome</th><th>Regime</th><th className="num">Horista</th><th className="num">Mensalista</th><th>Fonte</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/encargos/${s.id}`}>{s.name}</Link></td>
                <td>{REGIME_LABEL[s.regime]}</td>
                <td className="num">{pct(s.hourlyPct)}</td>
                <td className="num">{pct(s.monthlyPct)}</td>
                <td className="muted">{s.source ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit(role) && tables.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Criar a partir de uma tabela SINAPI importada</h2>
          <table className="list">
            <thead><tr><th>Tabela</th><th>Regime</th><th className="num">Horista</th><th className="num">Mensalista</th><th></th></tr></thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.id}>
                  <td>SINAPI {t.uf} {refMonth(t.referenceMonth)}</td>
                  <td>{REGIME_LABEL[t.regime]}</td>
                  <td className="num">{pct(Number(t.socialChargesHourly) * 100)}</td>
                  <td className="num">{pct(Number(t.socialChargesMonthly) * 100)}</td>
                  <td className="num">
                    <form action={createSocialChargesFromTable.bind(null, t.id)}>
                      <button className="btn small secondary" type="submit">Criar tabela</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
