// src/app/(app)/orcamentos/[id]/especificacoes/page.tsx
// Especificação técnica, critério de medição e exigência de marca por serviço
// (vão para a planilha das proponentes — decisão #60) e especificação mínima de
// materiais (decisão #82).
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { BudgetTabs } from "@/components/budget-tabs";
import { isSicroProject } from "@/lib/budget-origin";
import { ServiceSpecForm } from "@/components/export-forms";
import { loadMemoryData } from "@/lib/pricing/memory-data";
import { MaterialSpecForm, MaterialSpecTools, NoteForm } from "@/components/calc-memory";

export const dynamic = "force-dynamic";

export default async function SpecsPage(props: PageProps<"/orcamentos/[id]/especificacoes">) {
  const { id } = await props.params;
  const { company, role } = await requireAuth();
  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id },
    include: { budgets: { orderBy: { revision: "desc" }, take: 1, include: { nodes: true } } },
  });
  if (!project) notFound();
  const nodes = project.budgets[0].nodes;
  const byParent = new Map<string | null, typeof nodes>();
  for (const n of nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
  const ordered: typeof nodes = [];
  const walk = (p: string | null) => { for (const n of (byParent.get(p) ?? []).sort((a, b) => a.position - b.position)) { ordered.push(n); if (n.kind === "STAGE") walk(n.id); } };
  walk(null);
  const mem = await loadMemoryData(prisma, project.budgets[0].id);
  const serviceOptions = mem.tree.filter((t) => !t.auto).map((t) => ({ id: t.id, code: t.code, description: t.description, stage: t.stage, level: t.level }));
  const readOnly = !canEdit(role);

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{project.code}</span> · {project.name}</h1>
      </div>
      <BudgetTabs projectId={project.id} sicro={await isSicroProject(project.id)} />
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Especificações dos serviços</h2>
        <p className="muted" style={{ marginTop: 0 }}>Integram a planilha para proponentes: o que deve ser feito, com quais materiais, como será medido e aceito. Marque “Exige marca/produto” para a proponente informar o que oferta.</p>
        {ordered.length === 0 ? <div className="empty">A planilha está vazia.</div> : (
          <table className="list">
            <tbody>
              {ordered.map((n) => n.kind === "STAGE" ? (
                <tr key={n.id} style={{ background: "#f4f6f8" }}><td className="mono" style={{ width: 70 }}><strong>{n.code}</strong></td><td colSpan={2}><strong>{n.description}</strong></td></tr>
              ) : (
                <tr key={n.id}>
                  <td className="mono" style={{ width: 70 }}>{n.code}</td>
                  <td style={{ width: "28%" }}>{n.description}<div className="muted" style={{ fontSize: 12 }}>{n.quantity?.toString().replace(".", ",")} {n.unit}</div></td>
                  <td><ServiceSpecForm nodeId={n.id} readOnly={!canEdit(role)} data={{ specification: n.specification, measurementCriteria: n.measurementCriteria, requiresBrand: n.requiresBrand }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Especificação mínima de materiais</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Material, especificação mínima, referências comerciais (ou equivalente técnico), normas e os itens da planilha que o usam.
          Vai para a planilha das proponentes e para a planilha orçamentária em Excel.
        </p>
        <NoteForm projectId={project.id} field="materialsNote" value={mem.materialsNote} readOnly={readOnly} label="Aviso no alto da especificação"
          placeholder="Referências comerciais são indicativas; produto equivalente só será aceito com ficha técnica e aprovação da fiscalização." />
        {mem.materials.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="list" style={{ fontSize: 13 }}>
              <thead><tr><th>Material</th><th>Especificação mínima</th><th>Referências comerciais</th><th>Normas</th><th>Itens da planilha</th>{!readOnly && <th />}</tr></thead>
              <tbody>
                {mem.materials.map((m, k) => (
                  <tr key={m.id}>
                    <td><strong>{m.material}</strong></td><td>{m.specification ?? "—"}</td><td>{m.references ?? "—"}</td><td>{m.standards ?? "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{m.items || <span className="muted">nenhum</span>}</td>
                    {!readOnly && <td style={{ whiteSpace: "nowrap" }}><MaterialSpecTools projectId={project.id} spec={m} services={serviceOptions} first={k === 0} last={k === mem.materials.length - 1} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!readOnly && <div style={{ marginTop: 12 }}><h3 style={{ margin: "0 0 6px" }}>Incluir material</h3><MaterialSpecForm projectId={project.id} spec={null} services={serviceOptions} /></div>}
      </div>
    </>
  );
}
