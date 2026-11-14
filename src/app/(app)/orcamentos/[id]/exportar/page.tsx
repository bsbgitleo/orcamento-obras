// src/app/(app)/orcamentos/[id]/exportar/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/require";
import { canEdit, canManage } from "@/lib/auth/roles";
import { BudgetTabs } from "@/components/budget-tabs";
import { isSicroProject } from "@/lib/budget-origin";
import { BidderForm, ProposalForm } from "@/components/export-forms";

export const dynamic = "force-dynamic";

export default async function ExportPage(props: PageProps<"/orcamentos/[id]/exportar">) {
  const { id } = await props.params;
  const { company, role } = await requireAuth();
  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id },
    include: { company: true, budgets: { orderBy: { revision: "desc" }, take: 1, include: { _count: { select: { nodes: true } } } } },
  });
  if (!project) notFound();
  const budget = project.budgets[0];
  const services = await prisma.wbsNode.findMany({ where: { budgetId: budget.id, kind: "SERVICE" }, select: { specification: true, measurementCriteria: true, requiresBrand: true } });
  const withSpec = services.filter((s) => s.specification).length;
  const withCriteria = services.filter((s) => s.measurementCriteria).length;
  const c = project.company;
  const missingCompany = [!c.document && "CNPJ", !c.address && "endereço", !c.technicalLead && "responsável técnico"].filter(Boolean);
  const readOnly = !canEdit(role);

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}><span className="mono muted">{project.code}</span> · {project.name}</h1>
      </div>
      <BudgetTabs projectId={project.id} sicro={await isSicroProject(project.id)} />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Arquivos</h2>
        <table className="list">
          <tbody>
            <tr>
              <td><strong>Planilha orçamentária (Excel)</strong><div className="muted" style={{ fontSize: 13 }}>Sintética, analítica (composições abertas), BDI e encargos, cronograma e curvas ABC. Valores iguais aos do app; totais com SOMA.</div></td>
              <td className="num"><a className="btn" href={`/api/orcamentos/${project.id}/excel`} download>Baixar .xlsx</a></td>
            </tr>
            <tr>
              <td><strong>Proposta comercial (PDF)</strong><div className="muted" style={{ fontSize: 13 }}>Abre a página da proposta em A4; use Imprimir → Salvar como PDF.</div></td>
              <td className="num"><a className="btn" href={`/orcamentos/${project.id}/proposta`} target="_blank" rel="noopener">Abrir para imprimir</a></td>
            </tr>
            <tr>
              <td><strong>Planilha para proponentes (Excel)</strong><div className="muted" style={{ fontSize: 13 }}>Sem preços, com especificação, critério de medição e campos em amarelo para a proponente. {services.length} serviço(s): {withSpec} com especificação, {withCriteria} com critério de medição.</div></td>
              <td className="num"><a className="btn secondary" href={`/api/orcamentos/${project.id}/proponentes`} download>Baixar .xlsx</a></td>
            </tr>
          </tbody>
        </table>
        {missingCompany.length > 0 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Faltam dados da empresa para o cabeçalho: {missingCompany.join(", ")}. {canManage(role) ? <Link href="/empresa/dados">Preencher</Link> : "Peça ao gestor para preencher em Empresa → Dados da empresa."}
          </p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dados da proposta comercial</h2>
        <ProposalForm budgetId={budget.id} readOnly={readOnly} data={budget} />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Planilha para proponentes</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          A especificação, o critério de medição e a exigência de marca de cada serviço ficam em <Link href={`/orcamentos/${project.id}/especificacoes`}>Especificações</Link>.
        </p>
        <BidderForm budgetId={budget.id} readOnly={readOnly} data={budget} />
      </div>
    </>
  );
}
