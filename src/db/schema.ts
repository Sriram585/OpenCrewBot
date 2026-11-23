// Local SQLite database schema definitions and migrations.
import type { Client } from "@libsql/client";

export const SCHEMA_VERSION = 3;

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
  `CREATE TABLE IF NOT EXISTS agent_model_configs (
    agent_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    primary_model TEXT NOT NULL,
    fallback_provider TEXT,
    fallback_model TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS model_usage_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    agent_id TEXT,
    task_id TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    estimated_cost_usd REAL,
    fallback_used INTEGER NOT NULL DEFAULT 0,
    is_mock INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS idx_model_usage_logs_agent ON model_usage_logs (agent_id, timestamp)",
  "CREATE INDEX IF NOT EXISTS idx_model_usage_logs_timestamp ON model_usage_logs (timestamp)",
];

export async function initSchema(client: Client): Promise<void> {
  await client.batch(SCHEMA_STATEMENTS, "write");
}
