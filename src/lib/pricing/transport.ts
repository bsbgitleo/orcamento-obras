// src/lib/pricing/transport.ts
// SICRO services whose composition (or an auxiliary of it) has a "momento de
// transporte" (grupo F) still without DMT — decisão #39: cost equals the
// published one (without transport) and the service is flagged.
import type { PrismaClient } from "@/generated/prisma/client";
import { calculateCompositionCost, type CompositionCost } from "@/core/composition";
import { ownCompositionKey } from "@/core/own-composition";
import { loadBudgetCatalog } from "./budget-catalog";

export async function servicesWithPendingTransport(
  prisma: PrismaClient, priceTableId: string, companyId: string,
  nodes: { id: string; kind: string; compositionId: string | null; ownCompositionId: string | null }[],
): Promise<Set<string>> {
  const services = nodes.filter((n) => n.kind === "SERVICE" && (n.compositionId || n.ownCompositionId));
  if (!services.length) return new Set();
  const { catalog } = await loadBudgetCatalog(prisma, priceTableId, companyId, {
    official: services.flatMap((s) => (s.compositionId ? [s.compositionId] : [])),
    own: services.flatMap((s) => (s.ownCompositionId ? [s.ownCompositionId] : [])),
  });
  const cache = new Map<string, CompositionCost>();
  const out = new Set<string>();
  for (const s of services) {
    const key = s.ownCompositionId ? ownCompositionKey(s.ownCompositionId) : s.compositionId!;
    if (catalog.getComposition(key) && calculateCompositionCost(key, catalog, cache).transportPending) out.add(s.id);
  }
  return out;
}
