// src/app/(app)/composicoes-proprias/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { REGIME_LABEL, brl, dateTimeBR, refMonth } from "@/lib/format";
import { priceOwnComposition, referenceTables } from "@/lib/own-base";
import { OwnCompositionForm } from "@/components/own-composition-form";
import { OwnItemsEditor } from "@/components/own-items-editor";
import { BaseSelect } from "@/components/base-select";

export const dynamic = "force-dynamic";

export default async function OwnCompositionPage(props: PageProps<"/composicoes-proprias/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const { company, role } = await requireAuth();
  const comp = await prisma.ownComposition.findFirst({
    where: { id, companyId: company.id },
    include: {
      services: { select: { budget: { select: { project: { select: { id: true, code: true, name: true } } } } } },
      usedAsChild: { select: { composition: { select: { id: true, code: true, description: true } } } },
    },
  });
  if (!comp) notFound();
  const { tables, current } = await referenceTables(company.id, typeof sp.base === "string" ? sp.base : null);
  const priced = await priceOwnComposition(company.id, id, current?.id ?? null);
  const label = (t: { origin: string; uf: string; referenceMonth: string; regime: string }) => `${t.origin} ${t.uf} ${refMonth(t.referenceMonth)} — ${REGIME_LABEL[t.regime]}`;
  const readOnly = !canEdit(role);
  const projects = [...new Map(comp.services.map((s) => [s.budget.project.id, s.budget.project])).values()];
  const parents = [...new Map(comp.usedAsChild.map((u) => [u.composition.id, u.composition])).values()];
  const cost = priced.cost;
  const missing = priced.items.filter((i) => i.missing).length;

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{comp.code}</span> · {comp.description} <span className="badge">própria</span></h1>
        <Link className="btn secondary" href={`/composicoes-proprias${current ? `?base=${current.id}` : ""}`}>Composições próprias</Link>
      </div>

      {current && <BaseSelect tables={tables.map((t) => ({ id: t.id, label: label(t) }))} current={current.id} />}

      <div className="totals" style={{ marginBottom: 18 }}>
        <div className="box"><div className="label">Custo unitário ({comp.unit})</div><div className="value">{cost ? (cost.incomplete ? <span className="badge danger">sem custo</span> : brl(cost.unitCost.toFixed(2))) : "—"}</div></div>
        <div className="box"><div className="label">Material · mão de obra</div><div className="value" style={{ fontSize: 16 }}>{cost ? `${brl(cost.breakdown.material.toFixed(2))} · ${brl(cost.breakdown.labor.toFixed(2))}` : "—"}</div></div>
        <div className="box"><div className="label">Equipamento · serviço</div><div className="value" style={{ fontSize: 16 }}>{cost ? `${brl(cost.breakdown.equipment.toFixed(2))} · ${brl(cost.breakdown.service.toFixed(2))}` : "—"}</div></div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Itens <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· preços de {current ? label(current) : "nenhuma base importada"}</span></h2>
        {missing > 0 && <div className="form-error">{missing} item(ns) oficial(is) não existe(m) nesta base: a composição fica “sem custo” nos orçamentos desta base até que sejam trocados.</div>}
        <OwnItemsEditor compositionId={comp.id} tableId={current?.id ?? null} tableLabel={current ? label(current) : "—"} readOnly={readOnly}
          items={priced.items.map((i) => ({
            id: i.id, type: i.type, code: i.code, description: i.description, unit: i.unit, coefficient: i.coefficient,
            unitPrice: i.unitPrice?.toFixed(2) ?? null, cost: i.cost?.toFixed(2) ?? null, missing: i.missing, href: i.href,
          }))} />
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Custo do item = TRUNC(coeficiente × preço, 2); custo da composição = soma dos itens (regra do SINAPI).</p>
      </div>

      {(projects.length > 0 || parents.length > 0) && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Onde é usada</h2>
          {projects.length > 0 && <p style={{ marginTop: 0 }}>Orçamentos: {projects.map((p, i) => <span key={p.id}>{i > 0 && ", "}<Link href={`/orcamentos/${p.id}`}>{p.code} · {p.name}</Link></span>)}</p>}
          {parents.length > 0 && <p>Dentro de: {parents.map((p, i) => <span key={p.id}>{i > 0 && ", "}<Link href={`/composicoes-proprias/${p.id}`}>{p.code}</Link></span>)}</p>}
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Alterações valem para esses orçamentos no próximo recálculo de cada um.</p>
        </div>
      )}

      <OwnCompositionForm readOnly={readOnly} suggestedCode={comp.code} composition={{
        id: comp.id, code: comp.code, description: comp.description, unit: comp.unit, group: comp.group, justification: comp.justification,
        derivedFrom: comp.derivedFromCode ? `${comp.derivedFromOrigin} ${comp.derivedFromCode}` : null,
      }} />
      <p className="muted" style={{ fontSize: 12.5 }}>Atualizada em {dateTimeBR(comp.updatedAt)}.</p>
    </>
  );
}
