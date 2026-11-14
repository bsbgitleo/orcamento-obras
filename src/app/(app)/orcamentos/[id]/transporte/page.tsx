// src/app/(app)/orcamentos/[id]/transporte/page.tsx
// SICRO — momento de transporte: DMT padrão por via, FIT (Volume 05, 2025),
// ajuste por material e a etapa "Transportes" gerada (decisões #66–#68, #71–#74).
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { brl } from "@/lib/format";
import { ROAD_LABEL, ROADS } from "@/core/transport";
import { computeBudgetTransport, TRANSPORT_LINE } from "@/lib/pricing/transport";
import { BudgetTabs } from "@/components/budget-tabs";
import { FitForm, MaterialDmtForm, RemoveSegmentButton, TrafficSegmentForm, TransportDefaultsForm } from "@/components/transport-forms";

export const dynamic = "force-dynamic";

const km = (v: string | number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fit4 = (v: string) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const FIT_REASON: Record<string, string> = { "sem-dmt": "sem DMT pavimentada", "acima-100km": "DMT pavimentada acima de 100 km", "sem-atraso": "sem atraso" };

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
              “Transportes” da planilha, recalculada sozinha a cada mudança. A DMT pavimentada é a soma da rodovia rural com a via urbana,
              multiplicada pelo FIT do material.
            </p>
            <TransportDefaultsForm budgetId={b.id} readOnly={readOnly} data={{ dmtNatural: b.dmtNatural?.toString() ?? null, dmtPrimary: b.dmtPrimary?.toString() ?? null, dmtPaved: b.dmtPaved?.toString() ?? null, dmtUrban: b.dmtUrban?.toString() ?? null }} />
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Fator de Interferência de Tráfego (FIT)</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Pelo Manual de Custos do DNIT, Volume 05, 2ª edição (2025): FIT = 1 + (A1 + A2) ÷ (DMT pavimentada × 60), por material. A1 = 70 + 0,0035 × VMD
              por faixa (s), só com PARE e SIGA e para o material que passa pela obra; A2 = 60 s por km em via urbana (30 km/h contra 60 km/h). Só em vias
              pavimentadas; sem FIT acima de 100 km. FIT com 4 casas.
            </p>
            <FitForm budgetId={b.id} readOnly={readOnly} data={{ mode: t.fit.mode, manual: b.fit?.toString() ?? null, stopGo: t.fit.stopGo, urbanSpeed: b.urbanSpeed?.toString() ?? null, source: t.fit.source, stopGoInBudget: t.fit.stopGoInBudget }} />
            {t.fit.mode === "CALCULATED" && (
              <>
                <h3 style={{ marginBottom: 6 }}>VMD por faixa do segmento da obra <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {t.fit.vmd ? `média ponderada ${Number(t.fit.vmd).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} veículos/dia` : "não informado"}</span></h3>
                <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Com mais de um segmento, o app pondera pela extensão (Equação 1). O VMD só entra no atraso do PARE e SIGA.</p>
                {t.fit.segments.length > 0 && (
                  <table className="list" style={{ fontSize: 13, marginBottom: 8 }}>
                    <thead><tr><th>Segmento</th><th className="num">Extensão (km)</th><th className="num">VMD por faixa</th>{!readOnly && <th />}</tr></thead>
                    <tbody>
                      {t.fit.segments.map((g) => (
                        <tr key={g.id}>
                          <td>{g.description ?? "—"}</td><td className="num">{km(g.lengthKm)}</td>
                          <td className="num">{Number(g.vmdPerLane).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                          {!readOnly && <td style={{ textAlign: "right" }}><RemoveSegmentButton budgetId={b.id} segmentId={g.id} /></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!readOnly && <TrafficSegmentForm budgetId={b.id} />}
              </>
            )}
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
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Para um material que vem de outro lugar (pedreira, jazida, fornecedor), informe a DMT dele; em branco, vale a padrão. Ordem dos campos:
              leito natural, revestimento primário, pavimentada rural, pavimentada urbana (km). Desmarque “passa pela obra” quando o transporte não
              atravessa a extensão da obra, e “FIT” para não aplicar o fator ao material.
            </p>
            {t.materials.length === 0 ? <div className="empty">Nenhum material com momento de transporte.</div> : (
              <table className="list" style={{ fontSize: 13 }}>
                <thead><tr><th>Código</th><th>Material</th><th className="num">Peso (t)</th><th>DMT efetiva (km)</th><th className="num">FIT</th><th className="num">Pav. com FIT (km)</th><th>Ajuste do material</th></tr></thead>
                <tbody>
                  {t.materials.map((m) => {
                    const roads = ROADS.filter((r) => m.transportCodes[r] && r !== "P").map((r) => `${r} ${km(m.dmt[r] as number)}`);
                    if (m.transportCodes.P) roads.push(`P ${km(m.dmtRural)}${m.dmtUrban ? ` + urb. ${km(m.dmtUrban)}` : ""}`);
                    const paved = Number(m.dmt.P) * Number(m.fit.value);
                    const why = m.fit.reason ? FIT_REASON[m.fit.reason] : !m.applyFit && t.fit.mode === "CALCULATED" ? "não aplicado" : null;
                    return (
                      <tr key={m.code}>
                        <td className="mono">{m.code}</td>
                        <td>{m.description}</td>
                        <td className="num">{m.weight.toDecimalPlaces(4).toNumber().toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{roads.join(" · ")}</td>
                        <td className="num" title={t.fit.mode === "CALCULATED" ? `A1 = ${m.fit.a1} s · A2 = ${m.fit.a2} s` : "FIT informado"}>
                          {fit4(m.fit.value)}{why && <div className="muted" style={{ fontSize: 11 }}>{why}</div>}
                        </td>
                        <td className="num">{m.transportCodes.P ? km(paved.toFixed(3)) : "—"}</td>
                        <td><MaterialDmtForm budgetId={b.id} code={m.code} data={m.override} readOnly={readOnly} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
