// scripts/db-migrate.ts
// Applies prisma/migrations/*/migration.sql in order, recording them in
// _prisma_migrations (same table `prisma migrate deploy` uses), without the
// Prisma schema engine. Safe to re-run: applied migrations are skipped.
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";

const dir = path.join(process.cwd(), "prisma", "migrations");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id VARCHAR(36) PRIMARY KEY, checksum VARCHAR(64) NOT NULL, finished_at TIMESTAMPTZ, migration_name VARCHAR(255) NOT NULL,
    logs TEXT, rolled_back_at TIMESTAMPTZ, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), applied_steps_count INTEGER NOT NULL DEFAULT 0)`);
  const applied = new Set((await client.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).rows.map((r) => r.migration_name));
  const names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const name of names) {
    if (applied.has(name)) { console.log(`= ${name} (já aplicada)`); continue; }
    const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    console.log(`+ ${name}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (gen_random_uuid()::text, $1, $2, now(), 1)`, [checksum, name]);
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
  }
  await client.end();
  console.log("Banco atualizado.");
}
main().catch((e) => { console.error(e); process.exit(1); });
