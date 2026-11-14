// src/components/print-button.tsx
"use client";
export function PrintButton() {
  return <button type="button" className="btn" onClick={() => window.print()}>Imprimir / Salvar como PDF</button>;
}
