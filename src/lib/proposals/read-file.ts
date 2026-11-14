// src/lib/proposals/read-file.ts
// Lê uma proposta enviada (.xlsx ou PDF com texto) — decisão #76.
import "server-only";
import { readWorkbookGrids } from "@/lib/imports/sheet-grid";
import { parseProposalGrid } from "@/core/proposals/grid";
import { parseProposalText, type TextItem } from "@/core/proposals/pdf-text";
import type { ParsedProposal } from "@/core/proposals/types";

export const MAX_PROPOSAL_BYTES = 10 * 1024 * 1024;

export async function pdfTextItems(data: Uint8Array): Promise<TextItem[][]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages: TextItem[][] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push((tc.items as { str?: string; transform?: number[] }[])
      .filter((i) => typeof i.str === "string" && i.transform)
      .map((i) => ({ str: i.str!, x: i.transform![4], y: i.transform![5] })));
  }
  await task.destroy();
  return pages;
}

export async function readProposalFile(fileName: string, buffer: Buffer): Promise<ParsedProposal & { fileKind: "XLSX" | "PDF" }> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const grids = await readWorkbookGrids(buffer);
    const best = [...grids].sort((a, b) => b.score - a.score)[0];
    if (!best) throw new Error("A planilha está vazia.");
    return { ...parseProposalGrid(best.rows), fileKind: "XLSX" };
  }
  if (lower.endsWith(".pdf")) {
    let pages: TextItem[][];
    try { pages = await pdfTextItems(new Uint8Array(buffer)); } catch { throw new Error("Não consegui abrir o PDF."); }
    if (!pages.some((p) => p.some((i) => i.str.trim()))) throw new Error("O PDF não tem texto (parece escaneado). Peça a planilha .xlsx ou digite os preços.");
    return { ...parseProposalText(pages), fileKind: "PDF" };
  }
  throw new Error("Envie a proposta em .xlsx ou PDF.");
}
