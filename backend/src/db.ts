import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

type SqlValue = string | number | boolean | Date | Buffer | null;

const connectionString = Bun.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

function shouldUseSsl(url: string): boolean {
  const sslMode = Bun.env.PGSSLMODE?.trim().toLowerCase();

  if (sslMode === "require") {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("sslmode")?.toLowerCase() === "require";
  } catch {
    return false;
  }
}

export const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
});

export async function query<T extends QueryResultRow>(
  text: string,
  params: readonly SqlValue[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, [...params]);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
