// src/lib/auth/session.ts
// Cookie sessions stored in the database (only the SHA-256 of the token is kept).
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "orc_session";
const SESSION_DAYS = 30;

export interface AuthContext {
  user: { id: string; email: string; name: string; mustChangePassword: boolean; isPlatformAdmin: boolean };
  company: { id: string; name: string };
  role: Role;
  sessionId: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, companyId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, companyId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt,
    // Secure in production; COOKIE_SECURE=false allows http://localhost tests against a production build
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** Current session or null. Cached per request. */
export const getSession = cache(async (): Promise<AuthContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true, company: true },
  });
  if (!s || s.expiresAt < new Date()) return null;
  const membership = await prisma.membership.findUnique({ where: { userId_companyId: { userId: s.userId, companyId: s.companyId } } });
  if (!membership) return null;
  return {
    user: {
      id: s.user.id, email: s.user.email, name: s.user.name,
      mustChangePassword: s.user.mustChangePassword, isPlatformAdmin: s.user.isPlatformAdmin,
    },
    company: { id: s.company.id, name: s.company.name },
    role: membership.role,
    sessionId: s.id,
  };
});
