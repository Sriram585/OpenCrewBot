// Local SQLite database module for OpenCrewBot.
// Manages local persistence for bots, rooms, messages, settings, agent model configs, and model usage logs.
import type { Client } from "@libsql/client";
import type { Bot, ChatMessage, ConversationId, Room } from "@/lib/shared/types";
import { getClient, openClient, closeClient } from "./client";
import { initSchema, SCHEMA_VERSION } from "./schema";

export { getClient, openClient, closeClient, initSchema, SCHEMA_VERSION };

export function db(): Promise<Client> {
  return getClient();
}

// ── settings (small JSON values) ────────────────────────────────────────

export async function getSetting<T>(key: string, client?: Client): Promise<T | undefined> {
  const c = client ?? (await db());
  const rows = await c.execute({ sql: "SELECT data FROM settings WHERE key = ?", args: [key] });
  return rows.rows[0] ? (JSON.parse(String(rows.rows[0].data)) as T) : undefined;
}

export async function setSetting(key: string, value: unknown, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: "INSERT INTO settings (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data",
    args: [key, JSON.stringify(value)],
  });
}

// ── bots ────────────────────────────────────────────────────────────────

function normalizeBot(raw: Bot): Bot {
  return {
    ...raw,
    connections: raw.connections ?? [],
  };
}

export async function listBots(client?: Client): Promise<Bot[]> {
  const c = client ?? (await db());
  const rows = await c.execute("SELECT data FROM bots");
  return rows.rows
    .map((r) => normalizeBot(JSON.parse(String(r.data)) as Bot))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getBot(id: string, client?: Client): Promise<Bot | null> {
  const c = client ?? (await db());
  const rows = await c.execute({ sql: "SELECT data FROM bots WHERE id = ?", args: [id] });
  return rows.rows[0] ? normalizeBot(JSON.parse(String(rows.rows[0].data)) as Bot) : null;
}

export async function saveBot(bot: Bot, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: "INSERT INTO bots (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    args: [bot.id, JSON.stringify(bot)],
  });
}

export async function deleteBotRow(id: string, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({ sql: "DELETE FROM bots WHERE id = ?", args: [id] });
}

// ── rooms ───────────────────────────────────────────────────────────────

export async function listRooms(client?: Client): Promise<Room[]> {
  const c = client ?? (await db());
  const rows = await c.execute("SELECT data FROM rooms");
  return rows.rows
    .map((r) => JSON.parse(String(r.data)) as Room)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getRoom(id: string, client?: Client): Promise<Room | null> {
  const c = client ?? (await db());
  const rows = await c.execute({ sql: "SELECT data FROM rooms WHERE id = ?", args: [id] });
  return rows.rows[0] ? (JSON.parse(String(rows.rows[0].data)) as Room) : null;
}

export async function saveRoom(room: Room, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: "INSERT INTO rooms (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    args: [room.id, JSON.stringify(room)],
  });
}

export async function deleteRoomRow(id: string, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({ sql: "DELETE FROM rooms WHERE id = ?", args: [id] });
}

// ── messages ────────────────────────────────────────────────────────────

