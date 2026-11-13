// src/lib/auth/roles.test.ts
import { describe, expect, it } from "vitest";
import { canEdit, canManage } from "./roles";

describe("roles", () => {
  it("gestor edita e administra; orçamentista só edita; leitura nada", () => {
    expect([canEdit("MANAGER"), canManage("MANAGER")]).toEqual([true, true]);
    expect([canEdit("ESTIMATOR"), canManage("ESTIMATOR")]).toEqual([true, false]);
    expect([canEdit("VIEWER"), canManage("VIEWER")]).toEqual([false, false]);
  });
});
