// src/lib/budget-origin.ts
import "server-only";
import { prisma } from "@/lib/prisma";

/** Latest budget of the project is priced on a SICRO base (shows the Transporte tab). */
export async function isSicroProject(projectId: string): Promise<boolean> {
  const b = await prisma.budget.findFirst({ where: { projectId }, orderBy: { revision: "desc" }, select: { priceTable: { select: { origin: true } } } });
  return b?.priceTable.origin === "SICRO";
}
