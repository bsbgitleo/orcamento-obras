// src/components/base-select.tsx
// Reference price table for cost previews (?base=<id> in the URL).
"use client";
import { usePathname, useRouter } from "next/navigation";

export function BaseSelect({ tables, current }: { tables: { id: string; label: string }[]; current: string }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <label className="checkbox" style={{ marginBottom: 12, fontWeight: 400 }}>
      Base de referência:
      <select value={current} onChange={(e) => router.replace(`${path}?base=${e.target.value}`)} style={{ width: "auto" }} aria-label="Base de referência">
        {tables.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </label>
  );
}
