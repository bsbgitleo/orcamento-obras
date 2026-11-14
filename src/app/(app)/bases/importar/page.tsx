// src/app/(app)/bases/importar/page.tsx
// Platform administrator only (decisão #45).
import Link from "next/link";
import { requireAuth } from "@/lib/auth/require";
import { hasActiveImport } from "@/lib/imports/jobs";
import { prisma } from "@/lib/prisma";
import { UFS } from "@/lib/format";
import { SinapiImportForm } from "@/components/sinapi-import-form";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { user } = await requireAuth();
  if (!user.isPlatformAdmin) {
    return (
      <>
        <h1>Importar base oficial</h1>
        <div className="empty">As bases oficiais (SINAPI) são compartilhadas por todas as empresas e só o administrador da plataforma pode importá-las.</div>
      </>
    );
  }
  if (await hasActiveImport()) {
    const running = await prisma.importJob.findFirst({ where: { status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "desc" } });
    return (
      <>
        <h1>Importar base oficial</h1>
        <div className="empty">Já há uma importação em andamento. {running && <Link href={`/bases/importacoes/${running.id}`}>Acompanhar</Link>}</div>
      </>
    );
  }
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>Importar base oficial — SINAPI ou SICRO</h1>
        <Link className="btn secondary" href="/bases">Voltar</Link>
      </div>
      <SinapiImportForm ufs={UFS} defaultUfs={["DF"]} />
    </>
  );
}
