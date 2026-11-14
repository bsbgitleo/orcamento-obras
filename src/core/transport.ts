// src/core/transport.ts
// Momento de transporte do SICRO (decisões #39, #66–#68), como o DNIT faz no
// orçamento (Memória de cálculo de transportes, DNIT/TO 2018, tabelas 5 e 6):
//
//   peso (t)            = Σ quantidade do grupo F (t por unidade) × quantidade do serviço
//                         (atravessando as atividades auxiliares, multiplicando coeficientes)
//   momento (t·km)      = peso × DMT da via            (LN leito natural, RP revestimento
//                         primário, P pavimentada; DMT pavimentada × FIT)
//   item de transporte  = Σ momentos por composição de transporte (código da via),
//                         lançado no orçamento em t·km × custo da composição (R$/t·km)
//
// Cada momento por material e serviço tem 4 casas (meio para cima), como na
// tabela do DNIT; os totais somam esses valores.
import Decimal from "decimal.js";
import type { Catalog } from "./composition";

export type Road = "LN" | "RP" | "P";
export const ROADS: Road[] = ["LN", "RP", "P"];
export const ROAD_LABEL: Record<Road, string> = { LN: "leito natural", RP: "revestimento primário", P: "pavimentada" };

export interface Dmt { LN: Decimal.Value; RP: Decimal.Value; P: Decimal.Value }

export interface TransportService {
  /** Linha da EAP */
  nodeId: string;
  /** Chave da composição no catálogo */
  compositionKey: string;
  quantity: Decimal.Value;
}

export interface MaterialWeight {
  /** Código do material (insumo Mxxxx ou composição de material produzido) */
  code: string;
  description: string;
  /** Composições de transporte por via, como no grupo F */
  transportCodes: Partial<Record<Road, string>>;
  /** Peso total transportado (t) */
  weight: Decimal;
}

export interface TransportLine {
  /** Código da composição de transporte (ex.: 5914479) */
  code: string;
  road: Road;
  /** Momento total (t·km) */
  moment: Decimal;
}

const r4 = (v: Decimal.Value) => new Decimal(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

/**
 * Peso de cada material a transportar, somando todos os serviços. Atravessa as
 * composições auxiliares (grupo D e auxiliares de composições próprias); não
 * atravessa o tempo fixo (grupo E), que é a própria operação de carga.
 */
export function materialWeights(services: TransportService[], catalog: Catalog): MaterialWeight[] {
  const byCode = new Map<string, MaterialWeight>();
  const walk = (key: string, factor: Decimal, stack: string[]) => {
    if (stack.includes(key) || stack.length > 50) return;
    const comp = catalog.getComposition(key);
    if (!comp) return;
    for (const it of comp.items) {
      if (it.type === "TRANSPORTE") {
        const ref = it.inputId ? catalog.getInput(it.inputId) : it.compositionId ? catalog.getComposition(it.compositionId) : undefined;
        const code = ref?.code ?? it.inputId ?? it.compositionId ?? "?";
        let m = byCode.get(code);
        if (!m) {
          const [ln, rp, p] = it.transportCodes;
          m = { code, description: ref?.description ?? code, transportCodes: { LN: ln || undefined, RP: rp || undefined, P: p || undefined }, weight: new Decimal(0) };
          byCode.set(code, m);
        }
        m.weight = m.weight.plus(factor.times(it.coefficient));
      } else if (it.type === "COMPOSICAO_AUXILIAR" && it.group !== "E") {
        walk(it.compositionId, factor.times(it.coefficient), [...stack, key]);
      }
    }
  };
  for (const s of services) {
    const q = new Decimal(s.quantity);
    if (q.isZero()) continue;
    walk(s.compositionKey, q, []);
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
}

/**
 * Momentos por composição de transporte. `dmtFor(code)` devolve a DMT do
 * material (padrão do orçamento ou ajuste). O FIT multiplica a DMT pavimentada.
 */
export function transportMoments(materials: MaterialWeight[], dmtFor: (code: string) => Dmt, fit: Decimal.Value = 1): TransportLine[] {
  const lines = new Map<string, TransportLine>();
  for (const m of materials) {
    const dmt = dmtFor(m.code);
    for (const road of ROADS) {
      const code = m.transportCodes[road];
      let km = new Decimal(dmt[road] || 0);
      if (road === "P") km = km.times(fit);
      if (!code || km.lte(0) || m.weight.lte(0)) continue;
      const moment = r4(m.weight.times(km));
      const l = lines.get(code) ?? { code, road, moment: new Decimal(0) };
      l.moment = l.moment.plus(moment);
      lines.set(code, l);
    }
  }
  return [...lines.values()].filter((l) => l.moment.gt(0)).sort((a, b) => ROADS.indexOf(a.road) - ROADS.indexOf(b.road) || a.code.localeCompare(b.code));
}
