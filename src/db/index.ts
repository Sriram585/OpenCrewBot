// Local SQLite database module for OpenCrewBot.
// Manages local persistence for bots, rooms, messages, settings, agent model configs, and model usage logs.
import type { Client } from "@libsql/client";
import type {
  Bot,
  ChatMessage,
  ConversationId,
  Room,
  Run,
  RunStatus,
  Task,
  TaskStatus,
  CollaborationMessageType,
  RoomCollaborationMessage,
  ScheduledWorkflow,
  WorkflowRunRecord,
  WorkflowStatus,
  WorkflowTriggerType,
} from "@/lib/shared/types";
import { getClient, openClient, closeClient } from "./client";
import { initSchema, SCHEMA_VERSION } from "./schema";

export { getClient, openClient, closeClient, initSchema, SCHEMA_VERSION };
export type {
  Run,
  RunStatus,
  Task,
  TaskStatus,
  CollaborationMessageType,
  RoomCollaborationMessage,
  ScheduledWorkflow,
  WorkflowRunRecord,
  WorkflowStatus,
  WorkflowTriggerType,
};

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
    ...(raw.role !== undefined ? { role: raw.role } : {}),
    ...(raw.modelProvider !== undefined ? { modelProvider: raw.modelProvider } : {}),
    ...(raw.primaryModel !== undefined ? { primaryModel: raw.primaryModel } : {}),
    ...(raw.fallbackModel !== undefined ? { fallbackModel: raw.fallbackModel } : {}),
    ...(raw.skills !== undefined ? { skills: raw.skills } : {}),
    ...(raw.permissionLevel !== undefined ? { permissionLevel: raw.permissionLevel } : {}),
    ...(raw.outputFormat !== undefined ? { outputFormat: raw.outputFormat } : {}),
    ...(raw.isDynamic !== undefined ? { isDynamic: raw.isDynamic } : {}),
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

// ── approvals & audit logs (Module G) ──────────────────────────────────

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type ToolRiskLevel = "read_safe" | "external_write" | "sensitive";
export type AuditDecision = "AUTO_ALLOWED" | "APPROVED" | "REJECTED" | "CANCELLED" | "BLOCKED";

export interface ApprovalRequest {
  id: string;
  taskId: string | null;
  runId: string | null;
  agentId: string | null;
  toolName: string;
  riskLevel: ToolRiskLevel | string;
  actionPreviewJson: string;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  decisionNote: string | null;
}

export interface ApprovalRequestInput {
  id: string;
  taskId?: string | null;
  runId?: string | null;
  agentId?: string | null;
  toolName: string;
  riskLevel: ToolRiskLevel | string;
  actionPreviewJson: string;
  status?: ApprovalStatus;
  createdAt?: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  decisionNote?: string | null;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  agentId: string | null;
  taskId: string | null;
  toolName: string;
  permissionLevel: string;
  decision: AuditDecision;
  actionPreviewJson: string;
  resultSummary: string | null;
  error: string | null;
}

export interface AuditLogInput {
  id?: string;
  timestamp?: string;
  agentId?: string | null;
  taskId?: string | null;
  toolName: string;
  permissionLevel: string;
  decision: AuditDecision;
  actionPreviewJson: string;
  resultSummary?: string | null;
  error?: string | null;
}

export async function createApprovalRequest(req: ApprovalRequestInput, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: `INSERT INTO approval_requests (
            id, task_id, run_id, agent_id, tool_name, risk_level, action_preview_json, status, created_at, resolved_at, resolved_by, decision_note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            task_id = excluded.task_id,
            run_id = excluded.run_id,
            agent_id = excluded.agent_id,
            tool_name = excluded.tool_name,
            risk_level = excluded.risk_level,
            action_preview_json = excluded.action_preview_json,
            status = excluded.status,
            resolved_at = excluded.resolved_at,
            resolved_by = excluded.resolved_by,
            decision_note = excluded.decision_note`,
    args: [
      req.id,
      req.taskId ?? null,
      req.runId ?? null,
      req.agentId ?? null,
      req.toolName,
      req.riskLevel,
      req.actionPreviewJson,
      req.status || "PENDING",
      req.createdAt || new Date().toISOString(),
      req.resolvedAt ?? null,
      req.resolvedBy ?? null,
      req.decisionNote ?? null,
    ],
  });
}

