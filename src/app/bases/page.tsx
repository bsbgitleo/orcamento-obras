// src/app/bases/page.tsx
import { prisma } from "@/lib/prisma";
import { REGIME_LABEL, dateTimeBR, pct, refMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PriceTablesPage() {
  const tables = await prisma.priceTable.findMany({
    orderBy: [{ referenceMonth: "desc" }, { uf: "asc" }, { regime: "asc" }],
    include: { _count: { select: { inputs: true, compositions: true } } },
  });
  return (
    <>
      <h1>Tabelas de preço importadas</h1>
      {tables.length === 0 ? (
        <div className="empty">Nenhuma tabela. Importe com <code>npm run sinapi:import -- --ref SINAPI_Referência_AAAA_MM.xlsx --uf DF --regime ALL</code>.</div>
      ) : (
        <table className="list">
          <thead><tr><th>Origem</th><th>UF</th><th>Referência</th><th>Regime</th><th className="num">Insumos</th><th className="num">Composições</th><th className="num">Encargos horista</th><th className="num">Encargos mensalista</th><th>Importada em</th></tr></thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.id}>
                <td>{t.origin}</td><td>{t.uf}</td><td>{refMonth(t.referenceMonth)}</td><td>{REGIME_LABEL[t.regime]}</td>
                <td className="num">{t._count.inputs.toLocaleString("pt-BR")}</td>
                <td className="num">{t._count.compositions.toLocaleString("pt-BR")}</td>
                <td className="num">{t.socialChargesHourly === null ? "—" : pct(Number(t.socialChargesHourly) * 100)}</td>
                <td className="num">{t.socialChargesMonthly === null ? "—" : pct(Number(t.socialChargesMonthly) * 100)}</td>
                <td>{dateTimeBR(t.importedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ marginTop: 14 }}>A importação é feita pela linha de comando por enquanto; o upload pela interface entra em uma próxima etapa.</p>
    </>
  );
}
