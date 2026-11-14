// src/app/(app)/orcamentos/[id]/transporte/page.tsx
// SICRO — momento de transporte: DMT padrão por via, FIT, ajuste por material
// e a etapa "Transportes" gerada (decisões #66–#68).
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { brl } from "@/lib/format";
import { ROAD_LABEL, ROADS } from "@/core/transport";
import { computeBudgetTransport, TRANSPORT_LINE } from "@/lib/pricing/transport";
import { BudgetTabs } from "@/components/budget-tabs";
import { MaterialDmtForm, TransportDefaultsForm } from "@/components/transport-forms";

export const dynamic = "force-dynamic";

const km = (v: string | number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default async function TransportPage(props: PageProps<"/orcamentos/[id]/transporte">) {
  const { id } = await props.params;
  const { company, role } = await requireAuth();
  const project = await prisma.project.findFirst({ where: { id, companyId: company.id }, include: { budgets: { orderBy: { revision: "desc" }, take: 1, include: { priceTable: true } } } });
  if (!project) notFound();
  const b = project.budgets[0];
  const sicro = b.priceTable.origin === "SICRO";
  const t = sicro ? await computeBudgetTransport(prisma, b.id) : null;
  const generated = sicro ? await prisma.wbsNode.findMany({ where: { budgetId: b.id, autoKind: TRANSPORT_LINE }, include: { composition: { select: { code: true } } } }) : [];
  const nodeByCode = new Map(generated.map((g) => [g.composition?.code, g]));
  const readOnly = !canEdit(role);

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{project.code}</span> · {project.name}</h1>
      </div>
      <BudgetTabs projectId={project.id} sicro={sicro} />
      {!t ? <div className="empty">O momento de transporte só existe nas bases do SICRO. Este orçamento usa {b.priceTable.origin}.</div> : (
        <>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Distâncias médias de transporte (DMT)</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Como o DNIT faz: peso de cada material (quantidade do grupo F × quantidade do serviço, inclusive das atividades auxiliares) × DMT
              de cada tipo de via = momento de transporte (t·km). Os momentos são somados por composição de transporte e lançados na etapa
              “Transportes” da planilha, recalculada sozinha a cada mudança. O FIT, quando houver, multiplica só a DMT pavimentada.
            </p>
            <TransportDefaultsForm budgetId={b.id} readOnly={readOnly} data={{ dmtNatural: b.dmtNatural?.toString() ?? null, dmtPrimary: b.dmtPrimary?.toString() ?? null, dmtPaved: b.dmtPaved?.toString() ?? null, fit: b.fit?.toString() ?? null }} />
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Etapa “Transportes” <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {t.configured ? "calculada" : "informe ao menos uma DMT"}</span></h2>
            {t.lines.length === 0 ? <div className="empty">{t.materials.length ? "Sem DMT informada: nenhum momento de transporte." : "Nenhum serviço deste orçamento tem momento de transporte."}</div> : (
              <table className="list">
                <thead><tr><th>Código</th><th>Composição de transporte</th><th>Via</th><th className="num">Momento (t·km)</th><th className="num">Custo unit.</th><th className="num">Custo total</th></tr></thead>
                <tbody>
                  {t.lines.map((l) => {
                    const node = nodeByCode.get(l.code);
                    return (
                      <tr key={l.code}>
                        <td className="mono">{l.code}</td><td>{l.description}</td><td>{ROAD_LABEL[l.road]}</td>
                        <td className="num">{l.moment.toNumber().toLocaleString("pt-BR", { minimumFractionDigits: 4 })}</td>
                        <td className="num">{brl(l.unitCost)}</td><td className="num">{brl(node?.totalCost?.toString() ?? null)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p style={{ marginBottom: 0 }}><Link href={`/orcamentos/${project.id}`}>Ver na planilha</Link></p>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Materiais transportados <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {t.materials.length}</span></h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Para um material que vem de outro lugar (pedreira, jazida, fornecedor), informe a DMT dele; em branco, vale a padrão. Ordem dos campos: leito natural, revestimento primário, pavimentada (km).</p>
            {t.materials.length === 0 ? <div className="empty">Nenhum material com momento de transporte.</div> : (
              <table className="list" style={{ fontSize: 13 }}>
                <thead><tr><th>Código</th><th>Material</th><th className="num">Peso (t)</th><th>DMT efetiva (km)</th><th>Ajuste do material</th></tr></thead>
                <tbody>
                  {t.materials.map((m) => (
                    <tr key={m.code}>
                      <td className="mono">{m.code}</td>
                      <td>{m.description}</td>
                      <td className="num">{m.weight.toDecimalPlaces(4).toNumber().toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{ROADS.filter((r) => m.transportCodes[r]).map((r) => `${r} ${km(m.dmt[r] as number)}`).join(" · ")}</td>
                      <td><MaterialDmtForm budgetId={b.id} code={m.code} data={m.override} readOnly={readOnly} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
