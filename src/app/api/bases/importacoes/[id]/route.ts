// src/app/api/bases/importacoes/[id]/route.ts
// GET: status and log of one import, polled by the progress page.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { reconcileStaleJobs } from "@/lib/imports/jobs";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/bases/importacoes/[id]">) {
  const session = await getSession();
  if (!session?.user.isPlatformAdmin) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await ctx.params;
  await reconcileStaleJobs();
  const job = await prisma.importJob.findUnique({ where: { id }, select: { status: true, log: true, error: true } });
  if (!job) return NextResponse.json({ error: "Importação não encontrada." }, { status: 404 });
  return NextResponse.json(job, { headers: { "Cache-Control": "no-store" } });
}
