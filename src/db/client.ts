// SQLite database connection management using @libsql/client.
import { createClient, type Client } from "@libsql/client";
import { APP_DB_URL } from "@/lib/server/config";
import { initSchema, SCHEMA_VERSION } from "./schema";

const g = globalThis as unknown as {
  __opencrewbotDb?: { url: string; schema?: number; client: Promise<Client> };
};

export async function openClient(dbUrl = APP_DB_URL): Promise<Client> {
  const client = createClient({ url: dbUrl });
  await initSchema(client);
  return client;
}

export function getClient(dbUrl = APP_DB_URL): Promise<Client> {
  const cached = g.__opencrewbotDb;
  if (cached?.url === dbUrl && cached.schema === SCHEMA_VERSION) {
    return cached.client;
  }
  const stale = cached && "client" in cached ? cached.client : undefined;
  void stale?.then((c) => c.close()).catch(() => {});
  const client = openClient(dbUrl);
  g.__opencrewbotDb = { url: dbUrl, schema: SCHEMA_VERSION, client };
  return client;
}

export async function closeClient(): Promise<void> {
  const cached = g.__opencrewbotDb;
  if (cached) {
    try {
      const client = await cached.client;
      client.close();
    } catch {
      // ignore
    }
    delete g.__opencrewbotDb;
  }
}
