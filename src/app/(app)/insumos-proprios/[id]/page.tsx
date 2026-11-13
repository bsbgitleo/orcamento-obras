// src/app/(app)/insumos-proprios/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { OwnInputForm } from "@/components/own-input-form";

export const dynamic = "force-dynamic";

export default async function EditOwnInputPage(props: PageProps<"/insumos-proprios/[id]">) {
  const { id } = await props.params;
  const { company, role } = await requireAuth();
  const input = await prisma.ownInput.findFirst({
    where: { id, companyId: company.id },
    include: { usages: { select: { composition: { select: { id: true, code: true, description: true } } }, distinct: ["compositionId"] } },
  });
  if (!input) notFound();
  return (
    <>
      <h1><span className="mono muted">{input.code}</span> · {input.description}</h1>
      <OwnInputForm readOnly={!canEdit(role)} suggestedCode={input.code} input={{
        id: input.id, code: input.code, description: input.description, unit: input.unit, kind: input.kind,
        unitPrice: input.unitPrice.toFixed(2), priceDate: input.priceDate.toISOString().slice(0, 10), source: input.source, notes: input.notes,
      }} />
      {input.usages.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Usado nas composições</h2>
          <ul style={{ margin: 0 }}>
            {input.usages.map((u) => <li key={u.composition.id}><Link href={`/composicoes-proprias/${u.composition.id}`}><span className="mono">{u.composition.code}</span> · {u.composition.description}</Link></li>)}
          </ul>
          <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>Mudar o preço aqui muda o custo dessas composições; os orçamentos passam a usar o preço novo no próximo recálculo.</p>
        </div>
      )}
    </>
  );
}
