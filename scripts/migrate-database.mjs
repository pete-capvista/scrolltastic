import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required.');
const sql = postgres(url, { max: 1 });

try {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;
  const applied = new Set((await sql`select name from schema_migrations`).map(row => row.name));
  const names = (await readdir(new URL('../db/migrations/', import.meta.url)))
    .filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  for (const name of names) {
    if (applied.has(name)) continue;
    const source = await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');
    await sql.begin(async transaction => {
      await transaction.unsafe(source);
      await transaction`insert into schema_migrations (name) values (${name})`;
    });
    process.stdout.write(`Applied ${name}\n`);
  }
} finally {
  await sql.end();
}
