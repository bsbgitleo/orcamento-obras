// src/app/clientes/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { projects: true } } } });
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Clientes</h1>
        <Link className="btn" href="/clientes/novo">Novo cliente</Link>
      </div>
      {clients.length === 0 ? (
        <div className="empty">Nenhum cliente cadastrado.</div>
      ) : (
        <table className="list">
          <thead><tr><th>Nome</th><th>CNPJ/CPF</th><th>E-mail</th><th>Telefone</th><th className="num">Orçamentos</th></tr></thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/clientes/${c.id}`}>{c.name}</Link></td>
                <td className="mono">{c.document ?? "—"}</td>
                <td>{c.email ?? "—"}</td>
                <td>{c.phone ?? "—"}</td>
                <td className="num">{c._count.projects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
