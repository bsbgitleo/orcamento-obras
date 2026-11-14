// src/app/(print)/orcamentos/[id]/proposta/page.tsx
// Proposta comercial para imprimir ou salvar como PDF (decisão #61).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require";
import { loadBudgetExport } from "@/lib/exports/budget-export";
import { brlInWords } from "@/core/extenso";
import { CATEGORY_LABEL, PROJECT_TYPE_LABEL, REGIME_LABEL, brl, dateBR, pct, refMonth } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function ProposalPage(props: PageProps<"/orcamentos/[id]/proposta">) {
  const { id } = await props.params;
  const { company } = await requireAuth();
  const d = await loadBudgetExport(company.id, id);
  if (!d) notFound();
  const c = d.company;
  const b = d.budget;
  const roots = d.lines.filter((l) => l.parentId === null);
  const number = `${d.project.code}/R${b.revision}`;
  const today = new Date();
  const missing = d.lines.filter((l) => l.kind === "SERVICE" && l.unitCost === null).length;

  return (
    <>
      <div className="toolbar-print">
        <Link className="btn secondary" href={`/orcamentos/${d.project.id}/exportar`}>Voltar</Link>
        <PrintButton />
      </div>
      <div className="sheet">
        <div className="letterhead">
          <div>
            <div className="company">{c.name}</div>
            <div className="small">{[c.document && `CNPJ ${c.document}`, c.address].filter(Boolean).join(" · ")}</div>
            <div className="small">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div><strong>Proposta comercial nº {number}</strong></div>
            <div className="small">Emitida em {dateBR(today)}</div>
          </div>
        </div>

        {d.client && <p><strong>À</strong> {d.client.name}{d.client.document ? ` — ${d.client.document}` : ""}{d.client.address ? <><br /><span className="small">{d.client.address}</span></> : null}</p>}

        <h2>1. Objeto</h2>
        <p>{d.project.name}{d.project.address ? ` — ${d.project.address}` : ""} ({d.project.uf}). {CATEGORY_LABEL[d.project.category]}, {PROJECT_TYPE_LABEL[d.project.type]?.toLowerCase()}.
          {d.project.biddingAgency ? ` ${d.project.biddingAgency}${d.project.biddingModality ? `, ${d.project.biddingModality}` : ""}${d.project.biddingNumber ? ` nº ${d.project.biddingNumber}` : ""}.` : ""}</p>

        <h2>2. Valor global</h2>
        <p className="total">{brl(b.salePrice)}</p>
        <p>({brlInWords(b.salePrice)}), com BDI de {pct(b.bdi.percent)}{b.supplyBdi ? ` (itens de mero fornecimento: ${pct(b.supplyBdi.percent)})` : ""}, conforme a planilha anexa.</p>
        {missing > 0 && <p className="small" style={{ color: "#b4232c" }}>Atenção: {missing} serviço(s) sem custo na base de preços não estão no valor.</p>}

        <table>
          <thead><tr><th style={{ width: 50 }}>Item</th><th>Etapa</th><th className="num" style={{ width: 120 }}>Valor (R$)</th><th className="num" style={{ width: 60 }}>%</th></tr></thead>
          <tbody>
            {roots.map((r) => (
              <tr key={r.id}><td>{r.item}</td><td>{r.description}</td><td className="num">{brl(r.totalPrice)}</td><td className="num">{Number(b.salePrice) ? pct((Number(r.totalPrice ?? 0) / Number(b.salePrice)) * 100) : "—"}</td></tr>
            ))}
            <tr className="stage"><td></td><td>Total</td><td className="num">{brl(b.salePrice)}</td><td className="num">100,00 %</td></tr>
          </tbody>
        </table>

        <h2>3. Condições</h2>
        <table>
          <tbody>
            <tr><th style={{ width: "32%" }}>Prazo de execução</th><td>{b.executionTerm ?? "A combinar"}</td></tr>
            <tr><th>Validade da proposta</th><td>{b.proposalValidityDays ? `${b.proposalValidityDays} dias a partir de ${dateBR(today)}` : "60 dias"}</td></tr>
            <tr><th>Condições de pagamento</th><td style={{ whiteSpace: "pre-line" }}>{b.paymentTerms ?? "Medições mensais pelo executado e aprovado."}</td></tr>
            <tr><th>Base de preços</th><td>{b.base.origin} {b.base.uf} {refMonth(b.base.referenceMonth)} — {REGIME_LABEL[b.base.regime]}{d.lines.some((l) => l.source === "Própria") ? "; composições próprias precificadas na mesma base" : ""}</td></tr>
          </tbody>
        </table>
        {b.proposalNotes && (<><h2>4. Observações</h2><p style={{ whiteSpace: "pre-line" }}>{b.proposalNotes}</p></>)}

        <div className="sign">
          <div className="line" />
          <div><strong>{c.technicalLead ?? c.name}</strong></div>
          <div className="small">{[c.technicalRegistry, c.technicalLead ? c.name : null].filter(Boolean).join(" · ")}</div>
        </div>
      </div>

      <div className="sheet">
        <h1>Anexo — Planilha orçamentária sintética</h1>
        <p className="small">Proposta nº {number} · {d.project.name} · base {b.base.origin} {b.base.uf} {refMonth(b.base.referenceMonth)} — {REGIME_LABEL[b.base.regime]} · BDI {pct(b.bdi.percent)}</p>
        <table>
          <thead><tr><th>Item</th><th>Código</th><th>Fonte</th><th>Descrição</th><th>Und</th><th className="num">Quant.</th><th className="num">Preço unit.</th><th className="num">Preço total</th></tr></thead>
          <tbody>
            {d.lines.map((l) => l.kind === "STAGE" ? (
              <tr key={l.id} className="stage"><td>{l.item}</td><td colSpan={6} style={{ paddingLeft: 5 + (l.level - 1) * 10 }}>{l.description}</td><td className="num">{brl(l.totalPrice)}</td></tr>
            ) : (
              <tr key={l.id}><td>{l.item}</td><td>{l.compositionCode}</td><td>{l.source}</td><td>{l.description}{l.unitCost === null ? " (sem custo)" : ""}</td><td>{l.unit}</td><td className="num">{l.quantity?.replace(".", ",")}</td><td className="num">{brl(l.unitPrice)}</td><td className="num">{brl(l.totalPrice)}</td></tr>
            ))}
            <tr className="stage"><td></td><td colSpan={6}>Total geral (com BDI)</td><td className="num">{brl(b.salePrice)}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
