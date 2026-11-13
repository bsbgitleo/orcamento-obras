// src/app/(app)/conta/senha/page.tsx
import { requireAuth } from "@/lib/auth/require";
import { ChangePasswordForm } from "@/components/auth-forms";

export default async function PasswordPage() {
  const ctx = await requireAuth();
  return (
    <>
      <h1>Minha senha</h1>
      <ChangePasswordForm forced={ctx.user.mustChangePassword} />
    </>
  );
}