export async function saveMessage(message: ChatMessage, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: `INSERT INTO messages (id, conversation_id, created_at, data) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    args: [message.id, message.conversationId, message.createdAt, JSON.stringify(message)],
  });
}

export async function listMessages(conversationId: ConversationId, limit = 200, client?: Client): Promise<ChatMessage[]> {
  const c = client ?? (await db());
  const rows = await c.execute({
    sql: `SELECT data FROM (
            SELECT data, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?
          ) ORDER BY created_at ASC`,
    args: [conversationId, limit],
  });
  return rows.rows.map((r) => JSON.parse(String(r.data)) as ChatMessage);
}

export async function clearMessages(conversationId: ConversationId, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({ sql: "DELETE FROM messages WHERE conversation_id = ?", args: [conversationId] });
}

export async function lastMessages(client?: Client): Promise<Map<ConversationId, ChatMessage>> {
  const c = client ?? (await db());
  const rows = await c.execute(
    `SELECT m.data FROM messages m
     JOIN (SELECT conversation_id, MAX(created_at) AS latest FROM messages GROUP BY conversation_id) l
       ON m.conversation_id = l.conversation_id AND m.created_at = l.latest`,
  );
  const out = new Map<ConversationId, ChatMessage>();
  for (const r of rows.rows) {
    const m = JSON.parse(String(r.data)) as ChatMessage;
    out.set(m.conversationId, m);
  }
  return out;
}

export async function unreadCounts(client?: Client): Promise<Map<ConversationId, number>> {
  const c = client ?? (await db());
  const rows = await c.execute(
    `SELECT m.conversation_id AS id, COUNT(*) AS n FROM messages m
     LEFT JOIN conversations c ON c.id = m.conversation_id
     WHERE m.created_at > COALESCE(c.last_read_at, '') AND m.data NOT LIKE '%"role":"user"%'
     GROUP BY m.conversation_id`,
  );
  return new Map(rows.rows.map((r) => [String(r.id), Number(r.n)]));
}

export async function markRead(conversationId: ConversationId, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: `INSERT INTO conversations (id, last_read_at) VALUES (?, ?)
          ON CONFLICT(id) DO UPDATE SET last_read_at = excluded.last_read_at`,
    args: [conversationId, new Date().toISOString()],
  });
}

export async function conversationGeneration(conversationId: ConversationId, client?: Client): Promise<number> {
  const c = client ?? (await db());
  const rows = await c.execute({
    sql: "SELECT generation FROM conversations WHERE id = ?",
    args: [conversationId],
  });
  return rows.rows[0] ? Number(rows.rows[0].generation) : 0;
}

export async function bumpGeneration(conversationId: ConversationId, client?: Client): Promise<number> {
  const c = client ?? (await db());
  await c.execute({
    sql: `INSERT INTO conversations (id, generation) VALUES (?, 1)
          ON CONFLICT(id) DO UPDATE SET generation = generation + 1`,
    args: [conversationId],
  });
  return conversationGeneration(conversationId, c);
}

// ── agent model configs ────────────────────────────────────────────────

export interface AgentModelConfig {
  agentId: string;
  provider: string;
  primaryModel: string;
  fallbackProvider?: string | null;
  fallbackModel?: string | null;
  updatedAt: string;
}

export async function saveAgentModelConfig(config: AgentModelConfig, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: `INSERT INTO agent_model_configs (agent_id, provider, primary_model, fallback_provider, fallback_model, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(agent_id) DO UPDATE SET
            provider = excluded.provider,
            primary_model = excluded.primary_model,
            fallback_provider = excluded.fallback_provider,
            fallback_model = excluded.fallback_model,
            updated_at = excluded.updated_at`,
    args: [
      config.agentId,
      config.provider,
      config.primaryModel,
      config.fallbackProvider ?? null,
      config.fallbackModel ?? null,
      config.updatedAt || new Date().toISOString(),
    ],
  });
}

export async function getAgentModelConfig(agentId: string, client?: Client): Promise<AgentModelConfig | null> {
  const c = client ?? (await db());
  const res = await c.execute({
    sql: "SELECT agent_id, provider, primary_model, fallback_provider, fallback_model, updated_at FROM agent_model_configs WHERE agent_id = ?",
    args: [agentId],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    agentId: String(row.agent_id),
    provider: String(row.provider),
    primaryModel: String(row.primary_model),
    fallbackProvider: row.fallback_provider ? String(row.fallback_provider) : null,
    fallbackModel: row.fallback_model ? String(row.fallback_model) : null,
    updatedAt: String(row.updated_at),
  };
}

export async function listAgentModelConfigs(client?: Client): Promise<AgentModelConfig[]> {
  const c = client ?? (await db());
  const res = await c.execute("SELECT agent_id, provider, primary_model, fallback_provider, fallback_model, updated_at FROM agent_model_configs ORDER BY updated_at DESC");
  return res.rows.map((row) => ({
    agentId: String(row.agent_id),
    provider: String(row.provider),
    primaryModel: String(row.primary_model),
    fallbackProvider: row.fallback_provider ? String(row.fallback_provider) : null,
    fallbackModel: row.fallback_model ? String(row.fallback_model) : null,
    updatedAt: String(row.updated_at),
  }));
}

export async function deleteAgentModelConfig(agentId: string, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({ sql: "DELETE FROM agent_model_configs WHERE agent_id = ?", args: [agentId] });
}

// ── model usage logs & metrics ─────────────────────────────────────────

export interface ModelUsageLog {
  id: string;
  timestamp: string;
  agentId: string | null;
  taskId: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number | null;
  fallbackUsed: boolean;
  isMock: boolean;
}

export interface ModelUsageLogInput {
  id: string;
  timestamp?: string;
  agentId?: string | null;
  taskId?: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd?: number | null;
  fallbackUsed?: boolean | number;
  isMock?: boolean | number;
}

export interface ModelUsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  totalCalls: number;
  fallbackCalls: number;
  mockCalls: number;
  byAgent: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number; calls: number }>;
  byModel: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number; calls: number }>;
}

export async function logModelUsage(log: ModelUsageLogInput, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: `INSERT INTO model_usage_logs (
            id, timestamp, agent_id, task_id, provider, model, prompt_tokens, completion_tokens, estimated_cost_usd, fallback_used, is_mock
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      log.id,
      log.timestamp || new Date().toISOString(),
      log.agentId ?? null,
      log.taskId ?? null,
      log.provider,
      log.model,
      log.promptTokens,
      log.completionTokens,
      log.estimatedCostUsd ?? null,
      log.fallbackUsed ? 1 : 0,
      log.isMock ? 1 : 0,
    ],
  });
}