export async function getApprovalRequest(id: string, client?: Client): Promise<ApprovalRequest | null> {
  const c = client ?? (await db());
  const res = await c.execute({
    sql: `SELECT id, task_id, run_id, agent_id, tool_name, risk_level, action_preview_json, status, created_at, resolved_at, resolved_by, decision_note
          FROM approval_requests WHERE id = ?`,
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    taskId: r.task_id ? String(r.task_id) : null,
    runId: r.run_id ? String(r.run_id) : null,
    agentId: r.agent_id ? String(r.agent_id) : null,
    toolName: String(r.tool_name),
    riskLevel: String(r.risk_level),
    actionPreviewJson: String(r.action_preview_json),
    status: r.status as ApprovalStatus,
    createdAt: String(r.created_at),
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
    resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
    decisionNote: r.decision_note ? String(r.decision_note) : null,
  };
}

export async function updateApprovalRequestStatus(
  id: string,
  update: { status: ApprovalStatus; resolvedBy?: string | null; decisionNote?: string | null; resolvedAt?: string | null },
  client?: Client,
): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: `UPDATE approval_requests
          SET status = ?, resolved_by = ?, decision_note = ?, resolved_at = ?
          WHERE id = ?`,
    args: [
      update.status,
      update.resolvedBy ?? null,
      update.decisionNote ?? null,
      update.resolvedAt || new Date().toISOString(),
      id,
    ],
  });
}

