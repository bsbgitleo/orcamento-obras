// src/app/(app)/bases/importacoes/[id]/page.tsx
// Progress and result of one import (platform administrator only).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require";
import { reconcileStaleJobs } from "@/lib/imports/jobs";
import { prisma } from "@/lib/prisma";
import { IMPORT_STATUS_LABEL, REGIME_LABEL, dateTimeBR, refMonth } from "@/lib/format";
import { ImportProgress } from "@/components/import-progress";
import type { SinapiImportResult } from "@/import/sinapi/run-import";

export const dynamic = "force-dynamic";

export default async function ImportJobPage(props: PageProps<"/bases/importacoes/[id]">) {
  const { id } = await props.params;
  const { user } = await requireAuth();
  if (!user.isPlatformAdmin) notFound();
  await reconcileStaleJobs();
  const job = await prisma.importJob.findUnique({ where: { id }, include: { createdBy: { select: { name: true } } } });
  if (!job) notFound();
  const running = job.status === "QUEUED" || job.status === "RUNNING";
  const result = job.result as SinapiImportResult | null;
  const badge = job.status === "DONE" ? (job.error ? "warn" : "ok") : job.status === "FAILED" ? "danger" : "";

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Importação {job.origin} <span className={`badge ${badge}`}>{IMPORT_STATUS_LABEL[job.status]}{running ? "…" : ""}</span></h1>
        <Link className="btn secondary" href="/bases">Tabelas importadas</Link>
      </div>

      <div className="card">
        <dl className="kv">
          <dt>Enviada por</dt><dd>{job.createdBy.name} em {dateTimeBR(job.createdAt)}</dd>
          <dt>Arquivos</dt><dd>{job.fileNames.join(", ")}</dd>
          {job.ufs.length > 0 && <><dt>UFs</dt><dd>{job.ufs.join(", ")}</dd></>}
          {job.regimes.length > 0 && <><dt>Regimes</dt><dd>{job.regimes.map((r) => REGIME_LABEL[r]).join(", ")}</dd></>}
          <dt>Início / fim</dt><dd>{dateTimeBR(job.startedAt)} — {running ? "em andamento" : dateTimeBR(job.finishedAt)}</dd>
        </dl>
        {job.error && <div className="form-error" style={{ marginTop: 12, marginBottom: 0 }}>{job.error}</div>}
      </div>

      {result && result.tables.length > 0 && (
        <table className="list" style={{ marginBottom: 18 }}>
          <thead><tr><th>UF</th><th>Regime</th><th>Referência</th><th>Situação</th><th className="num">Insumos</th><th className="num">Composições</th><th className="num">Sem custo</th><th>Conferência com o publicado</th><th className="num">Tempo</th></tr></thead>
          <tbody>
            {result.tables.map((t) => (
              <tr key={`${t.uf}-${t.regime}`}>
                <td>{t.uf}</td>
                <td>{REGIME_LABEL[t.regime]}</td>
                <td>{t.referenceMonth ? refMonth(t.referenceMonth) : "—"}</td>
                <td>
                  {t.status === "IMPORTED" ? <span className="badge ok">importada</span> : t.status === "BLOCKED" ? <span className="badge warn">bloqueada</span> : <span className="badge danger">erro</span>}
                  {t.message && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{t.message}</div>}
                </td>
                <td className="num">{t.inputs?.toLocaleString("pt-BR") ?? "—"}</td>
                <td className="num">{t.compositions?.toLocaleString("pt-BR") ?? "—"}</td>
                <td className="num">{t.withoutCost?.toLocaleString("pt-BR") ?? "—"}</td>
                <td>{t.mismatches === undefined ? (t.status === "IMPORTED" ? <span className="muted">sem custo publicado</span> : "—") : t.mismatches === 0 ? "todos os custos iguais" : <span className="badge danger">{t.mismatches} diferente(s)</span>}</td>
                <td className="num">{t.seconds === undefined ? "—" : `${t.seconds.toLocaleString("pt-BR")} s`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {result?.maintenance && (
        <div className="card">
          <strong>Manutenções do SINAPI: </strong>
          {result.maintenance.error ? <span className="badge danger">erro</span>
            : result.maintenance.status === "replaced" ? <>relatório de {refMonth(result.maintenance.fileMonth)} gravado ({result.maintenance.rows.toLocaleString("pt-BR")} registros)</>
            : <>não alterado: já havia o relatório de {result.maintenance.previousFileMonth ? refMonth(result.maintenance.previousFileMonth) : "—"}, mais novo que o enviado</>}
          {result.maintenance.error && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{result.maintenance.error}</div>}
        </div>
      )}

      <ImportProgress key={job.status} jobId={job.id} initialStatus={job.status} initialLog={job.log} />
    </>
  );
}
