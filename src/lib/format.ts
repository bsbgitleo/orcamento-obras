// src/lib/format.ts
// Display helpers (PT-BR). Never used for calculation.
import { formatBRL } from "@/core/money";

type Numeric = string | number | { toString(): string } | null | undefined;

export function brl(v: Numeric): string {
  if (v === null || v === undefined) return "—";
  return formatBRL(v.toString());
}

/** "4.5" → "4,50 %" */
export function pct(v: Numeric, places = 2): string {
  if (v === null || v === undefined) return "—";
  return `${Number(v.toString()).toFixed(places).replace(".", ",")} %`;
}

/** "2026-10" → "10/2026" */
export function refMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${m}/${y}`;
}

export function dateBR(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

export function dateTimeBR(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export const REGIME_LABEL: Record<string, string> = {
  NAO_DESONERADO: "Sem desoneração",
  DESONERADO: "Com desoneração",
  SEM_ENCARGOS: "Sem encargos sociais",
};

export const PROJECT_TYPE_LABEL: Record<string, string> = {
  PUBLIC: "Obra pública",
  PRIVATE: "Obra privada",
};

export const CATEGORY_LABEL: Record<string, string> = {
  RESIDENTIAL_BUILDING: "Edificação residencial",
  COMMERCIAL_BUILDING: "Edificação comercial",
  SCHOOL: "Escola / creche",
  HEALTH_UNIT: "Unidade de saúde",
  PAVING: "Pavimentação",
  DRAINAGE: "Drenagem",
  SANITATION: "Saneamento",
  RENOVATION: "Reforma",
  OTHER: "Outros",
};

export const WORK_TYPE_LABEL: Record<string, string> = {
  EDIFICACOES: "Construção de edifícios",
  RODOVIAS_FERROVIAS: "Rodovias e ferrovias",
  REDES_AGUA_ESGOTO: "Redes de água e esgoto",
  PORTUARIAS_MARITIMAS_FLUVIAIS: "Obras portuárias, marítimas e fluviais",
  ESTACOES_REDES_ENERGIA_ELETRICA: "Estações e redes de energia elétrica",
  FORNECIMENTO_MATERIAIS_EQUIPAMENTOS: "Mero fornecimento de materiais e equipamentos",
};

export const INPUT_KIND_LABEL: Record<string, string> = {
  MATERIAL: "material",
  MAO_DE_OBRA: "mão de obra",
  EQUIPAMENTO: "equipamento",
  SERVICO: "serviço",
};

export const BUDGET_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  IN_REVIEW: "Em revisão",
  APPROVED: "Aprovado",
  SENT: "Enviado",
  ARCHIVED: "Arquivado",
};

export const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
