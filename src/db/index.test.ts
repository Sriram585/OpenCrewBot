import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  openClient,
  getSetting,
  setSetting,
  listBots,
  getBot,
  saveBot,
  deleteBotRow,
  listRooms,
  getRoom,
  saveRoom,
  deleteRoomRow,
  saveMessage,
  listMessages,
  clearMessages,
  lastMessages,
  unreadCounts,
  markRead,
  conversationGeneration,
  bumpGeneration,
  saveAgentModelConfig,
  getAgentModelConfig,
  listAgentModelConfigs,
  deleteAgentModelConfig,
  logModelUsage,
  listModelUsageLogs,
  getModelUsageSummary,
} from "./index";
import type { Client } from "@libsql/client";
import type { Bot, ChatMessage, Room } from "@/lib/shared/types";

describe("SQLite Database Module (src/db)", () => {
  let client: Client;

  beforeEach(async () => {
    // Isolated in-memory SQLite database for each test
    client = await openClient(":memory:");
  });

  afterEach(async () => {
    try {
      client.close();
    } catch {
      // ignore
    }
  });

  describe("Settings", () => {
    it("returns undefined for unset keys", async () => {
      const val = await getSetting("missing_key", client);
      expect(val).toBeUndefined();
    });

    it("saves and retrieves settings", async () => {
      await setSetting("test.key", { enabled: true, count: 42 }, client);
      const val = await getSetting<{ enabled: boolean; count: number }>("test.key", client);
      expect(val).toEqual({ enabled: true, count: 42 });
    });

    it("overwrites settings on conflict", async () => {
      await setSetting("test.key", "first", client);
      await setSetting("test.key", "second", client);
      const val = await getSetting<string>("test.key", client);
      expect(val).toBe("second");
    });
  });

  describe("Bots", () => {
    const mockBot: Bot = {
      id: "bot-1",
      name: "TestBot",
      handle: "testbot",
      title: "Assistant",
      description: "A test assistant",
      instructions: "Be helpful",
      emoji: "🤖",
      color: "#000000",
      model: "test-model",
      tools: {
        webSearch: false,
        memory: true,
        codeMode: false,
        browser: false,
        askUser: false,
      },
      connections: [],
      approval: "ask",
      pinned: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    it("saves, gets, and lists bots", async () => {
      expect(await listBots(client)).toEqual([]);

      await saveBot(mockBot, client);
      const fetched = await getBot("bot-1", client);
      expect(fetched).toEqual(mockBot);

      const all = await listBots(client);
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe("TestBot");
    });

    it("deletes a bot", async () => {
      await saveBot(mockBot, client);
      await deleteBotRow("bot-1", client);
      expect(await getBot("bot-1", client)).toBeNull();
      expect(await listBots(client)).toHaveLength(0);
    });
  });

  describe("Rooms", () => {
    const mockRoom: Room = {
      id: "room-1",
      name: "War Room",
      topic: "Planning",
      emoji: "⚔️",
      memberIds: ["bot-1", "bot-2"],
      leadId: "bot-1",
      responder: "auto",
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    it("saves, gets, and lists rooms", async () => {
      expect(await listRooms(client)).toEqual([]);

      await saveRoom(mockRoom, client);
      const fetched = await getRoom("room-1", client);
      expect(fetched).toEqual(mockRoom);

      const all = await listRooms(client);
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe("War Room");
    });

    it("deletes a room", async () => {
      await saveRoom(mockRoom, client);
      await deleteRoomRow("room-1", client);
      expect(await getRoom("room-1", client)).toBeNull();
      expect(await listRooms(client)).toHaveLength(0);
    });
  });

  describe("Messages and Conversations", () => {
    const convId = "dm:bot-1";
    const userMsg: ChatMessage = {
      id: "msg-1",
      conversationId: convId,
      role: "user",
      createdAt: "2026-01-01T10:00:00.000Z",
      status: "done",
      parts: [{ kind: "text", text: "Hello" }],
    };
    const botMsg: ChatMessage = {
      id: "msg-2",
      conversationId: convId,
      role: "bot",
      botId: "bot-1",
      createdAt: "2026-01-01T10:01:00.000Z",
      status: "done",
      parts: [{ kind: "text", text: "Hi there!" }],
    };

    it("saves and lists messages ordered by created_at", async () => {
      await saveMessage(userMsg, client);
      await saveMessage(botMsg, client);

      const msgs = await listMessages(convId, 10, client);
      expect(msgs).toHaveLength(2);
      expect(msgs[0].id).toBe("msg-1");
      expect(msgs[1].id).toBe("msg-2");
    });

    it("tracks unread counts and marks read", async () => {
      await saveMessage(userMsg, client);
      await saveMessage(botMsg, client);

      const unreadBefore = await unreadCounts(client);
      expect(unreadBefore.get(convId)).toBe(1); // bot message is unread

      await markRead(convId, client);
      const unreadAfter = await unreadCounts(client);
      expect(unreadAfter.get(convId) ?? 0).toBe(0);
    });

    it("manages conversation generations and clearing", async () => {
      expect(await conversationGeneration(convId, client)).toBe(0);
      const nextGen = await bumpGeneration(convId, client);
      expect(nextGen).toBe(1);
      expect(await conversationGeneration(convId, client)).toBe(1);

      await saveMessage(userMsg, client);
      await clearMessages(convId, client);
      expect(await listMessages(convId, 10, client)).toHaveLength(0);
    });

    it("retrieves last messages map across conversations", async () => {
      await saveMessage(userMsg, client);
      await saveMessage(botMsg, client);

      const latest = await lastMessages(client);
      expect(latest.get(convId)?.id).toBe("msg-2");
    });
  });

  describe("Agent Model Configs", () => {
    it("saves, gets, lists, and deletes agent model configs", async () => {
      expect(await listAgentModelConfigs(client)).toHaveLength(0);

      await saveAgentModelConfig(
        {
          agentId: "bot-1",
          provider: "openai",
          primaryModel: "gpt-4o",
          fallbackProvider: "ollama",
          fallbackModel: "llama3.2",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        client,
      );

      const config = await getAgentModelConfig("bot-1", client);
      expect(config?.provider).toBe("openai");
      expect(config?.primaryModel).toBe("gpt-4o");
      expect(config?.fallbackModel).toBe("llama3.2");

      const all = await listAgentModelConfigs(client);
      expect(all).toHaveLength(1);

      await deleteAgentModelConfig("bot-1", client);
      expect(await getAgentModelConfig("bot-1", client)).toBeNull();
    });
  });

  describe("Model Usage Logs", () => {
    it("logs usage, retrieves logs, and computes aggregated summaries", async () => {
      await logModelUsage(
        {
          id: "log-1",
          timestamp: "2026-01-01T12:00:00.000Z",
          agentId: "bot-1",
          taskId: "task-1",
          provider: "nebius",
          model: "MiniMaxAI/MiniMax-M3",
          promptTokens: 500,
          completionTokens: 250,
          estimatedCostUsd: 0.00045,
          fallbackUsed: false,
          isMock: false,
        },
        client,
      );

      await logModelUsage(
        {
          id: "log-2",
          timestamp: "2026-01-01T12:05:00.000Z",
          agentId: "bot-1",
          taskId: "task-2",
          provider: "ollama",
          model: "llama3.2",
          promptTokens: 300,
          completionTokens: 100,
          estimatedCostUsd: 0,
          fallbackUsed: true,
          isMock: false,
        },
        client,
      );

      const logs = await listModelUsageLogs({ agentId: "bot-1" }, client);
      expect(logs).toHaveLength(2);
      expect(logs[0].id).toBe("log-2"); // ordered desc

      const summary = await getModelUsageSummary({ agentId: "bot-1" }, client);
      expect(summary.totalCalls).toBe(2);
      expect(summary.totalPromptTokens).toBe(800);
      expect(summary.totalCompletionTokens).toBe(350);
      expect(summary.totalTokens).toBe(1150);
      expect(summary.fallbackCalls).toBe(1);
      expect(summary.mockCalls).toBe(0);
      expect(summary.byModel["nebius/MiniMaxAI/MiniMax-M3"]).toBeDefined();
      expect(summary.byModel["ollama/llama3.2"]).toBeDefined();
    });
  });
});
