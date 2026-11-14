// src/components/sinapi-import-form.tsx
// Upload of the SINAPI files (or the Caixa ZIP) with UF and regime choice.
// Uses XMLHttpRequest to show upload progress, then opens the job page.
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const REGIMES: { value: string; label: string }[] = [
  { value: "NAO_DESONERADO", label: "Sem desoneração (padrão)" },
  { value: "DESONERADO", label: "Com desoneração" },
  { value: "SEM_ENCARGOS", label: "Sem encargos sociais" },
];

export function SinapiImportForm({ ufs, defaultUfs }: { ufs: string[]; defaultUfs: string[] }) {
  const router = useRouter();
  const [selectedUfs, setSelectedUfs] = useState<string[]>(defaultUfs);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const toggleUf = (uf: string) => setSelectedUfs((s) => (s.includes(uf) ? s.filter((x) => x !== uf) : [...s, uf].sort()));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    if (!data.getAll("files").some((f) => f instanceof File && f.size > 0)) { setError("Escolha os arquivos da base oficial."); return; }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/bases/importacoes");
    xhr.responseType = "json";
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100)); };
    xhr.onload = () => {
      const body = xhr.response as { id?: string; error?: string } | null;
      if (xhr.status === 200 && body?.id) { router.push(`/bases/importacoes/${body.id}`); return; }
      setProgress(null);
      setError(body?.error ?? `Erro ${xhr.status} ao enviar os arquivos.`);
    };
    xhr.onerror = () => { setProgress(null); setError("Falha de conexão ao enviar os arquivos."); };
    setProgress(0);
    xhr.send(data);
  }

  const sending = progress !== null;
  return (
    <form onSubmit={submit} className="card">
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label htmlFor="files">Arquivos da base oficial</label>
        <input id="files" name="files" type="file" multiple accept=".zip,.xlsx,.pdf" disabled={sending} />
        <span className="hint">
          <strong>SINAPI:</strong> o ZIP da Caixa como foi baixado (ex.: SINAPI-2026-10-formato-xlsx.zip) ou as planilhas soltas
          (SINAPI_Referência, SINAPI_mao_de_obra, SINAPI_Manutenções), reconhecidas pelas abas.{" "}
          <strong>SICRO:</strong> os relatórios .xlsx do DNIT de uma UF (Analítico e Sintético de Composições, Sintéticos de Materiais,
          Mão de Obra e Equipamentos, com e sem desoneração, e Origem de Preços), soltos ou num ZIP; os PDFs podem ir junto e são ignorados.
        </span>
      </div>

      <fieldset style={{ marginTop: 16 }}>
        <legend>UFs a importar ({selectedUfs.length})</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 6 }}>
          {ufs.map((uf) => (
            <label key={uf} className="checkbox">
              <input type="checkbox" name="ufs" value={uf} checked={selectedUfs.includes(uf)} onChange={() => toggleUf(uf)} disabled={sending} /> {uf}
            </label>
          ))}
        </div>
        <span className="hint muted" style={{ fontSize: 12 }}>Cada UF e regime leva cerca de 10 segundos. Todas as UFs nos três regimes: perto de 15 minutos.</span>
      </fieldset>

      <fieldset style={{ marginTop: 16 }}>
        <legend>Regimes</legend>
        {REGIMES.map((r) => (
          <label key={r.value} className="checkbox">
            <input type="checkbox" name="regimes" value={r.value} defaultChecked disabled={sending} /> {r.label}
          </label>
        ))}
      </fieldset>

      <p className="muted" style={{ fontSize: 13 }}>
        A base de um mês que já tenha orçamentos ligados a ela não é reimportada: essa UF e esse regime são pulados e aparecem como bloqueados no relatório.
        SINAPI: as UFs e os regimes marcados valem para a SINAPI_Referência; as Manutenções são nacionais.
        SICRO: a UF vem do nome dos relatórios (ex.: “DF 07-2026 …”) e valem os regimes sem e com desoneração.
      </p>
      <div className="actions" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" className="btn" disabled={sending}>{sending ? "Enviando…" : "Importar"}</button>
        {sending && <span className="muted">{progress === 100 ? "Arquivos enviados; conferindo…" : `Enviando ${progress} %`}</span>}
      </div>
    </form>
  );
}
