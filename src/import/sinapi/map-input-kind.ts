// src/import/sinapi/map-input-kind.ts
import type { InputKind } from "@/generated/prisma/enums";

/**
 * SINAPI "Classificação" → InputKind.
 * MATERIAL, MAO DE OBRA, EQUIPAMENTO (AQUISIÇÃO | LOCAÇÃO | SEM CRÉDITO IVA),
 * ENCARGOS COMPLEMENTARES (labour-related: alimentação, transporte, EPI...),
 * SERVIÇOS, ESPECIAIS. Unknown/blank (SEM PREÇO inputs) → MATERIAL.
 */
export function mapInputKind(sourceClass: string): InputKind {
  const c = sourceClass.toUpperCase();
  if (c.startsWith("MAO DE OBRA") || c.startsWith("ENCARGOS COMPLEMENTARES")) return "MAO_DE_OBRA";
  if (c.startsWith("EQUIPAMENTO")) return "EQUIPAMENTO";
  if (c.startsWith("SERVI") || c.startsWith("ESPECIAIS")) return "SERVICO";
  return "MATERIAL";
}
