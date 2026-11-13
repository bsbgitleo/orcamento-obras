// src/components/sidebar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const groups: { title: string; items: { href: string; label: string }[] }[] = [
  { title: "Orçamentos", items: [
    { href: "/orcamentos", label: "Orçamentos" },
    { href: "/orcamentos/novo", label: "Criar orçamento" },
  ] },
  { title: "Base de preços", items: [
    { href: "/bases", label: "Tabelas importadas" },
  ] },
  { title: "Cadastros", items: [
    { href: "/clientes", label: "Clientes" },
    { href: "/bdi", label: "BDI" },
    { href: "/encargos", label: "Encargos sociais" },
  ] },
];

export function Sidebar() {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/orcamentos" ? path === href || /^\/orcamentos\/(?!novo)/.test(path) : path === href || path.startsWith(href + "/");
  return (
    <nav className="sidebar">
      <Link href="/" className="brand">Orçamento de Obras</Link>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="group">{g.title}</div>
          {g.items.map((it) => (
            <Link key={it.href} href={it.href} className={isActive(it.href) ? "active" : undefined}>{it.label}</Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
