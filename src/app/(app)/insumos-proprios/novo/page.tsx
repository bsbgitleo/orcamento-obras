// src/app/(app)/insumos-proprios/novo/page.tsx
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { nextSequentialCode, OWN_INPUT_PREFIX } from "@/lib/project-code";
import { OwnInputForm } from "@/components/own-input-form";

export const dynamic = "force-dynamic";

export default async function NewOwnInputPage() {
  const { company } = await requireAuth();
  const codes = await prisma.ownInput.findMany({ where: { companyId: company.id }, select: { code: true } });
  return (
    <>
      <h1>Novo insumo próprio</h1>
      <OwnInputForm input={null} suggestedCode={nextSequentialCode(OWN_INPUT_PREFIX, codes.map((c) => c.code))} />
    </>
  );
}
