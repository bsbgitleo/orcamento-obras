// src/lib/pricing/calc-memory.ts
// Memória de cálculo no recálculo do orçamento (decisões #80–#81): avalia os
// parâmetros, grava resultado e erro de cada um e leva o resultado para as
// quantidades vinculadas (4 casas, meio para cima, como a quantidade do serviço).
import type { PrismaClient } from "@/generated/prisma/client";
import Decimal from "decimal.js";
import { evaluateMemory } from "@/core/calc-memory";

export async function syncCalcMemory(prisma: PrismaClient, budgetId: string): Promise<void> {
  const rows = await prisma.calcRow.findMany({ where: { budgetId, kind: "PARAM" }, include: { linkedNodes: { select: { id: true, quantity: true } } } });
  if (!rows.length) return;
  const res = evaluateMemory(rows.filter((r) => r.code).map((r) => ({ code: r.code!, value: r.value?.toString() ?? null, formula: r.formula })));
  const ops = [];
  for (const r of rows) {
    const out = r.code ? res.get(r.code) : undefined;
    const result = out?.value ? out.value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP) : null;
    const error = out?.error ?? (r.code ? null : "sem sigla");
    if ((r.result?.toString() ?? null) !== (result?.toString() ?? null) || r.error !== error) {
      ops.push(prisma.calcRow.update({ where: { id: r.id }, data: { result: result?.toString() ?? null, error } }));
    }
    if (!result) continue; // com erro, a quantidade vinculada fica como estava (a tela avisa)
    const q = result.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    for (const n of r.linkedNodes) {
      if (!n.quantity || !new Decimal(n.quantity.toString()).eq(q)) ops.push(prisma.wbsNode.update({ where: { id: n.id }, data: { quantity: q.toString() } }));
    }
  }
  if (ops.length) await prisma.$transaction(ops);
}
