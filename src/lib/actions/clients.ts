// src/lib/actions/clients.ts
"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { optionalText, parseForm, requiredText, type ActionState } from "@/lib/forms";
import { requireEditor } from "@/lib/auth/require";

const clientSchema = z.object({
  name: requiredText("Nome"),
  document: optionalText,
  email: z.string().trim().transform((s) => (s === "" ? null : s)).pipe(z.string().email("E-mail inválido").nullable()),
  phone: optionalText,
  address: optionalText,
});

export async function saveClient(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireEditor();
  const r = parseForm(clientSchema, fd);
  if (!r.ok) return r.state;
  if (id) {
    const { count } = await prisma.client.updateMany({ where: { id, companyId: ctx.company.id }, data: r.data });
    if (count === 0) return { status: "error", message: "Cliente não encontrado." };
  } else {
    await prisma.client.create({ data: { ...r.data, companyId: ctx.company.id } });
  }
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function deleteClient(id: string): Promise<void> {
  const ctx = await requireEditor();
  const used = await prisma.project.count({ where: { clientId: id, companyId: ctx.company.id } });
  if (used > 0) throw new Error("Cliente vinculado a orçamentos; não pode ser excluído.");
  await prisma.client.deleteMany({ where: { id, companyId: ctx.company.id } });
  revalidatePath("/clientes");
  redirect("/clientes");
}
