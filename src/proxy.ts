// src/proxy.ts
// Passes the request pathname to server layouts (used to force the password
// change for invited users without redirect loops).
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // The SINAPI upload is excluded: the proxy buffers request bodies only up to
  // 10 MB (proxyClientMaxBodySize) and the Caixa files are larger.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/bases/importacoes).*)"],
};
