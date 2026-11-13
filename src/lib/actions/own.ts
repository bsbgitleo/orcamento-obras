// src/lib/actions/own.ts
// The company's own base: own inputs (quoted price, source and date) and own
// compositions whose official items are kept by code (decisões #51–#53).
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parseForm, type ActionState } from "@/lib/forms";
import { requireActionAuth, requireEditor } from "@/lib/auth/require";
import { coefficientSchema, ownCompositionSchema, ownInputSchema, ownItemSchema } from "@/lib/schemas/own";
import { wouldCreateCycle, type OwnCompositionDef } from "@/core/own-composition";
import { ownDefFromRow } from "@/lib/pricing/budget-catalog";
import { likePattern, tokenize } from "@/lib/compositions/search";

function duplicateCode(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// ─── Insumos próprios ───

export async function saveOwnInput(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(ownInputSchema, fd);
  if (!r.ok) return r.state;
  try {
    if (id) {
      const { count } = await prisma.ownInput.updateMany({ where: { id, companyId: ctx.company.id }, data: r.data });
      if (count === 0) return { status: "error", message: "Insumo não encontrado." };
    } else {
      await prisma.ownInput.create({ data: { ...r.data, companyId: ctx.company.id } });
    }
  } catch (e) {
    if (duplicateCode(e)) return { status: "error", message: "Já existe um insumo próprio com esse código.", fieldErrors: { code: "Código já usado" }, values: r.values };
    throw e;
  }
  revalidatePath("/insumos-proprios");
  revalidatePath("/composicoes-proprias", "layout");
  redirect("/insumos-proprios");
}

export async function deleteOwnInput(id: string): Promise<ActionState> {
  const ctx = await requireEditor();
  const used = await prisma.ownCompositionItem.findMany({
    where: { ownInputId: id, composition: { companyId: ctx.company.id } },
    select: { composition: { select: { code: true } } }, distinct: ["compositionId"],
  });
  if (used.length) return { status: "error", message: `Insumo usado nas composições ${used.map((u) => u.composition.code).join(", ")}; retire-o delas antes de excluir.` };
  await prisma.ownInput.deleteMany({ where: { id, companyId: ctx.company.id } });
  revalidatePath("/insumos-proprios");
  redirect("/insumos-proprios");
}

// ─── Composições próprias ───

/** Creates an own composition, empty or as a copy of an official one (items kept by code). */
export async function createOwnComposition(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(ownCompositionSchema, fd);
  if (!r.ok) return r.state;
  const { copyFromTableId, copyFromCode, ...rest } = r.data;
  const data = { ...rest, description: rest.description ?? "", unit: rest.unit ?? "" };

  let items: Prisma.OwnCompositionItemCreateWithoutCompositionInput[] = [];
  let derived: { derivedFromOrigin: "SINAPI" | "SICRO"; derivedFromCode: string } | null = null;
  if (copyFromCode) {
    const table = copyFromTableId
      ? await prisma.priceTable.findFirst({ where: { id: copyFromTableId, OR: [{ companyId: null }, { companyId: ctx.company.id }] } })
      : null;
    if (!table) return { status: "error", message: "Escolha a base de onde copiar.", fieldErrors: { copyFromTableId: "Obrigatório" }, values: r.values };
    const source = await prisma.composition.findFirst({
      where: { priceTableId: table.id, code: copyFromCode },
      include: { items: { include: { input: true, childComposition: true } } },
    });
    if (!source) return { status: "error", message: `A composição ${copyFromCode} não existe na base escolhida.`, fieldErrors: { copyFromCode: "Não encontrada" }, values: r.values };
    const origin = table.origin === "SICRO" ? "SICRO" : "SINAPI";
    derived = { derivedFromOrigin: origin, derivedFromCode: source.code };
    if (!data.description) data.description = source.description;
    if (!data.unit) data.unit = source.unit;
    items = source.items.flatMap((it, position) => {
      const ref = it.type === "INSUMO" ? it.input : it.childComposition;
      if (!ref) return []; // item sem vínculo no SINAPI (raro); não dá para copiar
      return [{
        position, type: it.type === "INSUMO" ? "OFFICIAL_INPUT" as const : "OFFICIAL_COMPOSITION" as const,
        officialOrigin: origin, officialCode: ref.code, officialDescription: ref.description, officialUnit: ref.unit,
        coefficient: it.coefficient,
      }];
    });
  }

  let id: string;
  try {
    const created = await prisma.ownComposition.create({
      data: { ...data, ...derived, companyId: ctx.company.id, items: { create: items } },
    });
    id = created.id;
  } catch (e) {
    if (duplicateCode(e)) return { status: "error", message: "Já existe uma composição própria com esse código.", fieldErrors: { code: "Código já usado" }, values: r.values };
    throw e;
  }
  revalidatePath("/composicoes-proprias");
  redirect(`/composicoes-proprias/${id}${copyFromTableId ? `?base=${copyFromTableId}` : ""}`);
}

export async function updateOwnComposition(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(ownCompositionSchema, fd);
  if (!r.ok) return r.state;
  const { code, group, justification } = r.data;
  const description = r.data.description ?? "";
  const unit = r.data.unit ?? "";
  try {
    const { count } = await prisma.ownComposition.updateMany({ where: { id, companyId: ctx.company.id }, data: { code, description, unit, group, justification } });
    if (count === 0) return { status: "error", message: "Composição não encontrada." };
  } catch (e) {
    if (duplicateCode(e)) return { status: "error", message: "Já existe uma composição própria com esse código.", fieldErrors: { code: "Código já usado" }, values: r.values };
    throw e;
  }
  revalidatePath("/composicoes-proprias", "layout");
  return { status: "ok", message: "Dados salvos." };
}

export async function deleteOwnComposition(id: string): Promise<ActionState> {
  const ctx = await requireEditor();
  const [services, parents] = await Promise.all([
    prisma.wbsNode.count({ where: { ownCompositionId: id, budget: { project: { companyId: ctx.company.id } } } }),
    prisma.ownCompositionItem.findMany({ where: { ownCompositionId: id, composition: { companyId: ctx.company.id } }, select: { composition: { select: { code: true } } }, distinct: ["compositionId"] }),
  ]);
  if (services) return { status: "error", message: `Composição usada em ${services} serviço(s) de orçamentos; retire-a deles antes de excluir.` };
  if (parents.length) return { status: "error", message: `Composição usada dentro de ${parents.map((p) => p.composition.code).join(", ")}; retire-a delas antes de excluir.` };
  await prisma.ownComposition.deleteMany({ where: { id, companyId: ctx.company.id } });
  revalidatePath("/composicoes-proprias");
  redirect("/composicoes-proprias");
}

async function ownCompositionOf(companyId: string, id: string) {
  const c = await prisma.ownComposition.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!c) throw new Error("Composição não encontrada.");
  return c;
}

