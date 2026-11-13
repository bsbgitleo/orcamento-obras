// scripts/platform-admin.ts
// Grants or revokes the platform administrator flag (decisão #45): only these
// users can import the official, shared price tables through the interface.
//   npm run admin:platform -- usuario@email.com          (concede)
//   npm run admin:platform -- usuario@email.com --revoke (retira)
//   npm run admin:platform -- --list
import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/prisma";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { revoke: { type: "boolean", default: false }, list: { type: "boolean", default: false } },
});

async function main() {
  if (values.list) {
    const admins = await prisma.user.findMany({ where: { isPlatformAdmin: true }, select: { email: true, name: true } });
    console.log(admins.length ? admins.map((a) => `${a.email} (${a.name})`).join("\n") : "Nenhum administrador da plataforma.");
    return;
  }
  const email = positionals[0]?.trim().toLowerCase();
  if (!email) { console.error("uso: admin:platform -- <email> [--revoke] | --list"); process.exitCode = 1; return; }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { console.error(`Usuário ${email} não encontrado. Ele precisa ter conta no app.`); process.exitCode = 1; return; }
  await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: !values.revoke } });
  console.log(`${email}: ${values.revoke ? "deixou de ser" : "agora é"} administrador da plataforma.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
