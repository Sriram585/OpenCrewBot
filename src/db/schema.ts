// Local SQLite database schema definitions and migrations.
import type { Client } from "@libsql/client";

export const SCHEMA_VERSION = 7;

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
  `CREATE TABLE IF NOT EXISTS approval_requests (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    run_id TEXT,
    agent_id TEXT,
    tool_name TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    action_preview_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    decision_note TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests (status, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_approval_requests_agent ON approval_requests (agent_id, created_at)",
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    agent_id TEXT,
    task_id TEXT,
    tool_name TEXT NOT NULL,
    permission_level TEXT NOT NULL,
    decision TEXT NOT NULL CHECK(decision IN ('AUTO_ALLOWED', 'APPROVED', 'REJECTED', 'CANCELLED', 'BLOCKED')),
    action_preview_json TEXT NOT NULL,
    result_summary TEXT,
    error TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_agent ON audit_logs (agent_id, timestamp)",
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    room_id TEXT,
    goal TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')),
    final_output TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_runs_status ON runs (status, created_at)",
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    assigned_agent_id TEXT,
    dependencies_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK(status IN ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')),
    retries INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    timeout_ms INTEGER NOT NULL DEFAULT 60000,
    approval_id TEXT,
    output TEXT,
    error TEXT,
    started_at TEXT,
    completed_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_tasks_run_id ON tasks (run_id)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status)",
  `CREATE TABLE IF NOT EXISTS room_collaboration_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    run_id TEXT,
    sender_agent_id TEXT NOT NULL,
    recipient_agent_id TEXT,
    message_type TEXT NOT NULL CHECK(message_type IN ('DELEGATE', 'QUESTION', 'SHARE', 'CHALLENGE', 'VERIFY', 'RESULT', 'INTERRUPT')),
    content TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_collab_room_time ON room_collaboration_messages (room_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_collab_run_time ON room_collaboration_messages (run_id, created_at)",
  `CREATE TABLE IF NOT EXISTS scheduled_workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    room_id TEXT,
    goal_prompt TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'PAUSED')),
    last_run_at TEXT,
    next_run_at TEXT,
    last_status TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_scheduled_workflows_status ON scheduled_workflows (status)",
  `CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    run_id TEXT,
    trigger_type TEXT NOT NULL CHECK(trigger_type IN ('SCHEDULED', 'MANUAL')),
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs (workflow_id, started_at)",
];

export async function initSchema(client: Client): Promise<void> {
  await client.batch(SCHEMA_STATEMENTS, "write");
}
