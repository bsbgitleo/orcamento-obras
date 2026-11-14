// src/app/(print)/layout.tsx
// Pages meant to be printed / saved as PDF (no sidebar). Requires a session.
import { requireAuth } from "@/lib/auth/require";
import "./print.css";

export const dynamic = "force-dynamic";

export default async function PrintLayout({ children }: LayoutProps<"/">) {
  await requireAuth();
  return <div className="print-root">{children}</div>;
}
