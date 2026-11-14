// src/app/api/orcamentos/[id]/mapa/route.ts
// Mapa comparativo das propostas recebidas (decisões #76–#79).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { loadBudgetProposals } from "@/lib/proposals/load";
import { buildProposalMapWorkbook } from "@/lib/exports/xlsx-proposals";
import { xlsxResponse } from "@/lib/exports/download";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/orcamentos/[id]/mapa">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await ctx.params;
  const data = await loadBudgetProposals(prisma, session.company.id, id);
  if (!data) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
  if (!data.proposals.length) return NextResponse.json({ error: "Nenhuma proposta gravada." }, { status: 404 });
  const project = await prisma.project.findUniqueOrThrow({ where: { id }, include: { budgets: { orderBy: { revision: "desc" }, take: 1, select: { revision: true } } } });
  const buf = await buildProposalMapWorkbook(data, { company: session.company.name, projectCode: project.code, projectName: project.name, revision: project.budgets[0].revision });
  return xlsxResponse(buf, `${project.code} R${project.budgets[0].revision} - mapa comparativo das propostas.xlsx`);
}