/**
 * Adds an item. `ref` is the official CODE (official items), or the id of the
 * own input / own composition. Official items are checked in `tableId` (the
 * reference base shown on the page) to store description and unit.
 */
export async function addOwnItem(compositionId: string, tableId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  await ownCompositionOf(ctx.company.id, compositionId);
  const r = parseForm(ownItemSchema, fd);
  if (!r.ok) return r.state;
  const { type, ref, coefficient } = r.data;
  const last = await prisma.ownCompositionItem.findFirst({ where: { compositionId }, orderBy: { position: "desc" }, select: { position: true } });
  const position = (last?.position ?? -1) + 1;

  if (type === "OFFICIAL_INPUT" || type === "OFFICIAL_COMPOSITION") {
    const table = tableId ? await prisma.priceTable.findFirst({ where: { id: tableId, OR: [{ companyId: null }, { companyId: ctx.company.id }] } }) : null;
    if (!table) return { status: "error", message: "Escolha uma base de referência para buscar itens oficiais." };
    const found = type === "OFFICIAL_INPUT"
      ? await prisma.input.findFirst({ where: { priceTableId: table.id, code: ref } })
      : await prisma.composition.findFirst({ where: { priceTableId: table.id, code: ref } });
    if (!found) return { status: "error", message: `Código ${ref} não encontrado na base ${table.origin} ${table.uf} ${table.referenceMonth}.` };
    await prisma.ownCompositionItem.create({
      data: {
        compositionId, position, type, coefficient, officialOrigin: table.origin === "SICRO" ? "SICRO" : "SINAPI",
        officialCode: found.code, officialDescription: found.description, officialUnit: found.unit,
      },
    });
  } else if (type === "OWN_INPUT") {
    const input = await prisma.ownInput.findFirst({ where: { id: ref, companyId: ctx.company.id } });
    if (!input) return { status: "error", message: "Insumo próprio não encontrado." };
    await prisma.ownCompositionItem.create({ data: { compositionId, position, type, coefficient, ownInputId: input.id } });
  } else {
    const all = await prisma.ownComposition.findMany({ where: { companyId: ctx.company.id }, include: { items: true } });
    const byId = new Map<string, OwnCompositionDef>(all.map((c) => [c.id, ownDefFromRow(c)]));
    if (!byId.has(ref)) return { status: "error", message: "Composição própria não encontrada." };
    if (wouldCreateCycle(compositionId, ref, byId)) return { status: "error", message: "Essa composição já contém (direta ou indiretamente) a composição atual; incluí-la criaria uma referência circular." };
    await prisma.ownCompositionItem.create({ data: { compositionId, position, type, coefficient, ownCompositionId: ref } });
  }
  await prisma.ownComposition.update({ where: { id: compositionId }, data: { updatedAt: new Date() } });
  revalidatePath(`/composicoes-proprias/${compositionId}`);
  return { status: "ok" };
}

