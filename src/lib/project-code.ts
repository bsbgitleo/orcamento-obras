// src/lib/project-code.ts
/** Sequential project code: ORC-0001, ORC-0002, … */
export const PROJECT_CODE_PREFIX = "ORC-";

export function formatProjectCode(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error("Sequência inválida");
  return `${PROJECT_CODE_PREFIX}${String(seq).padStart(4, "0")}`;
}

/** Next code after the highest existing one (codes outside the pattern are ignored). */
export function nextProjectCode(existingCodes: string[]): string {
  let max = 0;
  for (const c of existingCodes) {
    const m = new RegExp(`^${PROJECT_CODE_PREFIX}(\\d+)$`).exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return formatProjectCode(max + 1);
}

/** Next sequential code for any prefix ("CP-" → CP-0001, CP-0002…), ignoring codes outside the pattern. */
export function nextSequentialCode(prefix: string, existingCodes: string[]): string {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  let max = 0;
  for (const c of existingCodes) {
    const m = re.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Códigos da base própria (decisão #52) */
export const OWN_COMPOSITION_PREFIX = "CP-";
export const OWN_INPUT_PREFIX = "IP-";
