// src/app/orcamentos/[id]/cronograma/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BudgetTabs } from "@/components/budget-tabs";
import { ScheduleEditor } from "@/components/schedule-editor";

export const dynamic = "force-dynamic";

export default async function SchedulePage(props: PageProps<"/orcamentos/[id]/cronograma">) {
  const { id } = await props.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { budgets: { orderBy: { revision: "desc" }, take: 1, include: { schedule: true, nodes: { where: { parentId: null, kind: "STAGE" }, orderBy: { position: "asc" } } } } },
  });
  if (!project) notFound();
  const budget = project.budgets[0];
  const stages = budget.nodes.map((n) => ({ id: n.id, code: n.code, description: n.description, totalPrice: n.totalPrice?.toString() ?? "0" }));
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
          : <ScheduleEditor budgetId={budget.id} stages={stages} initialMonths={budget.scheduleMonths} initialCells={cells} />}
      </div>
    </>
  );
}