async function itemOf(companyId: string, itemId: string) {
  const it = await prisma.ownCompositionItem.findFirst({ where: { id: itemId, composition: { companyId } } });
  if (!it) throw new Error("Item não encontrado.");
  return it;
}

export async function updateOwnItemCoefficient(itemId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(coefficientSchema, fd);
  if (!r.ok) return r.state;
  const it = await itemOf(ctx.company.id, itemId);
  await prisma.ownCompositionItem.update({ where: { id: itemId }, data: { coefficient: r.data.coefficient } });
  await prisma.ownComposition.update({ where: { id: it.compositionId }, data: { updatedAt: new Date() } });
  revalidatePath(`/composicoes-proprias/${it.compositionId}`);
  return { status: "ok" };
}

export async function removeOwnItem(itemId: string): Promise<void> {
  const ctx = await requireEditor();
  const it = await itemOf(ctx.company.id, itemId);
  await prisma.ownCompositionItem.delete({ where: { id: itemId } });
  await prisma.ownComposition.update({ where: { id: it.compositionId }, data: { updatedAt: new Date() } });
  revalidatePath(`/composicoes-proprias/${it.compositionId}`);
}

export async function moveOwnItem(itemId: string, direction: "UP" | "DOWN"): Promise<void> {
  const ctx = await requireEditor();
  const it = await itemOf(ctx.company.id, itemId);
  const neighbour = await prisma.ownCompositionItem.findFirst({
    where: { compositionId: it.compositionId, position: direction === "UP" ? { lt: it.position } : { gt: it.position } },
    orderBy: { position: direction === "UP" ? "desc" : "asc" },
  });
  if (!neighbour) return;
  await prisma.$transaction([
    prisma.ownCompositionItem.update({ where: { id: it.id }, data: { position: neighbour.position } }),
    prisma.ownCompositionItem.update({ where: { id: neighbour.id }, data: { position: it.position } }),
  ]);
  revalidatePath(`/composicoes-proprias/${it.compositionId}`);
}

