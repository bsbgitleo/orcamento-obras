// src/lib/auth/roles.ts
// Pure role rules (no server imports, so they can be unit-tested and used in client components).
export type Role = "MANAGER" | "ESTIMATOR" | "VIEWER";

export const ROLE_LABEL: Record<Role, string> = {
  MANAGER: "Gestor",
  ESTIMATOR: "Orçamentista",
  VIEWER: "Leitura",
};

/** Cria/edita cadastros e orçamentos. */
export const canEdit = (role: Role): boolean => role === "MANAGER" || role === "ESTIMATOR";
/** Aprova orçamentos e administra a empresa e os usuários. */
export const canManage = (role: Role): boolean => role === "MANAGER";
