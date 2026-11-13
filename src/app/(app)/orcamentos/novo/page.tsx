// src/app/orcamentos/novo/page.tsx
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { NewBudgetWizard } from "@/components/new-budget-wizard";
import { nextProjectCode } from "@/lib/project-code";

export const dynamic = "force-dynamic";

// Decision #14: "sem desoneração" is the default regime.
const REGIME_ORDER: Record<string, number> = { NAO_DESONERADO: 0, DESONERADO: 1, SEM_ENCARGOS: 2 };

export default async function NewBudgetPage() {
  const { company } = await requireAuth();
  const companyId = company.id;
  const [clients, bdis, charges, tables, codes] = await Promise.all([
    prisma.client.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.bdiProfile.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.socialChargesProfile.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.priceTable.findMany({ where: { OR: [{ companyId: null }, { companyId }] }, orderBy: [{ referenceMonth: "desc" }, { uf: "asc" }], include: { _count: { select: { compositions: true } } } }),
    prisma.project.findMany({ where: { companyId }, select: { code: true } }),
  ]);
  return (
    <>
      <h1>Criar orçamento</h1>
      <NewBudgetWizard options={{
        clients,
        bdis: bdis.map((b) => ({ id: b.id, name: b.name, percent: b.percent.toString(), workType: b.workType })),
        charges: charges.map((c) => ({ id: c.id, name: c.name, regime: c.regime, hourlyPct: c.hourlyPct.toString(), monthlyPct: c.monthlyPct.toString() })),
        tables: tables
          .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth) || a.uf.localeCompare(b.uf) || REGIME_ORDER[a.regime] - REGIME_ORDER[b.regime])
          .map((t) => ({ id: t.id, origin: t.origin, uf: t.uf, referenceMonth: t.referenceMonth, regime: t.regime, compositions: t._count.compositions })),
        nextCode: nextProjectCode(codes.map((c) => c.code)),
      }} />
    </>
  );
}
