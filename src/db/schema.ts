// Local SQLite database schema definitions and migrations.
import type { Client } from "@libsql/client";

export const SCHEMA_VERSION = 2;

export const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS bots (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages (conversation_id, created_at)",
  "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL)",
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    generation INTEGER NOT NULL DEFAULT 0,
    last_read_at TEXT
  )`,
];

export async function initSchema(client: Client): Promise<void> {
  await client.batch(SCHEMA_STATEMENTS, "write");
}
