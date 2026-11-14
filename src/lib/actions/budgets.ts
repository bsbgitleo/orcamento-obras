// src/lib/actions/budgets.ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { nextProjectCode } from "@/lib/project-code";
import { parseForm, type ActionState } from "@/lib/forms";
import { newBudgetSchema } from "@/lib/schemas/budget";
import { requireEditor } from "@/lib/auth/require";
import { Prisma } from "@/generated/prisma/client";

export async function createBudget(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const companyId = ctx.company.id;
  const r = parseForm(newBudgetSchema, fd);
  if (!r.ok) return r.state;
  const d = r.data;

  // Referential checks, scoped to the company (the action is reachable directly)
  const [table, bdi, charges, client] = await Promise.all([
    prisma.priceTable.findFirst({ where: { id: d.priceTableId, OR: [{ companyId: null }, { companyId }] } }),
    prisma.bdiProfile.findFirst({ where: { id: d.bdiId, companyId } }),
    d.socialChargesId ? prisma.socialChargesProfile.findFirst({ where: { id: d.socialChargesId, companyId } }) : Promise.resolve(null),
    d.clientId ? prisma.client.findFirst({ where: { id: d.clientId, companyId } }) : Promise.resolve(null),
  ]);
  const fieldErrors: Record<string, string> = {};
  if (!table) fieldErrors.priceTableId = "Base de preços não encontrada";
  if (!bdi) fieldErrors.bdiId = "BDI não encontrado";
  // SICRO: encargos por profissional, do relatório do DNIT — a tabela da empresa não se aplica (decisão #70)
  const sicro = table?.origin === "SICRO";
  if (!sicro && !d.socialChargesId) fieldErrors.socialChargesId = "Escolha a tabela de encargos sociais (bases SINAPI)";
  else if (!sicro && !charges) fieldErrors.socialChargesId = "Tabela de encargos não encontrada";
  if (d.clientId && !client) fieldErrors.clientId = "Cliente não encontrado";
  if (!sicro && table && charges && table.regime !== charges.regime) {
    fieldErrors.socialChargesId = "O regime da tabela de encargos difere do regime da base de preços";
  }
  if (Object.keys(fieldErrors).length) return { status: "error", message: "Corrija os campos indicados.", fieldErrors, values: r.values };

  const isPublic = d.type === "PUBLIC";
  let projectId: string | null = null;
  // Retry on code collision (two users creating at once)
  for (let attempt = 0; attempt < 3 && !projectId; attempt++) {
    const codes = (await prisma.project.findMany({ where: { companyId }, select: { code: true } })).map((p) => p.code);
    const code = nextProjectCode(codes);
    try {
      const project = await prisma.project.create({
        data: {
          companyId, code, name: d.name, type: d.type, category: d.category, uf: d.uf, address: d.address,
          clientId: d.clientId, deadlineDays: d.deadlineDays,
          biddingModality: isPublic ? d.biddingModality : null,
          biddingNumber: isPublic ? d.biddingNumber : null,
          biddingAgency: isPublic ? d.biddingAgency : null,
          biddingOpensAt: isPublic ? d.biddingOpensAt : null,
          budgets: {
            create: {
              revision: 0,
              priceTableId: d.priceTableId,
              bdiId: d.bdiId,
              supplyBdiId: d.useSupplyBdi ? d.supplyBdiId : null,
              socialChargesId: sicro ? null : d.socialChargesId,
            },
          },
        },
      });
      projectId = project.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  if (!projectId) return { status: "error", message: "Não foi possível gerar o código do orçamento. Tente de novo.", values: r.values };

  revalidatePath("/orcamentos");
  revalidatePath("/");
  redirect(d.importSheet ? `/orcamentos/${projectId}/importar` : `/orcamentos/${projectId}`);
}
