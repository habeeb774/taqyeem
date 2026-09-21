import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

const databaseUrl=process.env.TAQYEEM_DATABASE_URL||process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is missing');
neonConfig.webSocketConstructor = ws;

const globalForDb = globalThis as unknown as { taqyeemPool?: Pool };
export const pool = globalForDb.taqyeemPool ?? new Pool({ connectionString: databaseUrl });
if (process.env.NODE_ENV !== 'production') globalForDb.taqyeemPool = pool;
export const db = drizzle({ client: pool, schema });
