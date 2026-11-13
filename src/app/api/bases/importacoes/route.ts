// src/app/api/bases/importacoes/route.ts
// POST multipart/form-data: files (xlsx or the Caixa ZIP), ufs[], regimes[].
// Only the platform administrator (decisão #45). Starts the import in the
// background and answers with the job id; the page /bases/importacoes/<id>
// shows the progress. This path is excluded from src/proxy.ts so the upload
// body is not buffered/truncated by the proxy.
import { after, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { UFS } from "@/lib/format";
import {
  ImportRequestError, MAX_UPLOAD_BYTES, activeJobs, cleanupUploads, hasActiveImport, runImportJob, saveUpload,
} from "@/lib/imports/jobs";
import type { SinapiRegime } from "@/import/sinapi/types";

export const dynamic = "force-dynamic";

const REGIMES: SinapiRegime[] = ["NAO_DESONERADO", "DESONERADO", "SEM_ENCARGOS"];

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const ctx = await getSession();
  if (!ctx) return fail(401, "Sessão expirada. Entre novamente.");
  if (!ctx.user.isPlatformAdmin) return fail(403, "Apenas o administrador da plataforma pode importar bases oficiais.");

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES) return fail(413, `Arquivos grandes demais (limite de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`);
  if (await hasActiveImport()) return fail(409, "Já há uma importação em andamento. Aguarde ela terminar.");

  let form: FormData;
  try { form = await request.formData(); } catch { return fail(400, "Envio inválido."); }
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const ufs = [...new Set(form.getAll("ufs").map(String))];
  const regimes = [...new Set(form.getAll("regimes").map(String))];
  if (!files.length) return fail(400, "Escolha os arquivos do SINAPI.");
  if (ufs.some((u) => !UFS.includes(u))) return fail(400, "UF inválida.");
  if (regimes.some((r) => !REGIMES.includes(r as SinapiRegime))) return fail(400, "Regime inválido.");

  await cleanupUploads();
  const jobId = createId();
  activeJobs.add(jobId); // reserved before anything else, so reconcileStaleJobs() leaves it alone
  try {
    const { dir, pkg } = await saveUpload(jobId, files);
    if (pkg.reference && (!ufs.length || !regimes.length)) {
      throw new ImportRequestError("Escolha ao menos uma UF e um regime para importar a SINAPI_Referência.");
    }
    await prisma.importJob.create({
      data: {
        id: jobId, origin: "SINAPI", createdById: ctx.user.id,
        ufs: pkg.reference ? ufs : [], regimes: pkg.reference ? (regimes as SinapiRegime[]) : [],
        fileNames: files.map((f) => f.name),
      },
    });
    after(() => runImportJob(jobId, dir, pkg));
    return NextResponse.json({ id: jobId });
  } catch (e) {
    activeJobs.delete(jobId);
    await cleanupUploads();
    if (e instanceof ImportRequestError) return fail(400, e.message);
    console.error(e);
    return fail(500, "Erro ao receber os arquivos.");
  }
}
