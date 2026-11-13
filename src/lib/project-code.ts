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
