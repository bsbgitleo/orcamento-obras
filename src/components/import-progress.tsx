// src/components/import-progress.tsx
// Live log of a running import. Polls a small JSON endpoint (one request at a
// time, 10 s timeout) instead of re-rendering the whole page, so a slow answer
// while the server is busy importing never stops the updates. When the job
// ends, the page is refreshed once to show the result tables.
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const RUNNING = new Set(["QUEUED", "RUNNING"]);

export function ImportProgress({ jobId, initialStatus, initialLog }: { jobId: string; initialStatus: string; initialLog: string }) {
  const router = useRouter();
  const [log, setLog] = useState(initialLog);
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    if (!RUNNING.has(initialStatus)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 10_000);
      try {
        const r = await fetch(`/api/bases/importacoes/${jobId}`, { cache: "no-store", signal: ctrl.signal });
        if (r.ok) {
          const job = (await r.json()) as { status: string; log: string };
          if (stopped) return;
          setLog(job.log);
          setStatus(job.status);
          if (!RUNNING.has(job.status)) { router.refresh(); return; }
        }
      } catch { /* timeout or network: try again */ } finally { clearTimeout(timeout); }
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 1500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [jobId, initialStatus, router]);

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Registro {RUNNING.has(status) && <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· atualizando a cada 2 s</span>}</h2>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, margin: 0, maxHeight: 420, overflow: "auto" }}>{log || "Aguardando o início…"}</pre>
    </div>
  );
}
