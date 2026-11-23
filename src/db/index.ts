// Local SQLite database module for OpenCrewBot.
// Manages local persistence for bots, rooms, messages, settings, and conversations.
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
