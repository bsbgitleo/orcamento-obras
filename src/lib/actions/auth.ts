// src/lib/actions/auth.ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseForm, type ActionState } from "@/lib/forms";
import { generateInitialPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { requireActionAuth, requireManager } from "@/lib/auth/require";
import { changePasswordSchema, inviteSchema, loginSchema, registerSchema, roleSchema } from "@/lib/schemas/auth";

/** Cadastro da empresa + primeiro usuário (gestor). */
export async function register(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = parseForm(registerSchema, fd);
  if (!r.ok) return r.state;
  const d = r.data;
  const existing = await prisma.user.findUnique({ where: { email: d.email } });
  if (existing) return { status: "error", message: "Já existe uma conta com este e-mail. Entre com sua senha.", fieldErrors: { email: "E-mail já cadastrado" }, values: r.values };

  const passwordHash = await hashPassword(d.password);
  const company = await prisma.company.create({
    data: {
      name: d.companyName, document: d.companyDocument,
      memberships: { create: { role: "MANAGER", user: { create: { email: d.email, name: d.name, passwordHash } } } },
    },
    include: { memberships: true },
  });
  await createSession(company.memberships[0].userId, company.id);
  redirect("/");
}

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = parseForm(loginSchema, fd);
  if (!r.ok) return r.state;
  const user = await prisma.user.findUnique({ where: { email: r.data.email }, include: { memberships: { orderBy: { createdAt: "asc" } } } });
  const ok = user ? await verifyPassword(r.data.password, user.passwordHash) : false;
  if (!user || !ok) return { status: "error", message: "E-mail ou senha incorretos.", values: { email: r.values.email } };
  const membership = user.memberships[0];
  if (!membership) return { status: "error", message: "Usuário sem empresa vinculada.", values: { email: r.values.email } };
  await createSession(user.id, membership.companyId);
  redirect(user.mustChangePassword ? "/conta/senha" : "/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireActionAuth();
  const r = parseForm(changePasswordSchema, fd);
  if (!r.ok) return r.state;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!(await verifyPassword(r.data.currentPassword, user.passwordHash))) {
    return { status: "error", message: "Senha atual incorreta.", fieldErrors: { currentPassword: "Incorreta" } };
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(r.data.password), mustChangePassword: false } });
  revalidatePath("/", "layout");
  return { status: "ok", message: "Senha alterada." };
}

// ─── Usuários da empresa (gestor) ───

export type InviteResult = ActionState | { status: "invited"; email: string; initialPassword: string };

/** Cria o usuário com senha inicial (exibida uma vez) ou vincula um usuário existente à empresa. */
export async function inviteUser(_prev: InviteResult, fd: FormData): Promise<InviteResult> {
  const ctx = await requireManager();
  const r = parseForm(inviteSchema, fd);
  if (!r.ok) return r.state;
  const d = r.data;
  const existing = await prisma.user.findUnique({ where: { email: d.email }, include: { memberships: { where: { companyId: ctx.company.id } } } });
  if (existing) {
    if (existing.memberships.length) return { status: "error", message: "Este usuário já faz parte da empresa.", fieldErrors: { email: "Já cadastrado" }, values: r.values };
    await prisma.membership.create({ data: { userId: existing.id, companyId: ctx.company.id, role: d.role } });
    revalidatePath("/empresa/usuarios");
    return { status: "ok", message: `${existing.email} vinculado à empresa com a senha que já possui.` };
  }
  const initialPassword = generateInitialPassword();
  await prisma.user.create({
    data: {
      email: d.email, name: d.name, passwordHash: await hashPassword(initialPassword), mustChangePassword: true,
      memberships: { create: { companyId: ctx.company.id, role: d.role } },
    },
  });
  revalidatePath("/empresa/usuarios");
  return { status: "invited", email: d.email, initialPassword };
}

export async function updateUserRole(userId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireManager();
  const r = parseForm(roleSchema, fd);
  if (!r.ok) return r.state;
  if (userId === ctx.user.id && r.data.role !== "MANAGER") {
    const others = await prisma.membership.count({ where: { companyId: ctx.company.id, role: "MANAGER", NOT: { userId } } });
    if (others === 0) return { status: "error", message: "A empresa precisa de pelo menos um gestor." };
  }
  await prisma.membership.update({ where: { userId_companyId: { userId, companyId: ctx.company.id } }, data: { role: r.data.role } });
  revalidatePath("/empresa/usuarios");
  return { status: "ok" };
}

export async function removeUser(userId: string): Promise<void> {
  const ctx = await requireManager();
  if (userId === ctx.user.id) throw new Error("Você não pode remover a si mesmo.");
  await prisma.$transaction([
    prisma.membership.delete({ where: { userId_companyId: { userId, companyId: ctx.company.id } } }),
    prisma.session.deleteMany({ where: { userId, companyId: ctx.company.id } }),
  ]);
  revalidatePath("/empresa/usuarios");
}

export async function resetUserPassword(userId: string): Promise<{ initialPassword: string }> {
  const ctx = await requireManager();
  const m = await prisma.membership.findUnique({ where: { userId_companyId: { userId, companyId: ctx.company.id } } });
  if (!m) throw new Error("Usuário não pertence à empresa.");
  const initialPassword = generateInitialPassword();
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(initialPassword), mustChangePassword: true } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  return { initialPassword };
}
