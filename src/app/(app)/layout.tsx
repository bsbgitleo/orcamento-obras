// src/app/(app)/layout.tsx
// Authenticated area: requires a session; redirects to /login otherwise.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { requireAuth } from "@/lib/auth/require";
import { logout } from "@/lib/actions/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireAuth();
  // Invited users must set their own password before using the app
  const path = (await headers()).get("x-pathname") ?? "";
  if (ctx.user.mustChangePassword && !path.startsWith("/conta/senha")) redirect("/conta/senha");
  return (
    <div className="shell">
      <Sidebar user={{ name: ctx.user.name, email: ctx.user.email, isPlatformAdmin: ctx.user.isPlatformAdmin }} company={ctx.company.name} role={ctx.role} logout={logout} />
      <main className="main">{children}</main>
    </div>
  );
}
