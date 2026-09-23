import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from '@neondatabase/serverless';

async function main() {
  const connectionString = process.env.TAQYEEM_DATABASE_URL||process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const exists = await client.query(`select to_regclass('public.organizations') as table_name`);
    if (!exists.rows[0]?.table_name) throw new Error('Run the base schema/migrations before seeding.');
    const seedPath = resolve(process.cwd(), 'database', 'legacy-data-seed.sql');
    const sql = await readFile(seedPath, 'utf8');
    await client.query(sql);
    console.log('TAQYEEM seed completed (idempotent/upsert based).');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

