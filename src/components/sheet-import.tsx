// src/components/sheet-import.tsx
// Importação de planilha .xlsx: arquivo → aba e colunas (sugeridas) → tipo de
// preço → pré-visualização com o vínculo de cada código → importar.
"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { importSheetAction, lookupCodesAction, readSheetAction, type CodeMatch, type ImportReport } from "@/lib/actions/sheet-import";
import { ROLE_LABEL, cellText, detectLayout, interpretRows, sourceOrigin, type Cell, type ColumnRole, type PriceMode } from "@/core/sheet-import";
import { brl } from "@/lib/format";

interface Sheet { name: string; rows: Cell[][]; score: number }

const ROLES = Object.keys(ROLE_LABEL) as ColumnRole[];

export function SheetImport({ budgetId, projectId, bdiPercent, baseOrigin, baseLabel }: {
  budgetId: string; projectId: string; bdiPercent: string; baseOrigin: string; baseLabel: string;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [priceMode, setPriceMode] = useState<PriceMode>("COST");
  const [matches, setMatches] = useState<Record<string, CodeMatch>>({});
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, start] = useTransition();

  const sheet = sheets[sheetIdx];
  const applyLayout = (s: Sheet | undefined) => {
    const l = s ? detectLayout(s.rows) : null;
    setHeaderRow(l?.headerRow ?? 0);
    setRoles(l?.roles ?? (s?.rows[0] ?? []).map(() => "ignore" as ColumnRole));
    setPriceMode(l?.priceMode ?? "COST");
  };

  function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await readSheetAction(budgetId, fd);
      if (!r.ok) { setError(r.message); return; }
      const best = r.sheets.reduce((bi, s, i, all) => (s.score > all[bi].score ? i : bi), 0);
      setFileName(r.fileName); setSheets(r.sheets); setSheetIdx(best); applyLayout(r.sheets[best]);
    });
  }

  const lines = useMemo(() => (sheet && roles.includes("description") ? interpretRows(sheet.rows, { headerRow, roles }) : []), [sheet, headerRow, roles]);
  const codes = useMemo(() => [...new Set(lines.flatMap((l) => (l.code ? [l.code] : [])))].sort().join("|"), [lines]);
  useEffect(() => {
    if (!codes) return;
    let stale = false;
    lookupCodesAction(budgetId, codes.split("|")).then((m) => { if (!stale) setMatches(m); });
    return () => { stale = true; };
  }, [budgetId, codes]);

  const status = (l: (typeof lines)[number]) => {
    if (l.kind === "STAGE") return null;
    const origin = sourceOrigin(l.source);
    const off = l.code && origin !== "PROPRIA" && (origin === null || origin === baseOrigin) ? matches[`OFFICIAL:${l.code}`] : undefined;
    if (off) return { badge: "ok", text: `${baseOrigin} ${off.code}`, cost: off.unitCost };
    const own = l.code ? matches[`OWN:${l.code}`] : undefined;
    if (own) return { badge: "ok", text: `própria ${own.code}`, cost: null };
    if (l.price && priceMode !== "IGNORE" && Number(l.price) > 0) return { badge: "warn", text: "nova composição própria", cost: null };
    return { badge: "danger", text: "sem custo", cost: null };
  };
  const counts = lines.reduce((a, l) => {
    const s = status(l);
    if (!s) a.stages++; else if (s.badge === "ok") a.linked++; else if (s.badge === "warn") a.created++; else a.none++;
    return a;
  }, { stages: 0, linked: 0, created: 0, none: 0 });
  const services = lines.length - counts.stages;
  const sheetCost = (p: string | null) => (p === null ? null : priceMode === "WITH_BDI" ? (Number(p) / (1 + Number(bdiPercent) / 100)).toFixed(2) : p);

  function doImport() {
    setError(null);
    start(async () => {
      const r = await importSheetAction(budgetId, { fileName, priceMode, lines });
      if (!r.ok) { setError(r.message); return; }
      setReport(r.report);
    });
  }

  if (report) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Planilha importada</h2>
        <ul>
          <li>{report.stages} etapa(s) e {report.services} serviço(s).</li>
          <li>{report.linkedOfficial} vinculado(s) a composições da base{report.linkedOwn ? ` e ${report.linkedOwn} a composições próprias existentes` : ""}.</li>
          {report.createdOwn > 0 && <li>{report.createdOwn} composição(ões) própria(s) criada(s) com o preço da planilha (grupo “Importadas”, em Composições próprias).</li>}
          {report.withoutCost > 0 && <li>{report.withoutCost} serviço(s) sem custo: escolha a composição na planilha do orçamento.</li>}
        </ul>
        {report.priceDiffs.length > 0 && (
          <>
            <p><strong>{report.priceDiffs.length} serviço(s) vinculado(s) pelo código com custo diferente do da planilha</strong> (vale o custo da base):</p>
            <table className="list"><thead><tr><th>Item</th><th>Código</th><th className="num">Custo na planilha</th><th className="num">Custo na base</th></tr></thead>
              <tbody>{report.priceDiffs.slice(0, 50).map((d, i) => <tr key={i}><td>{d.item}</td><td className="mono">{d.code}</td><td className="num">{brl(d.sheet)}</td><td className="num">{brl(d.base)}</td></tr>)}</tbody>
            </table>
          </>
        )}
        <div className="actions"><Link className="btn" href={`/orcamentos/${report.projectId}`}>Abrir o orçamento</Link></div>
      </div>
    );
  }

  return (
    <>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={upload} className="card">
        <div className="field">
          <label htmlFor="file">Planilha orçamentária (.xlsx)</label>
          <input id="file" name="file" type="file" accept=".xlsx" disabled={pending} />
          <span className="hint">Qualquer planilha com descrição, unidade e quantidade. A exportação do app e o modelo de homogeneização das proponentes são reconhecidos automaticamente.</span>
        </div>
        <div className="actions"><button className="btn" type="submit" disabled={pending}>{pending && !sheets.length ? "Lendo…" : "Ler planilha"}</button></div>
      </form>

      {sheet && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Como ler <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {fileName}</span></h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ minWidth: 220 }}>
              <label htmlFor="sheet">Aba</label>
              <select id="sheet" value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); applyLayout(sheets[i]); }}>
                {sheets.map((s, i) => <option key={i} value={i}>{s.name}{s.score ? "" : " (sem cabeçalho reconhecido)"}</option>)}
              </select>
            </div>
            <div className="field" style={{ width: 160 }}>
              <label htmlFor="header">Linha do cabeçalho</label>
              <input id="header" type="number" min={1} max={sheet.rows.length} value={headerRow + 1} onChange={(e) => setHeaderRow(Math.max(0, Number(e.target.value) - 1))} />
            </div>
            <fieldset style={{ padding: "6px 12px 8px" }}>
              <legend>Coluna de preço</legend>
              {([["COST", "custo, sem BDI"], ["WITH_BDI", `preço com BDI (÷ ${(1 + Number(bdiPercent) / 100).toFixed(4).replace(".", ",")})`], ["IGNORE", "ignorar preços"]] as const).map(([v, l]) => (
                <label key={v} className="checkbox" style={{ fontWeight: 400 }}><input type="radio" name="priceMode" checked={priceMode === v} onChange={() => setPriceMode(v)} /> {l}</label>
              ))}
            </fieldset>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="list" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>{roles.map((r, i) => (
                  <th key={i} style={{ minWidth: 120 }}>
                    <select value={r} onChange={(e) => setRoles(roles.map((x, j) => (j === i ? (e.target.value as ColumnRole) : x === e.target.value && e.target.value !== "ignore" ? "ignore" : x)))} aria-label={`Papel da coluna ${i + 1}`} style={{ fontSize: 12 }}>
                      {ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
                    </select>
                  </th>
                ))}</tr>
              </thead>
              <tbody>
                {sheet.rows.slice(headerRow, headerRow + 4).map((row, ri) => (
                  <tr key={ri} style={ri === 0 ? { fontWeight: 600 } : undefined}>{roles.map((_, ci) => <td key={ci} style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cellText(row[ci] ?? null)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>Primeira linha acima = cabeçalho. Ajuste o papel de cada coluna se precisar; a pré-visualização abaixo se atualiza na hora.</p>
        </div>
      )}

      {sheet && (
        <div className="card">
          <div className="toolbar">
            <h2 style={{ margin: 0 }}>Pré-visualização</h2>
            <button className="btn" type="button" disabled={pending || !services} onClick={doImport}>{pending ? "Importando…" : `Importar ${counts.stages} etapa(s) e ${services} serviço(s)`}</button>
          </div>
          {!roles.includes("description") ? <div className="empty">Indique qual coluna é a descrição.</div> : (
            <>
              <p style={{ marginTop: 0 }}>
                <span className="badge ok">{counts.linked} com composição</span>{" "}
                {counts.created > 0 && <span className="badge warn">{counts.created} nova(s) composição(ões) própria(s)</span>}{" "}
                {counts.none > 0 && <span className="badge danger">{counts.none} sem custo</span>}
                <span className="muted" style={{ fontSize: 13 }}> · base {baseLabel}; códigos procurados nela e nas suas composições próprias.</span>
              </p>
              <table className="list" style={{ fontSize: 13 }}>
                <thead><tr><th>Linha</th><th>Item</th><th>Código</th><th>Descrição</th><th>Und</th><th className="num">Quant.</th><th className="num">Custo da planilha</th><th>Vínculo</th></tr></thead>
                <tbody>
                  {lines.slice(0, 300).map((l, i) => {
                    const s = status(l);
                    const depth = (() => { let d = 0, p = l.parent; while (p !== null && d < 6) { d++; p = lines[p]?.parent ?? null; } return d; })();
                    return l.kind === "STAGE" ? (
                      <tr key={i} style={{ background: "#f4f6f8", fontWeight: 600 }}><td className="muted">{l.row || ""}</td><td>{l.item}</td><td></td><td colSpan={5} style={{ paddingLeft: 12 + depth * 16 }}>{l.description}</td></tr>
                    ) : (
                      <tr key={i}>
                        <td className="muted">{l.row}</td><td>{l.item}</td><td className="mono">{l.code}</td>
                        <td style={{ paddingLeft: 12 + depth * 16 }}>{l.description}{l.requiresBrand && <span className="badge" style={{ marginLeft: 6 }}>exige marca</span>}</td>
                        <td>{l.unit}</td><td className="num">{l.quantity?.replace(".", ",")}</td>
                        <td className="num">{priceMode === "IGNORE" ? "—" : brl(sheetCost(l.price))}</td>
                        <td>{s && <span className={`badge ${s.badge}`}>{s.text}</span>}{s?.cost && <div className="muted" style={{ fontSize: 12 }}>custo na base {brl(s.cost)}</div>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {lines.length > 300 && <p className="muted">Mostrando 300 de {lines.length} linhas; todas serão importadas.</p>}
            </>
          )}
        </div>
      )}
      <p className="muted"><Link href={`/orcamentos/${projectId}`}>Voltar ao orçamento</Link></p>
    </>
  );
}
