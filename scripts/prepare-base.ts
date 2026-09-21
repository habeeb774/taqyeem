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
    if (!exists.rows[0]?.table_name) {
      const schemaPath = resolve(process.cwd(), 'database', 'legacy-full-schema.sql');
      const sql = await readFile(schemaPath, 'utf8');
      await client.query(sql);
      console.log('TAQYEEM base schema initialized.');
    } else {
      console.log('TAQYEEM base schema already exists; keeping current data.');
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

