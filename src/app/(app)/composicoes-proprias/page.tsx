// src/app/(app)/composicoes-proprias/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { REGIME_LABEL, brl, refMonth } from "@/lib/format";
import { calculateCompositionCost, type CompositionCost } from "@/core/composition";
import { ownCompositionKey } from "@/core/own-composition";
import { loadBudgetCatalog } from "@/lib/pricing/budget-catalog";
import { referenceTables } from "@/lib/own-base";
import { BaseSelect } from "@/components/base-select";

export const dynamic = "force-dynamic";

export default async function OwnCompositionsPage(props: PageProps<"/composicoes-proprias">) {
  const sp = await props.searchParams;
  const { company, role } = await requireAuth();
  const { tables, current } = await referenceTables(company.id, typeof sp.base === "string" ? sp.base : null);
  const list = await prisma.ownComposition.findMany({
    where: { companyId: company.id }, orderBy: { code: "asc" },
    include: { _count: { select: { items: true, services: true } } },
  });
  const costs = new Map<string, CompositionCost>();
  if (current && list.length) {
    const { catalog } = await loadBudgetCatalog(prisma, current.id, company.id, { own: list.map((c) => c.id) });
    const cache = new Map<string, CompositionCost>();
    for (const c of list) costs.set(c.id, calculateCompositionCost(ownCompositionKey(c.id), catalog, cache));
  }
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Composições próprias</h1>
        {canEdit(role) && <Link className="btn" href="/composicoes-proprias/nova">Nova composição</Link>}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Os itens oficiais ficam guardados pelo código e são precificados na base de cada orçamento (UF, mês e regime).
        O custo abaixo é o da base de referência escolhida.
      </p>
      {current && <BaseSelect tables={tables.map((t) => ({ id: t.id, label: `${t.origin} ${t.uf} ${refMonth(t.referenceMonth)} — ${REGIME_LABEL[t.regime]}` }))} current={current.id} />}
      {list.length === 0 ? (
        <div className="empty">Nenhuma composição própria. Crie do zero ou a partir de uma composição do SINAPI.</div>
      ) : (
        <table className="list">
          <thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Origem</th><th className="num">Itens</th><th className="num">Custo unit.</th><th className="num">Em orçamentos</th></tr></thead>
          <tbody>
            {list.map((c) => {
              const cost = costs.get(c.id);
              return (
                <tr key={c.id}>
                  <td className="mono"><Link href={`/composicoes-proprias/${c.id}${current ? `?base=${current.id}` : ""}`}>{c.code}</Link></td>
                  <td>{c.description}{c.group && <span className="muted" style={{ fontSize: 12 }}> · {c.group}</span>}</td>
                  <td>{c.unit}</td>
                  <td>{c.derivedFromCode ? `${c.derivedFromOrigin} ${c.derivedFromCode}` : "—"}</td>
                  <td className="num">{c._count.items}</td>
                  <td className="num">{!cost ? "—" : cost.incomplete ? <span className="badge danger">sem custo</span> : brl(cost.unitCost.toFixed(2))}</td>
                  <td className="num">{c._count.services}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
