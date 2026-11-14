// src/app/api/orcamentos/[id]/proponentes/route.ts
// Planilha padrão para as proponentes (sem preços), no modelo de homogeneização.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { loadBudgetExport } from "@/lib/exports/budget-export";
import { buildBidderWorkbook } from "@/lib/exports/xlsx-budget";
import { xlsxResponse } from "@/lib/exports/download";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/orcamentos/[id]/proponentes">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await ctx.params;
  const data = await loadBudgetExport(session.company.id, id);
  if (!data) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
  return xlsxResponse(await buildBidderWorkbook(data), `${data.project.code} - planilha para proponentes.xlsx`);
}
