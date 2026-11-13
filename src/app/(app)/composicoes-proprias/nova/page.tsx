// src/app/(app)/composicoes-proprias/nova/page.tsx
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { REGIME_LABEL, refMonth } from "@/lib/format";
import { nextSequentialCode, OWN_COMPOSITION_PREFIX } from "@/lib/project-code";
import { referenceTables } from "@/lib/own-base";
import { OwnCompositionForm } from "@/components/own-composition-form";

export const dynamic = "force-dynamic";

export default async function NewOwnCompositionPage(props: PageProps<"/composicoes-proprias/nova">) {
  const sp = await props.searchParams;
  const { company } = await requireAuth();
  const [{ tables, current }, codes] = await Promise.all([
    referenceTables(company.id, typeof sp.base === "string" ? sp.base : null),
    prisma.ownComposition.findMany({ where: { companyId: company.id }, select: { code: true } }),
  ]);
  return (
    <>
      <h1>Nova composição própria</h1>
      <OwnCompositionForm
        composition={null}
        suggestedCode={nextSequentialCode(OWN_COMPOSITION_PREFIX, codes.map((c) => c.code))}
        tables={tables.map((t) => ({ id: t.id, label: `${t.origin} ${t.uf} ${refMonth(t.referenceMonth)} — ${REGIME_LABEL[t.regime]}` }))}
        defaultTableId={current?.id ?? null}
        copyCode={typeof sp.copiar === "string" ? sp.copiar : null}
      />
    </>
  );
}
