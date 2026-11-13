// src/core/own-composition.ts
// Own compositions of a company priced in the budget's base (decisão #51):
// official items are kept by CODE and resolved against the budget's price
// table (UF + month + regime); own inputs carry their quoted price. The result
// is a plain Catalog, so the same engine (calculateCompositionCost,
// explodeInputs) prices official and own compositions alike.
//
// Keys inside the merged catalog:
//   official composition / input → its database id (unchanged)
//   own composition              → "own:<id>"
//   own input                    → "own-input:<id>"
//   official code missing in the base → "missing-input:<origin>:<code>" (no price → composição "sem custo")
import type { Catalog, Composition, CompositionChild, InputItem, InputKind, PriceSource } from "./composition";
import type { DecimalInput } from "./money";

export const ownCompositionKey = (id: string) => `own:${id}`;
export const ownInputKey = (id: string) => `own-input:${id}`;
export const missingKey = (origin: string, code: string) => `missing-input:${origin}:${code}`;

export function isOwnCompositionKey(key: string): boolean { return key.startsWith("own:"); }
export function isOwnInputKey(key: string): boolean { return key.startsWith("own-input:"); }
export function isMissingKey(key: string): boolean { return key.startsWith("missing-input:"); }

export interface OwnInputDef {
  id: string;
  code: string;
  description: string;
  unit: string;
  kind: InputKind;
  unitPrice: DecimalInput;
}

export type OwnItemDef =
  | { type: "OFFICIAL_INPUT"; origin: string; code: string; coefficient: DecimalInput; description?: string | null; unit?: string | null }
  | { type: "OFFICIAL_COMPOSITION"; origin: string; code: string; coefficient: DecimalInput; description?: string | null; unit?: string | null }
  | { type: "OWN_INPUT"; ownInputId: string; coefficient: DecimalInput }
  | { type: "OWN_COMPOSITION"; ownCompositionId: string; coefficient: DecimalInput };

export interface OwnCompositionDef {
  id: string;
  code: string;
  description: string;
  unit: string;
  items: OwnItemDef[];
}

export interface OwnCatalogParts {
  /** Official catalog of the budget's price table (compositions reachable + their inputs). */
  base: Catalog;
  /** Official inputs referenced directly by own compositions, by code. */
  officialInputsByCode: Map<string, InputItem>;
  /** Official composition id by code, in the budget's price table. */
  officialCompositionIdByCode: Map<string, string>;
  ownCompositions: OwnCompositionDef[];
  ownInputs: OwnInputDef[];
  /** The budget's base: own items are priced in this context. */
  source: PriceSource;
}

/**
 * Merges own compositions into the official catalog. An official code that
 * does not exist in the budget's base becomes an input without price, so the
 * composition is reported "sem custo" instead of silently costing less.
 * An own composition or own input that is not supplied is a programming
 * error and surfaces as MissingReferenceError from the engine.
 */
export function withOwnCompositions(p: OwnCatalogParts): Catalog {
  const ownSource: PriceSource = { ...p.source, origin: "PROPRIA" };
  const inputs = new Map<string, InputItem>();
  for (const i of p.ownInputs) {
    inputs.set(ownInputKey(i.id), { id: ownInputKey(i.id), code: i.code, description: i.description, unit: i.unit, kind: i.kind, unitPrice: i.unitPrice, source: ownSource });
  }
  for (const i of p.officialInputsByCode.values()) inputs.set(i.id, i);

  const comps = new Map<string, Composition>();
  for (const c of p.ownCompositions) {
    const items: CompositionChild[] = c.items.map((it) => {
      switch (it.type) {
        case "OFFICIAL_INPUT": {
          const found = p.officialInputsByCode.get(it.code);
          if (found) return { type: "INSUMO", inputId: found.id, coefficient: it.coefficient };
          const key = missingKey(it.origin, it.code);
          inputs.set(key, {
            id: key, code: it.code, description: it.description ?? `Insumo ${it.code} não existe nesta base`, unit: it.unit ?? "",
            kind: "MATERIAL", unitPrice: null, source: p.source,
          });
          return { type: "INSUMO", inputId: key, coefficient: it.coefficient };
        }
        case "OFFICIAL_COMPOSITION": {
          const id = p.officialCompositionIdByCode.get(it.code);
          if (id) return { type: "COMPOSICAO_AUXILIAR", compositionId: id, coefficient: it.coefficient };
          const key = missingKey(it.origin, it.code);
          inputs.set(key, {
            id: key, code: it.code, description: it.description ?? `Composição ${it.code} não existe nesta base`, unit: it.unit ?? "",
            kind: "SERVICO", unitPrice: null, source: p.source,
          });
          return { type: "INSUMO", inputId: key, coefficient: it.coefficient };
        }
        case "OWN_INPUT":
          return { type: "INSUMO", inputId: ownInputKey(it.ownInputId), coefficient: it.coefficient };
        case "OWN_COMPOSITION":
          return { type: "COMPOSICAO_AUXILIAR", compositionId: ownCompositionKey(it.ownCompositionId), coefficient: it.coefficient };
      }
    });
    comps.set(ownCompositionKey(c.id), { id: ownCompositionKey(c.id), code: c.code, description: c.description, unit: c.unit, source: ownSource, items });
  }

  return {
    getInput: (id) => inputs.get(id) ?? p.base.getInput(id),
    getComposition: (id) => comps.get(id) ?? p.base.getComposition(id),
  };
}

/** Own compositions reachable from `rootIds` through OWN_COMPOSITION items (ids, without prefix). */
export function reachableOwnCompositions(rootIds: string[], byId: Map<string, OwnCompositionDef>): Set<string> {
  const seen = new Set<string>();
  const stack = [...rootIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const it of byId.get(id)?.items ?? []) if (it.type === "OWN_COMPOSITION") stack.push(it.ownCompositionId);
  }
  return seen;
}

/**
 * Would adding `childId` as an item of `parentId` create a cycle? True when
 * the child is the parent itself or (transitively) contains it.
 */
export function wouldCreateCycle(parentId: string, childId: string, byId: Map<string, OwnCompositionDef>): boolean {
  return reachableOwnCompositions([childId], byId).has(parentId);
}
