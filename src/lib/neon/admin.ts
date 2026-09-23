import { Client, neon } from '@neondatabase/serverless';

function getConnectionString() {
  const connectionString = process.env.TAQYEEM_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing');
  return connectionString;
}

export function createNeonAdminSql() {
  return neon(getConnectionString());
}

export async function withNeonTransaction<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getConnectionString() });
  await client.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* preserve original error */
    }
    throw error;
  } finally {
    await client.end();
  }
}