export async function listModelUsageLogs(
  options?: { limit?: number; agentId?: string; model?: string },
  client?: Client,
): Promise<ModelUsageLog[]> {
  const c = client ?? (await db());
  const limit = options?.limit ?? 100;
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (options?.agentId) {
    conditions.push("agent_id = ?");
    args.push(options.agentId);
  }
  if (options?.model) {
    conditions.push("model = ?");
    args.push(options.model);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  args.push(limit);

  const res = await c.execute({
    sql: `SELECT id, timestamp, agent_id, task_id, provider, model, prompt_tokens, completion_tokens, estimated_cost_usd, fallback_used, is_mock
          FROM model_usage_logs ${whereClause} ORDER BY timestamp DESC LIMIT ?`,
    args,
  });

  return res.rows.map((r) => ({
    id: String(r.id),
    timestamp: String(r.timestamp),
    agentId: r.agent_id ? String(r.agent_id) : null,
    taskId: r.task_id ? String(r.task_id) : null,
    provider: String(r.provider),
    model: String(r.model),
    promptTokens: Number(r.prompt_tokens),
    completionTokens: Number(r.completion_tokens),
    estimatedCostUsd: r.estimated_cost_usd !== null ? Number(r.estimated_cost_usd) : null,
    fallbackUsed: Boolean(r.fallback_used),
    isMock: Boolean(r.is_mock),
  }));
}

export async function getModelUsageSummary(
  filter?: { agentId?: string; model?: string },
  client?: Client,
): Promise<ModelUsageSummary> {
  const logs = await listModelUsageLogs({ limit: 10000, agentId: filter?.agentId, model: filter?.model }, client);

  const summary: ModelUsageSummary = {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    totalCalls: logs.length,
    fallbackCalls: 0,
    mockCalls: 0,
    byAgent: {},
    byModel: {},
  };

  for (const log of logs) {
    summary.totalPromptTokens += log.promptTokens;
    summary.totalCompletionTokens += log.completionTokens;
    summary.totalTokens += log.promptTokens + log.completionTokens;
    if (log.estimatedCostUsd) summary.totalCostUsd += log.estimatedCostUsd;
    if (log.fallbackUsed) summary.fallbackCalls++;
    if (log.isMock) summary.mockCalls++;

    const agentKey = log.agentId || "unknown";
    if (!summary.byAgent[agentKey]) {
      summary.byAgent[agentKey] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 };
    }
    const a = summary.byAgent[agentKey];
    a.promptTokens += log.promptTokens;
    a.completionTokens += log.completionTokens;
    a.totalTokens += log.promptTokens + log.completionTokens;
    if (log.estimatedCostUsd) a.costUsd += log.estimatedCostUsd;
    a.calls++;

    const modelKey = `${log.provider}/${log.model}`;
    if (!summary.byModel[modelKey]) {
      summary.byModel[modelKey] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, calls: 0 };
    }
    const m = summary.byModel[modelKey];
    m.promptTokens += log.promptTokens;
    m.completionTokens += log.completionTokens;
    m.totalTokens += log.promptTokens + log.completionTokens;
    if (log.estimatedCostUsd) m.costUsd += log.estimatedCostUsd;
    m.calls++;
  }

  summary.totalCostUsd = Math.round(summary.totalCostUsd * 10000) / 10000;
  for (const key of Object.keys(summary.byAgent)) {
    summary.byAgent[key].costUsd = Math.round(summary.byAgent[key].costUsd * 10000) / 10000;
  }
  for (const key of Object.keys(summary.byModel)) {
    summary.byModel[key].costUsd = Math.round(summary.byModel[key].costUsd * 10000) / 10000;
  }

  return summary;
}
