// src/app/encargos/[id]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SocialChargesForm } from "@/components/social-charges-form";

export const dynamic = "force-dynamic";

export default async function EditSocialChargesPage(props: PageProps<"/encargos/[id]">) {
  const { id } = await props.params;
  const s = await prisma.socialChargesProfile.findUnique({ where: { id } });
  if (!s) notFound();
  return (
    <>
      <h1>{s.name}</h1>
      <SocialChargesForm item={{ id: s.id, name: s.name, regime: s.regime, hourlyPct: s.hourlyPct.toString(), monthlyPct: s.monthlyPct.toString(), source: s.source }} />
    </>
  );
}
