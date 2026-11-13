// src/core/wbs.ts
// EAP (Estrutura Analítica do Projeto): Obra → Etapas → Subetapas → Serviços,
// com numeração automática (1, 1.1, 1.1.1) refeita ao mover itens (spec §4.4).
import { D, ZERO, roundMoney, type Dec, type DecimalInput } from "./money";

export interface WbsService {
  kind: "SERVICE";
  id: string;
  description: string;
  unit: string;
  quantity: DecimalInput;
  unitCost: DecimalInput; // já arredondado (2 casas)
}

export interface WbsStage {
  kind: "STAGE";
  id: string;
  description: string;
  children: WbsNode[];
}

export type WbsNode = WbsStage | WbsService;

export interface NumberedNode {
  id: string;
  code: string; // "1", "1.1", "1.1.3"
  level: number; // 1 = etapa raiz
  kind: WbsNode["kind"];
  description: string;
  /** Custo direto total do nó (serviço: qtd × custo unitário; etapa: soma dos filhos). */
  total: Dec;
}

/** Percorre a árvore atribuindo códigos hierárquicos e totais. Ordem dos filhos = ordem do array. */
export function numberWbs(roots: WbsNode[]): NumberedNode[] {
  const out: NumberedNode[] = [];

  const visit = (node: WbsNode, prefix: string, level: number): Dec => {
    if (node.kind === "SERVICE") {
      const total = roundMoney(D(node.quantity).times(node.unitCost));
      out.push({ id: node.id, code: prefix, level, kind: "SERVICE", description: node.description, total });
      return total;
    }
    const placeholder: NumberedNode = {
      id: node.id, code: prefix, level, kind: "STAGE", description: node.description, total: ZERO,
    };
    out.push(placeholder);
    let total = ZERO;
    node.children.forEach((child, i) => {
      total = total.plus(visit(child, `${prefix}.${i + 1}`, level + 1));
    });
    placeholder.total = total;
    return total;
  };

  roots.forEach((root, i) => visit(root, `${i + 1}`, 1));
  return out;
}

export function wbsTotal(roots: WbsNode[]): Dec {
  return numberWbs(roots)
    .filter((n) => n.level === 1)
    .reduce((acc, n) => acc.plus(n.total), ZERO);
}

/**
 * Move um nó para outra posição (mesmo pai ou outro). Retorna nova árvore (imutável).
 * Um serviço não pode receber filhos; uma etapa não pode ser movida para dentro de si mesma.
 */
export function moveNode(
  roots: WbsNode[],
  nodeId: string,
  target: { parentId: string | null; index: number },
): WbsNode[] {
  let moved: WbsNode | undefined;

  const remove = (nodes: WbsNode[]): WbsNode[] =>
    nodes.flatMap((n): WbsNode[] => {
      if (n.id === nodeId) { moved = n; return []; }
      return n.kind === "STAGE" ? [{ ...n, children: remove(n.children) }] : [n];
    });

  const without = remove(roots);
  if (!moved) throw new Error(`Item não encontrado na EAP: ${nodeId}`);
  const node = moved;

  const insertInto = (list: WbsNode[]): WbsNode[] => {
    const copy = [...list];
    copy.splice(Math.max(0, Math.min(target.index, copy.length)), 0, node);
    return copy;
  };

  if (target.parentId === null) return insertInto(without);

  let inserted = false;
  const insert = (nodes: WbsNode[]): WbsNode[] =>
    nodes.map((n) => {
      if (n.kind !== "STAGE") return n;
      if (n.id === target.parentId) { inserted = true; return { ...n, children: insertInto(n.children) }; }
      return { ...n, children: insert(n.children) };
    });

  const result = insert(without);
  if (!inserted) {
    throw new Error(`Destino inválido: etapa ${target.parentId} não existe ou é um serviço.`);
  }
  return result;
}
