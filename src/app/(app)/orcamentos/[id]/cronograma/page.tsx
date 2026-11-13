// src/app/orcamentos/[id]/cronograma/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit } from "@/lib/auth/roles";
import { BudgetTabs } from "@/components/budget-tabs";
import { ScheduleEditor } from "@/components/schedule-editor";

export const dynamic = "force-dynamic";

export default async function SchedulePage(props: PageProps<"/orcamentos/[id]/cronograma">) {
  const { id } = await props.params;
  const { company, role } = await requireAuth();
  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id },
    include: { budgets: { orderBy: { revision: "desc" }, take: 1, include: { schedule: true, nodes: { where: { kind: "STAGE" }, orderBy: { position: "asc" } } } } },
  });
  if (!project) notFound();
  const budget = project.budgets[0];
  // Stages in display order (pre-order by parentId + position), with level
  const byParent = new Map<string | null, typeof budget.nodes>();
  for (const n of budget.nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
  const stages: { id: string; parentId: string | null; level: number; code: string; description: string; totalPrice: string }[] = [];
  const walk = (parentId: string | null, level: number) => {
    for (const n of (byParent.get(parentId) ?? []).sort((a, b) => a.position - b.position)) {
      stages.push({ id: n.id, parentId: n.parentId, level, code: n.code, description: n.description, totalPrice: n.totalPrice?.toString() ?? "0" });
      walk(n.id, level + 1);
    }
  };
  walk(null, 1);
  const cells = budget.schedule.map((s) => ({ nodeId: s.nodeId, month: s.month, percent: s.percent.toString() }));

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{project.code}</span> · {project.name}</h1>
      </div>
      <BudgetTabs projectId={project.id} />
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Cronograma físico-financeiro</h2>
        {stages.length === 0
          ? <div className="empty">Adicione etapas na planilha para montar o cronograma.</div>
          : <ScheduleEditor budgetId={budget.id} stages={stages} initialMonths={budget.scheduleMonths} initialCells={cells} readOnly={!canEdit(role)} />}
      </div>
    </>
  );
}
