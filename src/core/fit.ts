// src/core/fit.ts
// Fator de Interferência de Tráfego (FIT) do SICRO — Manual de Custos de
// Infraestrutura de Transportes, Volume 05, 2ª edição (DNIT, 2025), seção 3.2.
// Decisões #71–#74.
//
//   VMDmp = Σ(DTri × VMDi) ÷ ΣDTri                        (Eq. 1, segmentos da obra)
//   A1    = 70 + 0,0035 × VMDf      [s]                    (Eq. 2, só com PARE e SIGA no
//                                                           orçamento e material que passa pela obra)
//   Fc    = (1/Vu − 1/Vp) × 3.600   [s/km] = 60 com 30 e 60 km/h   (Eq. 3)
//   A2    = Fc × DMTu               [s]                    (Eq. 4)
//   Fp    = 3.600 ÷ Vp = 60         [s/km]                 (Eq. 5)
//   DMTp  = DMTr + DMTu                                    (Eq. 6)
//   FIT   = 1 + (A1 + A2) ÷ (DMTp × Fp)                    (Eq. 7)
//   DMTF  = FIT × DMTp  → parcela F, via pavimentada       (Eq. 8)
//
// Só em vias pavimentadas; sem FIT para DMT pavimentada acima de 100 km (3.2.1).
// O manual não fixa as casas do FIT: o app usa 4, meio para cima (decisão #74).
import Decimal from "decimal.js";

export const FIT_STANDARD_SPEED = 60; // km/h, rodovia rural pavimentada (Vp)
export const FIT_URBAN_SPEED = 30; // km/h, via urbana pavimentada (Vu), ajustável com justificativa
export const FIT_MAX_DMT = 100; // km

export interface TrafficSegment { lengthKm: Decimal.Value; vmdPerLane: Decimal.Value }

/** Média ponderada do VMD por faixa pelos segmentos da obra (Eq. 1); null sem segmentos válidos. */
export function weightedVmd(segments: TrafficSegment[]): Decimal | null {
  let len = new Decimal(0), sum = new Decimal(0);
  for (const s of segments) {
    const l = new Decimal(s.lengthKm || 0);
    if (l.lte(0)) continue;
    len = len.plus(l);
    sum = sum.plus(l.times(s.vmdPerLane || 0));
  }
  return len.isZero() ? null : sum.div(len);
}

export interface FitInput {
  /** DMT em rodovia rural pavimentada (km) */
  dmtRural: Decimal.Value;
  /** DMT em via urbana pavimentada (km) */
  dmtUrban: Decimal.Value;
  /** VMD por faixa do segmento da obra (já ponderado) */
  vmdPerLane: Decimal.Value | null;
  /** O orçamento prevê a operação PARE e SIGA (ex.: SICRO 5213850) */
  stopGo: boolean;
  /** O transporte do material passa pela extensão da obra */
  passesWorksite: boolean;
  /** Velocidade em via urbana (km/h); padrão 30 */
  urbanSpeed?: Decimal.Value | null;
}

export interface FitResult {
  fit: Decimal;
  dmtPaved: Decimal;
  a1: Decimal;
  a2: Decimal;
  /** Por que o FIT é 1, quando é */
  reason: "sem-dmt" | "acima-100km" | "sem-atraso" | null;
}

const r4 = (v: Decimal) => v.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

export function urbanConversionFactor(urbanSpeed: Decimal.Value = FIT_URBAN_SPEED): Decimal {
  const vu = new Decimal(urbanSpeed);
  if (vu.lte(0)) return new Decimal(0);
  // (1/Vu − 1/Vp) × 3.600 escrito como 3.600 × (Vp − Vu) ÷ (Vu × Vp), sem dízima
  return new Decimal(3600).times(new Decimal(FIT_STANDARD_SPEED).minus(vu)).div(vu.times(FIT_STANDARD_SPEED));
}

export function calculateFit(i: FitInput): FitResult {
  const rural = new Decimal(i.dmtRural || 0), urban = new Decimal(i.dmtUrban || 0);
  const dmtPaved = rural.plus(urban);
  const one = (reason: FitResult["reason"], a1 = new Decimal(0), a2 = new Decimal(0)): FitResult => ({ fit: new Decimal(1), dmtPaved, a1, a2, reason });
  if (dmtPaved.lte(0)) return one("sem-dmt");
  if (dmtPaved.gt(FIT_MAX_DMT)) return one("acima-100km");
  const a1 = i.stopGo && i.passesWorksite ? new Decimal(70).plus(new Decimal(i.vmdPerLane ?? 0).times("0.0035")) : new Decimal(0);
  const a2 = urban.gt(0) ? urbanConversionFactor(i.urbanSpeed ?? FIT_URBAN_SPEED).times(urban) : new Decimal(0);
  if (a1.plus(a2).lte(0)) return one("sem-atraso", a1, a2);
  const fp = new Decimal(3600).div(FIT_STANDARD_SPEED);
  return { fit: r4(new Decimal(1).plus(a1.plus(a2).div(dmtPaved.times(fp)))), dmtPaved, a1, a2, reason: null };
}
