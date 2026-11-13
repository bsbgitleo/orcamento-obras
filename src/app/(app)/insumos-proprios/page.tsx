// src/app/(app)/insumos-proprios/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { INPUT_KIND_LABEL, brl, dateBR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OwnInputsPage() {
  const { company, role } = await requireAuth();
  const list = await prisma.ownInput.findMany({
    where: { companyId: company.id }, orderBy: { code: "asc" },
    include: { _count: { select: { usages: true } } },
  });
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Insumos próprios</h1>
        {canEdit(role) && <Link className="btn" href="/insumos-proprios/novo">Novo insumo</Link>}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Materiais, serviços e equipamentos que não estão no SINAPI, com o preço cotado, a data e a fonte. Entram nas composições próprias pelo preço informado aqui.</p>
      {list.length === 0 ? (
        <div className="empty">Nenhum insumo próprio cadastrado.</div>
      ) : (
        <table className="list">
          <thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Tipo</th><th className="num">Preço</th><th>Data</th><th>Fonte</th><th className="num">Em composições</th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td className="mono"><Link href={`/insumos-proprios/${i.id}`}>{i.code}</Link></td>
                <td>{i.description}</td>
                <td>{i.unit}</td>
                <td>{INPUT_KIND_LABEL[i.kind]}</td>
                <td className="num">{brl(i.unitPrice)}</td>
                <td>{dateBR(i.priceDate.toISOString().slice(0, 10) + "T12:00:00")}</td>
                <td>{i.source}</td>
                <td className="num">{i._count.usages}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
