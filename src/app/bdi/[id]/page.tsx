// src/app/bdi/[id]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BdiForm } from "@/components/bdi-form";

export const dynamic = "force-dynamic";

export default async function EditBdiPage(props: PageProps<"/bdi/[id]">) {
  const { id } = await props.params;
  const b = await prisma.bdiProfile.findUnique({ where: { id } });
  if (!b) notFound();
  const bdi = {
    id: b.id, name: b.name, workType: b.workType, notes: b.notes,
    centralAdministration: b.centralAdministration.toString(), insurance: b.insurance.toString(), risk: b.risk.toString(),
    guarantee: b.guarantee.toString(), financialExpenses: b.financialExpenses.toString(), profit: b.profit.toString(),
    pis: b.pis.toString(), cofins: b.cofins.toString(), iss: b.iss.toString(), cprb: b.cprb.toString(),
  };
  return (
    <>
      <h1>{b.name}</h1>
      <BdiForm bdi={bdi} />
    </>
  );
}
