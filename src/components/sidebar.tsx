// src/components/sidebar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROLE_LABEL, canManage, type Role } from "@/lib/auth/roles";

const groups: { title: string; items: { href: string; label: string; manager?: boolean; platformAdmin?: boolean }[] }[] = [
  { title: "Orçamentos", items: [
    { href: "/orcamentos", label: "Orçamentos" },
    { href: "/orcamentos/novo", label: "Criar orçamento" },
  ] },
  { title: "Base de preços", items: [
    { href: "/bases", label: "Tabelas importadas" },
    { href: "/bases/importar", label: "Importar SINAPI", platformAdmin: true },
  ] },
  { title: "Base própria", items: [
    { href: "/composicoes-proprias", label: "Composições próprias" },
    { href: "/insumos-proprios", label: "Insumos próprios" },
  ] },
  { title: "Cadastros", items: [
    { href: "/clientes", label: "Clientes" },
    { href: "/bdi", label: "BDI" },
    { href: "/encargos", label: "Encargos sociais" },
  ] },
  { title: "Empresa", items: [
    { href: "/empresa/dados", label: "Dados da empresa" },
    { href: "/empresa/usuarios", label: "Usuários", manager: true },
    { href: "/conta/senha", label: "Minha senha" },
  ] },
];

export function Sidebar({ user, company, role, logout }: {
  user: { name: string; email: string; isPlatformAdmin: boolean }; company: string; role: Role; logout: () => Promise<void>;
}) {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/orcamentos" ? path === href || /^\/orcamentos\/(?!novo)/.test(path)
      : href === "/bases" ? path === href || path.startsWith("/bases/importacoes/")
      : path === href || path.startsWith(href + "/");
  return (
    <nav className="sidebar">
      <Link href="/" className="brand">Orçamento de Obras</Link>
      <div className="company">{company}</div>
      {groups.map((g) => (
        <div key={g.title}>
          <div className="group">{g.title}</div>
          {g.items.filter((it) => (!it.manager || canManage(role)) && (!it.platformAdmin || user.isPlatformAdmin)).map((it) => (
            <Link key={it.href} href={it.href} className={isActive(it.href) ? "active" : undefined}>{it.label}</Link>
          ))}
        </div>
      ))}
      <div className="user">
        <div className="name">{user.name}</div>
        <div className="role">{ROLE_LABEL[role]}{user.isPlatformAdmin ? " · admin. da plataforma" : ""} · {user.email}</div>
        <form action={logout}><button type="submit" className="link">Sair</button></form>
      </div>
    </nav>
  );
}