export async function listApprovalRequests(
  filter?: { status?: ApprovalStatus; agentId?: string; limit?: number },
  client?: Client,
): Promise<ApprovalRequest[]> {
  const c = client ?? (await db());
  const limit = filter?.limit ?? 100;
  const conditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (filter?.status) {
    conditions.push("status = ?");
    args.push(filter.status);
  }
  if (filter?.agentId) {
    conditions.push("agent_id = ?");
    args.push(filter.agentId);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  args.push(limit);

  const res = await c.execute({
    sql: `SELECT id, task_id, run_id, agent_id, tool_name, risk_level, action_preview_json, status, created_at, resolved_at, resolved_by, decision_note
          FROM approval_requests ${whereClause} ORDER BY created_at DESC LIMIT ?`,
    args,
  });

  return res.rows.map((r) => ({
    id: String(r.id),
    taskId: r.task_id ? String(r.task_id) : null,
    runId: r.run_id ? String(r.run_id) : null,
    agentId: r.agent_id ? String(r.agent_id) : null,
    toolName: String(r.tool_name),
    riskLevel: String(r.risk_level),
    actionPreviewJson: String(r.action_preview_json),
    status: r.status as ApprovalStatus,
    createdAt: String(r.created_at),
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
    resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
    decisionNote: r.decision_note ? String(r.decision_note) : null,
  }));
}

export async function logAudit(entry: AuditLogInput, client?: Client): Promise<void> {
  const c = client ?? (await db());
  const id = entry.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await c.execute({
    sql: `INSERT INTO audit_logs (
            id, timestamp, agent_id, task_id, tool_name, permission_level, decision, action_preview_json, result_summary, error
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      entry.timestamp || new Date().toISOString(),
      entry.agentId ?? null,
      entry.taskId ?? null,
      entry.toolName,
      entry.permissionLevel,
      entry.decision,
      entry.actionPreviewJson,
      entry.resultSummary ?? null,
      entry.error ?? null,
    ],
  });
}

export async function listAuditLogs(
  filter?: { agentId?: string; decision?: AuditDecision; limit?: number },
  client?: Client,
): Promise<AuditLog[]> {
  const c = client ?? (await db());
  const limit = filter?.limit ?? 100;
  const conditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (filter?.agentId) {
    conditions.push("agent_id = ?");
    args.push(filter.agentId);
  }
  if (filter?.decision) {
    conditions.push("decision = ?");
    args.push(filter.decision);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  args.push(limit);

  const res = await c.execute({
    sql: `SELECT id, timestamp, agent_id, task_id, tool_name, permission_level, decision, action_preview_json, result_summary, error
          FROM audit_logs ${whereClause} ORDER BY timestamp DESC LIMIT ?`,
    args,
  });

  return res.rows.map((r) => ({
    id: String(r.id),
    timestamp: String(r.timestamp),
    agentId: r.agent_id ? String(r.agent_id) : null,
    taskId: r.task_id ? String(r.task_id) : null,
    toolName: String(r.tool_name),
    permissionLevel: String(r.permission_level),
    decision: r.decision as AuditDecision,
    actionPreviewJson: String(r.action_preview_json),
    resultSummary: r.result_summary ? String(r.result_summary) : null,
    error: r.error ? String(r.error) : null,
  }));
}

// ── runs & tasks (Module D: Execution Engine) ──────────────────────────

export interface RunInput {
  id: string;
  roomId?: string | null;
  goal: string;
  status?: RunStatus;
  finalOutput?: string | null;
  error?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface TaskInput {
  id: string;
  runId: string;
  title: string;
  description?: string | null;
  assignedAgentId?: string | null;
  dependencies?: string[];
  status?: TaskStatus;
  retries?: number;
  maxRetries?: number;
  timeoutMs?: number;
  approvalId?: string | null;
  output?: string | null;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export async function createRun(run: RunInput, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: `INSERT INTO runs (id, room_id, goal, status, final_output, error, created_at, started_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            room_id = excluded.room_id,
            goal = excluded.goal,
            status = excluded.status,
            final_output = excluded.final_output,
            error = excluded.error,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at`,
    args: [
      run.id,
      run.roomId ?? null,
      run.goal,
      run.status || "PENDING",
      run.finalOutput ?? null,
      run.error ?? null,
      run.createdAt || new Date().toISOString(),
      run.startedAt ?? null,
      run.completedAt ?? null,
    ],
  });
}

export async function getRun(id: string, client?: Client): Promise<Run | null> {
  const c = client ?? (await db());
  const res = await c.execute({
    sql: "SELECT id, room_id, goal, status, final_output, error, created_at, started_at, completed_at FROM runs WHERE id = ?",
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    roomId: r.room_id ? String(r.room_id) : null,
    goal: String(r.goal),
    status: r.status as RunStatus,
    finalOutput: r.final_output ? String(r.final_output) : null,
    error: r.error ? String(r.error) : null,
    createdAt: String(r.created_at),
    startedAt: r.started_at ? String(r.started_at) : null,
    completedAt: r.completed_at ? String(r.completed_at) : null,
  };
}

export async function updateRun(id: string, patch: Partial<Run>, client?: Client): Promise<void> {
  const c = client ?? (await db());
  const existing = await getRun(id, c);
  if (!existing) throw new Error(`Run ${id} not found`);

  const updated: Run = { ...existing, ...patch };
  await c.execute({
    sql: `UPDATE runs SET
            room_id = ?, goal = ?, status = ?, final_output = ?, error = ?, started_at = ?, completed_at = ?
          WHERE id = ?`,
    args: [
      updated.roomId ?? null,
      updated.goal,
      updated.status,
      updated.finalOutput ?? null,
      updated.error ?? null,
      updated.startedAt ?? null,
      updated.completedAt ?? null,
      id,
    ],
  });
}

export async function listRuns(
  filter?: { status?: RunStatus; roomId?: string; limit?: number },
  client?: Client,
): Promise<Run[]> {
  const c = client ?? (await db());
  const limit = filter?.limit ?? 100;
  const conditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (filter?.status) {
    conditions.push("status = ?");
    args.push(filter.status);
  }
  if (filter?.roomId) {
    conditions.push("room_id = ?");
    args.push(filter.roomId);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  args.push(limit);

  const res = await c.execute({
    sql: `SELECT id, room_id, goal, status, final_output, error, created_at, started_at, completed_at
          FROM runs ${whereClause} ORDER BY created_at DESC LIMIT ?`,
    args,
  });

  return res.rows.map((r) => ({
    id: String(r.id),
    roomId: r.room_id ? String(r.room_id) : null,
    goal: String(r.goal),
    status: r.status as RunStatus,
    finalOutput: r.final_output ? String(r.final_output) : null,
    error: r.error ? String(r.error) : null,
    createdAt: String(r.created_at),
    startedAt: r.started_at ? String(r.started_at) : null,
    completedAt: r.completed_at ? String(r.completed_at) : null,
  }));
}

export async function createTask(task: TaskInput, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: `INSERT INTO tasks (
            id, run_id, title, description, assigned_agent_id, dependencies_json, status, retries, max_retries, timeout_ms, approval_id, output, error, started_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            assigned_agent_id = excluded.assigned_agent_id,
            dependencies_json = excluded.dependencies_json,
            status = excluded.status,
            retries = excluded.retries,
            max_retries = excluded.max_retries,
            timeout_ms = excluded.timeout_ms,
            approval_id = excluded.approval_id,
            output = excluded.output,
            error = excluded.error,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at`,
    args: [
      task.id,
      task.runId,
      task.title,
      task.description ?? null,
      task.assignedAgentId ?? null,
      JSON.stringify(task.dependencies || []),
      task.status || "PENDING",
      task.retries ?? 0,
      task.maxRetries ?? 3,
      task.timeoutMs ?? 60000,
      task.approvalId ?? null,
      task.output ?? null,
      task.error ?? null,
      task.startedAt ?? null,
      task.completedAt ?? null,
    ],
  });
}

function parseTaskRow(r: Record<string, unknown>): Task {
  let deps: string[] = [];
  try {
    deps = JSON.parse(String(r.dependencies_json || "[]")) as string[];
  } catch {
    deps = [];
  }
  return {
    id: String(r.id),
    runId: String(r.run_id),
    title: String(r.title),
    description: r.description ? String(r.description) : null,
    assignedAgentId: r.assigned_agent_id ? String(r.assigned_agent_id) : null,
    dependencies: deps,
    status: r.status as TaskStatus,
    retries: Number(r.retries || 0),
    maxRetries: Number(r.max_retries || 3),
    timeoutMs: Number(r.timeout_ms || 60000),
    approvalId: r.approval_id ? String(r.approval_id) : null,
    output: r.output ? String(r.output) : null,
    error: r.error ? String(r.error) : null,
    startedAt: r.started_at ? String(r.started_at) : null,
    completedAt: r.completed_at ? String(r.completed_at) : null,
  };
}

export async function getTask(id: string, client?: Client): Promise<Task | null> {
  const c = client ?? (await db());
  const res = await c.execute({
    sql: "SELECT * FROM tasks WHERE id = ?",
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return null;
  return parseTaskRow(r as unknown as Record<string, unknown>);
}

export async function updateTask(id: string, patch: Partial<Task>, client?: Client): Promise<void> {
  const c = client ?? (await db());
  const existing = await getTask(id, c);
  if (!existing) throw new Error(`Task ${id} not found`);

  const updated: Task = { ...existing, ...patch };
  await c.execute({
    sql: `UPDATE tasks SET
            title = ?, description = ?, assigned_agent_id = ?, dependencies_json = ?, status = ?,
            retries = ?, max_retries = ?, timeout_ms = ?, approval_id = ?, output = ?, error = ?,
            started_at = ?, completed_at = ?
          WHERE id = ?`,
    args: [
      updated.title,
      updated.description ?? null,
      updated.assignedAgentId ?? null,
      JSON.stringify(updated.dependencies || []),
      updated.status,
      updated.retries,
      updated.maxRetries,
      updated.timeoutMs,
      updated.approvalId ?? null,
      updated.output ?? null,
      updated.error ?? null,
      updated.startedAt ?? null,
      updated.completedAt ?? null,
      id,
    ],
  });
}

export async function listTasksByRun(runId: string, client?: Client): Promise<Task[]> {
  const c = client ?? (await db());
  const res = await c.execute({
    sql: "SELECT * FROM tasks WHERE run_id = ?",
    args: [runId],
  });
  return res.rows.map((r) => parseTaskRow(r as unknown as Record<string, unknown>));
}

export async function getRunDetails(
  runId: string,
  client?: Client,
): Promise<{ run: Run; tasks: Task[] } | null> {
  const c = client ?? (await db());
  const run = await getRun(runId, c);
  if (!run) return null;
  const tasks = await listTasksByRun(runId, c);
  return { run, tasks };
}

// ── room collaboration messages (Module C: Multi-Agent Collaboration) ──

export interface RoomCollaborationMessageInput {
  id?: string;
  roomId: string;
  runId?: string | null;
  senderAgentId: string;
  recipientAgentId?: string | null;
  messageType: CollaborationMessageType;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

export async function createCollaborationMessage(
  msg: RoomCollaborationMessageInput,
  client?: Client,
): Promise<void> {
  const c = client ?? (await db());
  const id =
    msg.id ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `collab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  await c.execute({
    sql: `INSERT INTO room_collaboration_messages (
            id, room_id, run_id, sender_agent_id, recipient_agent_id, message_type, content, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      msg.roomId,
      msg.runId ?? null,
      msg.senderAgentId,
      msg.recipientAgentId ?? null,
      msg.messageType,
      msg.content,
      msg.metadata ? JSON.stringify(msg.metadata) : null,
      msg.createdAt || new Date().toISOString(),
    ],
  });
}

export async function listCollaborationMessages(
  roomId: string,
  options?: { runId?: string; limit?: number },
  client?: Client,
): Promise<RoomCollaborationMessage[]> {
  const c = client ?? (await db());
  const limit = options?.limit ?? 100;
  const conditions = ["room_id = ?"];
  const args: (string | number)[] = [roomId];

  if (options?.runId) {
    conditions.push("run_id = ?");
    args.push(options.runId);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  args.push(limit);

  const res = await c.execute({
    sql: `SELECT id, room_id, run_id, sender_agent_id, recipient_agent_id, message_type, content, metadata_json, created_at
          FROM room_collaboration_messages ${whereClause} ORDER BY created_at ASC LIMIT ?`,
    args,
  });

  return res.rows.map((r) => {
    let metadata: Record<string, unknown> | null = null;
    if (r.metadata_json) {
      try {
        metadata = JSON.parse(String(r.metadata_json)) as Record<string, unknown>;
      } catch {
        metadata = null;
      }
    }
    return {
      id: String(r.id),
      roomId: String(r.room_id),
      runId: r.run_id ? String(r.run_id) : null,
      senderAgentId: String(r.sender_agent_id),
      recipientAgentId: r.recipient_agent_id ? String(r.recipient_agent_id) : null,
      messageType: r.message_type as CollaborationMessageType,
      content: String(r.content),
      metadata,
      createdAt: String(r.created_at),
    };
  });
}

// ── scheduled workflows & runs (Module I: Scheduled AI Workflows) ──────

export interface ScheduledWorkflowInput {
  id: string;
  name: string;
  description?: string | null;
  roomId?: string | null;
  goalPrompt: string;
  cronExpression: string;
  status?: WorkflowStatus;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastStatus?: string | null;
  lastError?: string | null;
  createdAt?: string;
}

export async function createScheduledWorkflow(
  workflow: ScheduledWorkflowInput,
  client?: Client,
): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: `INSERT INTO scheduled_workflows (
            id, name, description, room_id, goal_prompt, cron_expression, status, last_run_at, next_run_at, last_status, last_error, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            room_id = excluded.room_id,
            goal_prompt = excluded.goal_prompt,
            cron_expression = excluded.cron_expression,
            status = excluded.status,
            last_run_at = excluded.last_run_at,
            next_run_at = excluded.next_run_at,
            last_status = excluded.last_status,
            last_error = excluded.last_error`,
    args: [
      workflow.id,
      workflow.name,
      workflow.description ?? null,
      workflow.roomId ?? null,
      workflow.goalPrompt,
      workflow.cronExpression,
      workflow.status || "ACTIVE",
      workflow.lastRunAt ?? null,
      workflow.nextRunAt ?? null,
      workflow.lastStatus ?? null,
      workflow.lastError ?? null,
      workflow.createdAt || new Date().toISOString(),
    ],
  });
}

export async function getScheduledWorkflow(id: string, client?: Client): Promise<ScheduledWorkflow | null> {
  const c = client ?? (await db());
  const res = await c.execute({
    sql: "SELECT * FROM scheduled_workflows WHERE id = ?",
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    roomId: r.room_id ? String(r.room_id) : null,
    goalPrompt: String(r.goal_prompt),
    cronExpression: String(r.cron_expression),
    status: r.status as WorkflowStatus,
    lastRunAt: r.last_run_at ? String(r.last_run_at) : null,
    nextRunAt: r.next_run_at ? String(r.next_run_at) : null,
    lastStatus: r.last_status ? String(r.last_status) : null,
    lastError: r.last_error ? String(r.last_error) : null,
    createdAt: String(r.created_at),
  };
}

export async function updateScheduledWorkflow(
  id: string,
  patch: Partial<ScheduledWorkflow>,
  client?: Client,
): Promise<void> {
  const c = client ?? (await db());
  const existing = await getScheduledWorkflow(id, c);
  if (!existing) throw new Error(`Scheduled workflow ${id} not found`);

  const updated: ScheduledWorkflow = { ...existing, ...patch };
  await c.execute({
    sql: `UPDATE scheduled_workflows SET
            name = ?, description = ?, room_id = ?, goal_prompt = ?, cron_expression = ?,
            status = ?, last_run_at = ?, next_run_at = ?, last_status = ?, last_error = ?
          WHERE id = ?`,
    args: [
      updated.name,
      updated.description ?? null,
      updated.roomId ?? null,
      updated.goalPrompt,
      updated.cronExpression,
      updated.status,
      updated.lastRunAt ?? null,
      updated.nextRunAt ?? null,
      updated.lastStatus ?? null,
      updated.lastError ?? null,
      id,
    ],
  });
}

export async function listScheduledWorkflows(
  filter?: { status?: WorkflowStatus; roomId?: string },
  client?: Client,
): Promise<ScheduledWorkflow[]> {
  const c = client ?? (await db());
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (filter?.status) {
    conditions.push("status = ?");
    args.push(filter.status);
  }
  if (filter?.roomId) {
    conditions.push("room_id = ?");
    args.push(filter.roomId);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const res = await c.execute({
    sql: `SELECT * FROM scheduled_workflows ${whereClause} ORDER BY created_at DESC`,
    args,
  });

  return res.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    roomId: r.room_id ? String(r.room_id) : null,
    goalPrompt: String(r.goal_prompt),
    cronExpression: String(r.cron_expression),
    status: r.status as WorkflowStatus,
    lastRunAt: r.last_run_at ? String(r.last_run_at) : null,
    nextRunAt: r.next_run_at ? String(r.next_run_at) : null,
    lastStatus: r.last_status ? String(r.last_status) : null,
    lastError: r.last_error ? String(r.last_error) : null,
    createdAt: String(r.created_at),
  }));
}

export async function deleteScheduledWorkflow(id: string, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({ sql: "DELETE FROM scheduled_workflows WHERE id = ?", args: [id] });
  await c.execute({ sql: "DELETE FROM workflow_runs WHERE workflow_id = ?", args: [id] });
}

export async function createWorkflowRun(record: WorkflowRunRecord, client?: Client): Promise<void> {
  const c = client ?? (await db());
  await c.execute({
    sql: `INSERT INTO workflow_runs (id, workflow_id, run_id, trigger_type, status, started_at, completed_at, error)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.id,
      record.workflowId,
      record.runId ?? null,
      record.triggerType,
      record.status,
      record.startedAt,
      record.completedAt ?? null,
      record.error ?? null,
    ],
  });
}

export async function updateWorkflowRun(
  id: string,
  patch: Partial<WorkflowRunRecord>,
  client?: Client,
): Promise<void> {
  const c = client ?? (await db());
  const res = await c.execute({ sql: "SELECT * FROM workflow_runs WHERE id = ?", args: [id] });
  const r = res.rows[0];
  if (!r) throw new Error(`Workflow run ${id} not found`);

  const updated: WorkflowRunRecord = {
    id: String(r.id),
    workflowId: String(r.workflow_id),
    runId: r.run_id ? String(r.run_id) : null,
    triggerType: r.trigger_type as WorkflowTriggerType,
    status: String(r.status),
    startedAt: String(r.started_at),
    completedAt: r.completed_at ? String(r.completed_at) : null,
    error: r.error ? String(r.error) : null,
    ...patch,
  };

  await c.execute({
    sql: `UPDATE workflow_runs SET status = ?, completed_at = ?, error = ? WHERE id = ?`,
    args: [updated.status, updated.completedAt ?? null, updated.error ?? null, id],
  });
}

export async function listWorkflowRuns(
  workflowId: string,
  limit = 50,
  client?: Client,
): Promise<WorkflowRunRecord[]> {
  const c = client ?? (await db());
  const res = await c.execute({
    sql: "SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?",
    args: [workflowId, limit],
  });
  return res.rows.map((r) => ({
    id: String(r.id),
    workflowId: String(r.workflow_id),
    runId: r.run_id ? String(r.run_id) : null,
    triggerType: r.trigger_type as WorkflowTriggerType,
    status: String(r.status),
    startedAt: String(r.started_at),
    completedAt: r.completed_at ? String(r.completed_at) : null,
    error: r.error ? String(r.error) : null,
  }));
}
