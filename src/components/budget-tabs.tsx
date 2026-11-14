// src/components/budget-tabs.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BudgetTabs({ projectId }: { projectId: string }) {
  const path = usePathname();
  const base = `/orcamentos/${projectId}`;
  const tabs = [
    { href: base, label: "Planilha" },
    { href: `${base}/curva-abc`, label: "Curva ABC" },
    { href: `${base}/cronograma`, label: "Cronograma" },
    { href: `${base}/especificacoes`, label: "Especificações" },
    { href: `${base}/exportar`, label: "Exportar" },
  ];
  return (
    <nav className="tabs">
      {tabs.map((t) => <Link key={t.href} href={t.href} className={path === t.href ? "active" : undefined}>{t.label}</Link>)}
    </nav>
  );
}
