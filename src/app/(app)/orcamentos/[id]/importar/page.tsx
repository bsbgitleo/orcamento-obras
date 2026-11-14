// src/app/(app)/orcamentos/[id]/importar/page.tsx
// Importação da EAP a partir de uma planilha .xlsx — só em orçamento novo (decisão #62).
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { REGIME_LABEL, pct, refMonth } from "@/lib/format";
import { SheetImport } from "@/components/sheet-import";

export const dynamic = "force-dynamic";

export default async function ImportSheetPage(props: PageProps<"/orcamentos/[id]/importar">) {
  const { id } = await props.params;
  const { company, role } = await requireAuth();
  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id },
    include: { budgets: { orderBy: { revision: "desc" }, take: 1, include: { priceTable: true, bdi: true, _count: { select: { nodes: true } } } } },
  });
  if (!project) notFound();
  const b = project.budgets[0];
  const baseLabel = `${b.priceTable.origin} ${b.priceTable.uf} ${refMonth(b.priceTable.referenceMonth)} — ${REGIME_LABEL[b.priceTable.regime]}`;
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{project.code}</span> · Importar planilha</h1>
      </div>
      {!canEdit(role) ? <div className="empty">Seu perfil é somente leitura.</div>
        : b._count.nodes > 0 ? (
          <div className="empty">Este orçamento já tem itens. A importação de planilha só é feita em orçamento novo. <Link href="/orcamentos/novo">Criar orçamento</Link></div>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Base {baseLabel} · BDI {pct(b.bdi.percent)}. Serviços com código desta base (ou de uma composição própria) são vinculados à composição;
              os demais, com preço, viram composição própria com esse preço; sem preço, entram “sem custo”.
            </p>
            <SheetImport budgetId={b.id} projectId={project.id} bdiPercent={b.bdi.percent.toString()} baseOrigin={b.priceTable.origin} baseLabel={baseLabel} />
          </>
        )}
    </>
  );
}
