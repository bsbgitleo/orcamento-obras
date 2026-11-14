// src/app/(app)/bases/[id]/encargos/page.tsx
// SICRO: encargos sociais e trabalhistas por profissional (relatório do DNIT) — decisões #40, #70.
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { REGIME_LABEL, refMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

const pctBR = (v: { toString(): string } | string) => `${Number(v.toString()).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

export default async function LaborChargesPage(props: PageProps<"/bases/[id]/encargos">) {
  const { id } = await props.params;
  const { company } = await requireAuth();
  const table = await prisma.priceTable.findFirst({
    where: { id, OR: [{ companyId: null }, { companyId: company.id }] },
    include: { laborCharges: { orderBy: { code: "asc" } } },
  });
  if (!table) notFound();
  const legend = (table.chargeLegend as { groups: Record<string, string>; items: Record<string, string> } | null) ?? { groups: {}, items: {} };
  const itemCodes = Object.keys(legend.items).sort((a, b) => a[0].localeCompare(b[0]) || Number(a.slice(1)) - Number(b.slice(1)));
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Encargos sociais por profissional</h1>
        <Link className="btn secondary" href="/bases">Tabelas importadas</Link>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {table.origin} {table.uf} {refMonth(table.referenceMonth)} — {REGIME_LABEL[table.regime]}. Relatório analítico do DNIT; os percentuais já estão no custo
        horário de cada profissional e valem para os orçamentos nesta base (sem edição).
      </p>
      {table.laborCharges.length === 0 ? (
        <div className="empty">Esta base não tem encargos por profissional{table.origin === "SICRO" ? " (importada sem o Relatório Analítico de Encargos Sociais e Trabalhistas)" : ""}.</div>
      ) : (
        <>
          <table className="list">
            <thead><tr><th>Código</th><th>Profissional</th><th>Und</th>
              {(["A", "B", "C", "D"] as const).map((g) => <th key={g} className="num" title={legend.groups[g]}>{g} · {legend.groups[g] ?? ""}</th>)}
              <th className="num">Total</th></tr></thead>
            <tbody>
              {table.laborCharges.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.code}</td><td>{c.description}</td><td>{c.unit}</td>
                  <td className="num">{pctBR(c.groupA)}</td><td className="num">{pctBR(c.groupB)}</td><td className="num">{pctBR(c.groupC)}</td><td className="num">{pctBR(c.groupD)}</td>
                  <td className="num"><strong>{pctBR(c.total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {itemCodes.length > 0 && (
            <details className="card" style={{ marginTop: 18 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Itens de cada grupo (legenda do DNIT)</summary>
              <ul style={{ columns: 2, marginBottom: 0 }}>{itemCodes.map((k) => <li key={k}><span className="mono">{k}</span> — {legend.items[k]}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </>
  );
}
