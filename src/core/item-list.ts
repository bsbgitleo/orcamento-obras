// src/core/item-list.ts
// "Itens da planilha" de um material (decisão #82): a numeração dos serviços,
// em ordem, com três ou mais seguidos da mesma etapa escritos como intervalo
// ("3.4 a 3.6"), como nos modelos arquivados.

/** `ordered`: numeração de todos os serviços da planilha, na ordem; `chosen`: os do material. */
export function formatItemList(ordered: string[], chosen: string[]): string {
  const set = new Set(chosen);
  const parent = (c: string) => c.split(".").slice(0, -1).join(".");
  const runs: string[][] = [];
  let run: string[] = [];
  for (const code of ordered) {
    if (set.has(code) && (!run.length || parent(run[0]) === parent(code))) { run.push(code); continue; }
    if (run.length) runs.push(run);
    run = set.has(code) ? [code] : [];
  }
  if (run.length) runs.push(run);
  return runs.map((r) => (r.length >= 3 ? `${r[0]} a ${r[r.length - 1]}` : r.join(", "))).join(", ");
}
