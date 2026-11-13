// src/app/(app)/empresa/usuarios/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canManage } from "@/lib/auth/roles";
import { UsersAdmin } from "@/components/users-admin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await requireAuth();
  if (!canManage(ctx.role)) redirect("/");
  const members = await prisma.membership.findMany({
    where: { companyId: ctx.company.id },
    include: { user: { select: { id: true, name: true, email: true, mustChangePassword: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <h1>Usuários de {ctx.company.name}</h1>
      <UsersAdmin
        currentUserId={ctx.user.id}
        members={members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role, pending: m.user.mustChangePassword }))}
      />
    </>
  );
}
