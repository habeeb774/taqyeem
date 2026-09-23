import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from '@neondatabase/serverless';

const MIGRATION_DIR = resolve(process.cwd(), 'drizzle');

async function main() {
  const connectionString = process.env.TAQYEEM_DATABASE_URL||process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      create table if not exists public.__taqyeem_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await import('node:fs/promises')).readdir(MIGRATION_DIR)
      .then(names => names.filter(name => /^\d+_.+\.sql$/.test(name)).sort());
    for (const file of await files) {
      const migrationId = file.replace(/\.sql$/, '');
      const applied = await client.query(`select 1 from public.__taqyeem_migrations where id = $1 limit 1`, [migrationId]);
      if (applied.rows[0]) { console.log(`TAQYEEM migration ${migrationId} already applied.`); continue; }
      const sql = await readFile(resolve(MIGRATION_DIR, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(`insert into public.__taqyeem_migrations(id) values($1) on conflict(id) do nothing`, [migrationId]);
        await client.query('commit');
        console.log(`TAQYEEM migration ${migrationId} applied successfully.`);
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error: any) => {
  console.error('TAQYEEM database upgrade failed.');
  console.error(error?.message || error);
  if (error?.code) console.error(`PostgreSQL code: ${error.code}`);
  if (error?.detail) console.error(`Detail: ${error.detail}`);
  if (error?.hint) console.error(`Hint: ${error.hint}`);
  process.exit(1);
});

