// src/lib/exports/download.ts
import "server-only";
import { NextResponse } from "next/server";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** File response with an ASCII fallback name and the UTF-8 name (RFC 6266). */
export function xlsxResponse(buffer: Buffer, filename: string): NextResponse {
  const ascii = filename.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
