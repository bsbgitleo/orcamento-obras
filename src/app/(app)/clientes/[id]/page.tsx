// src/app/clientes/[id]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { ClientForm } from "@/components/client-form";

export const dynamic = "force-dynamic";

export default async function EditClientPage(props: PageProps<"/clientes/[id]">) {
  const { id } = await props.params;
  const { company } = await requireAuth();
  const client = await prisma.client.findFirst({ where: { id, companyId: company.id } });
  if (!client) notFound();
  return (
    <>
      <h1>{client.name}</h1>
      <ClientForm client={client} />
    </>
  );
}
