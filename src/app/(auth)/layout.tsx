// src/app/(auth)/layout.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getSession()) redirect("/");
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ fontWeight: 700, fontSize: 18, marginBottom: 18 }}>Orçamento de Obras</div>
        {children}
      </div>
    </div>
  );
}
