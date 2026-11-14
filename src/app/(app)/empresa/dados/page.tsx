// src/app/(app)/empresa/dados/page.tsx
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canManage } from "@/lib/auth/roles";
import { CompanyForm } from "@/components/export-forms";

export const dynamic = "force-dynamic";

export default async function CompanyDataPage() {
  const { company, role } = await requireAuth();
  const c = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
  return (
    <>
      <h1>Dados da empresa</h1>
      <p className="muted" style={{ marginTop: 0 }}>Aparecem no cabeçalho da proposta comercial e das planilhas exportadas.{!canManage(role) && " Só o gestor pode alterar."}</p>
      <CompanyForm readOnly={!canManage(role)} company={c} />
    </>
  );
}
