// src/lib/auth/require.ts
// Guards for pages and server actions.
import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { getSession, type AuthContext } from "./session";
import { canEdit, canManage } from "./roles";

export class ForbiddenError extends Error {
  constructor(message = "Sem permissão para esta ação.") { super(message); }
}

/** Pages: redirects to /login when not signed in. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getSession();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Server actions: throws instead of redirecting (the client shows the message). */
export async function requireActionAuth(): Promise<AuthContext> {
  const ctx = await getSession();
  if (!ctx) throw new ForbiddenError("Sessão expirada. Entre novamente.");
  return ctx;
}

/** Orçamentista ou gestor. */
export async function requireEditor(): Promise<AuthContext> {
  const ctx = await requireActionAuth();
  if (!canEdit(ctx.role)) throw new ForbiddenError("Seu perfil é somente leitura.");
  return ctx;
}

/** Gestor. */
export async function requireManager(): Promise<AuthContext> {
  const ctx = await requireActionAuth();
  if (!canManage(ctx.role)) throw new ForbiddenError("Apenas gestores podem fazer isso.");
  return ctx;
}

export type { Role };