// ─── Busca para incluir itens ───

export interface ItemHit { ref: string; code: string; description: string; unit: string; price: string | null; detail?: string }

/** Search for the item picker of an own composition. */
export async function searchOwnItemCandidates(
  compositionId: string, tableId: string | null,
  type: "OFFICIAL_INPUT" | "OFFICIAL_COMPOSITION" | "OWN_INPUT" | "OWN_COMPOSITION", query: string,
): Promise<ItemHit[]> {
  const ctx = await requireActionAuth();
  const q = query.trim();
  if (q.length < 2) return [];
  const numeric = /^\d+$/.test(q);
  const words = tokenize(q);
  const textFilter = (field: "description") => words.map((w) => Prisma.sql`unaccent(${Prisma.raw(`"${field}"`)}) ILIKE unaccent(${likePattern(w, "contains")})`);

  if (type === "OFFICIAL_INPUT" || type === "OFFICIAL_COMPOSITION") {
    if (!tableId) return [];
    const table = await prisma.priceTable.findFirst({ where: { id: tableId, OR: [{ companyId: null }, { companyId: ctx.company.id }] }, select: { id: true } });
    if (!table) return [];
    const where = numeric ? [Prisma.sql`code LIKE ${likePattern(q, "prefix")}`] : textFilter("description");
    const rows = type === "OFFICIAL_INPUT"
      ? await prisma.$queryRaw<{ code: string; description: string; unit: string; price: Prisma.Decimal | null; detail: string | null }[]>`
          SELECT code, description, unit, "unitPrice" AS price, "priceFallbackUf" AS detail FROM "Input"
          WHERE "priceTableId" = ${table.id} AND ${Prisma.join(where, " AND ")} ORDER BY (code = ${q}) DESC, code LIMIT 30`
      : await prisma.$queryRaw<{ code: string; description: string; unit: string; price: Prisma.Decimal | null; detail: string | null }[]>`
          SELECT code, description, unit, "unitCost" AS price, "sourceStatus" AS detail FROM "Composition"
          WHERE "priceTableId" = ${table.id} AND ${Prisma.join(where, " AND ")} ORDER BY (code = ${q}) DESC, code LIMIT 30`;
    return rows.map((r) => ({
      ref: r.code, code: r.code, description: r.description, unit: r.unit, price: r.price?.toString() ?? null,
      detail: type === "OFFICIAL_INPUT" && r.detail ? `preço de ${r.detail}` : undefined,
    }));
  }

  const own = Prisma.sql`"companyId" = ${ctx.company.id}`;
  const where = [own, ...(words.length ? [Prisma.sql`(${Prisma.join(textFilter("description"), " AND ")} OR code ILIKE ${likePattern(q, "contains")})`] : [])];
  if (type === "OWN_INPUT") {
    const rows = await prisma.$queryRaw<{ id: string; code: string; description: string; unit: string; price: Prisma.Decimal; source: string }[]>`
      SELECT id, code, description, unit, "unitPrice" AS price, source FROM "OwnInput" WHERE ${Prisma.join(where, " AND ")} ORDER BY code LIMIT 30`;
    return rows.map((r) => ({ ref: r.id, code: r.code, description: r.description, unit: r.unit, price: r.price.toString(), detail: r.source }));
  }
  const rows = await prisma.$queryRaw<{ id: string; code: string; description: string; unit: string }[]>`
    SELECT id, code, description, unit FROM "OwnComposition" WHERE ${Prisma.join(where, " AND ")} AND id <> ${compositionId} ORDER BY code LIMIT 30`;
  return rows.map((r) => ({ ref: r.id, code: r.code, description: r.description, unit: r.unit, price: null }));
}
