// src/lib/imports/jobs.ts
// Background SINAPI imports started from the interface (decisões #34, #47).
// The upload is saved under IMPORT_DIR/<jobId>/, a ZIP from the Caixa is
// unpacked, and the import runs inside the Next.js server process (started
// with `after()` by the route handler). One import at a time. Progress is
// appended to ImportJob.log and the page polls it.
import "server-only";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildSinapiPackage, type SinapiPackage } from "@/import/sinapi/classify";
import { runSinapiImport } from "@/import/sinapi/run-import";
import type { SinapiRegime } from "@/import/sinapi/types";

export const IMPORT_DIR = process.env.IMPORT_DIR ?? path.join(process.cwd(), ".data", "imports");

/** Upload limit (the Caixa ZIP of 10/2026 has 16 MB). */
export const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

// Jobs running in this server process. Survives hot reload in development.
const g = globalThis as unknown as { __orcImportJobs?: Set<string> };
export const activeJobs: Set<string> = (g.__orcImportJobs ??= new Set());

export class ImportRequestError extends Error {}

/**
 * Jobs left QUEUED/RUNNING by a server that stopped are marked as failed, so a
 * new import can start. Called before listing and before accepting an upload.
 */
export async function reconcileStaleJobs(): Promise<void> {
  const open = await prisma.importJob.findMany({ where: { status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true } });
  const stale = open.filter((j) => !activeJobs.has(j.id)).map((j) => j.id);
  if (stale.length) {
    await prisma.importJob.updateMany({
      where: { id: { in: stale } },
      data: { status: "FAILED", finishedAt: new Date(), error: "Interrompida: o servidor foi reiniciado durante a importação. Envie os arquivos de novo." },
    });
  }
}

export async function hasActiveImport(): Promise<boolean> {
  await reconcileStaleJobs();
  return (await prisma.importJob.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } })) > 0;
}

function safeName(name: string, i: number): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-120);
  return `${String(i).padStart(2, "0")}_${base || "arquivo"}`;
}

/**
 * Saves the uploaded files (xlsx or the Caixa ZIP) to the job folder and
 * classifies them by sheet names. Throws ImportRequestError for bad input.
 */
export async function saveUpload(jobId: string, files: File[]): Promise<{ dir: string; pkg: SinapiPackage }> {
  const dir = path.join(IMPORT_DIR, jobId);
  await mkdir(dir, { recursive: true });
  const xlsxPaths: string[] = [];
  let i = 0;
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      let zip: JSZip;
      try { zip = await JSZip.loadAsync(buf); } catch { throw new ImportRequestError(`"${f.name}" não é um ZIP válido.`); }
      for (const entry of Object.values(zip.files)) {
        // Entry names in the Caixa ZIP come with broken accents; the kind is decided by the sheets
        if (entry.dir || !entry.name.toLowerCase().endsWith(".xlsx") || entry.name.includes("__MACOSX")) continue;
        const p = path.join(dir, safeName(path.basename(entry.name), ++i));
        await writeFile(p, await entry.async("nodebuffer"));
        xlsxPaths.push(p);
      }
    } else if (lower.endsWith(".xlsx")) {
      const p = path.join(dir, safeName(f.name, ++i));
      await writeFile(p, buf);
      xlsxPaths.push(p);
    } else {
      throw new ImportRequestError(`"${f.name}": envie arquivos .xlsx ou o .zip da Caixa.`);
    }
  }
  let pkg: SinapiPackage;
  try { pkg = await buildSinapiPackage(xlsxPaths); } catch (e) { throw new ImportRequestError(e instanceof Error ? e.message : String(e)); }
  if (!pkg.reference && !pkg.maintenance) {
    throw new ImportRequestError("Nenhum arquivo reconhecido. Envie a SINAPI_Referência (com ou sem a SINAPI_mao_de_obra) e/ou a SINAPI_Manutenções, ou o ZIP da Caixa com elas.");
  }
  return { dir, pkg };
}

function jobLogger(jobId: string) {
  let text = "";
  let dirty = false;
  let writing: Promise<unknown> = Promise.resolve();
  const flush = () => {
    if (!dirty) return writing;
    dirty = false;
    const snapshot = text;
    writing = writing.then(() => prisma.importJob.update({ where: { id: jobId }, data: { log: snapshot } })).catch(() => {});
    return writing;
  };
  const timer = setInterval(flush, 1000);
  return {
    log: (line: string) => {
      const stamp = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
      text += `${stamp}  ${line}\n`;
      dirty = true;
    },
    close: async () => { clearInterval(timer); dirty = true; await flush(); },
  };
}

export async function runImportJob(jobId: string, dir: string, pkg: SinapiPackage): Promise<void> {
  activeJobs.add(jobId);
  const logger = jobLogger(jobId);
  try {
    const job = await prisma.importJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: new Date() } });
    const found = [pkg.reference && "Referência", pkg.laborShare && "mão de obra", pkg.maintenance && "Manutenções"].filter(Boolean).join(", ");
    logger.log(`Arquivos reconhecidos: ${found}${pkg.ignored.length ? ` (${pkg.ignored.length} ignorado(s))` : ""}.`);
    if (pkg.reference && !pkg.laborShare) logger.log("Sem a SINAPI_mao_de_obra: o % de mão de obra das composições fica em branco.");
    const result = await runSinapiImport(prisma, {
      reference: pkg.reference, laborShare: pkg.laborShare, maintenance: pkg.maintenance,
      ufs: job.ufs, regimes: job.regimes as SinapiRegime[],
    }, logger.log);
    const problems = result.tables.filter((t) => t.status !== "IMPORTED").length + (result.maintenance?.error ? 1 : 0);
    logger.log(problems ? `Concluída com ${problems} problema(s).` : "Concluída.");
    await logger.close();
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: problems && !result.tables.some((t) => t.status === "IMPORTED") && result.maintenance?.status !== "replaced" ? "FAILED" : "DONE",
        finishedAt: new Date(), result: result as unknown as Prisma.InputJsonValue,
        error: problems ? `${problems} item(ns) não importado(s); veja o registro.` : null,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.log(`ERRO: ${message}`);
    await logger.close();
    await prisma.importJob.update({ where: { id: jobId }, data: { status: "FAILED", finishedAt: new Date(), error: message } }).catch(() => {});
  } finally {
    activeJobs.delete(jobId);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Removes leftover upload folders of finished jobs (e.g. after a crash). */
export async function cleanupUploads(): Promise<void> {
  const names = await readdir(IMPORT_DIR).catch(() => [] as string[]);
  for (const n of names) if (!activeJobs.has(n)) await rm(path.join(IMPORT_DIR, n), { recursive: true, force: true }).catch(() => {});
}
