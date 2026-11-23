import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openClient, listModelUsageLogs, getModelUsageSummary, saveAgentModelConfig } from "@/db";
import type { Client } from "@libsql/client";
import {
  getAvailableProviders,
  resolveMastraModelConfig,
  resolveModelForTask,
  resolveModelForAgent,
  executeModelWithFallback,
  DEFAULT_TASK_ROUTING,
} from "./models";
import { createMockModel, MOCK_PREFIX } from "./mock-model";

describe("Module J: Multi-Model Intelligence (models.ts)", () => {
  let client: Client;

  beforeEach(async () => {
    // Isolated in-memory SQLite database for each test run
    client = await openClient(":memory:");
  });

  afterEach(async () => {
    try {
      client.close();
    } catch {
      // ignore
    }
  });

  describe("1. Multi-Provider Router & Provider Selection", () => {
    it("returns supported providers including hosted and local Ollama", () => {
      const providers = getAvailableProviders();
      const ids = providers.map((p) => p.id);
      expect(ids).toContain("nebius");
      expect(ids).toContain("openai");
      expect(ids).toContain("gemini");
      expect(ids).toContain("groq");
      expect(ids).toContain("ollama");

      const ollama = providers.find((p) => p.id === "ollama");
      expect(ollama).toBeDefined();
      expect(ollama?.type).toBe("local");
      expect(ollama?.baseUrl).toBe("http://127.0.0.1:11434/v1");
    });

    it("resolves Mastra model configs correctly across providers", () => {
      // Nebius
      expect(resolveMastraModelConfig({ provider: "nebius", model: "MiniMaxAI/MiniMax-M3" }))
        .toBe("nebius/MiniMaxAI/MiniMax-M3");

      // OpenAI
      expect(resolveMastraModelConfig({ provider: "openai", model: "gpt-4o" }))
        .toBe("openai/gpt-4o");

      // Groq
      expect(resolveMastraModelConfig({ provider: "groq", model: "llama-3.3-70b-versatile" }))
        .toBe("groq/llama-3.3-70b-versatile");

      // Gemini maps to google prefix
      expect(resolveMastraModelConfig({ provider: "gemini", model: "gemini-2.0-flash" }))
        .toBe("google/gemini-2.0-flash");

      // Local Ollama returns OpenAICompatibleConfig object
      const ollamaConfig = resolveMastraModelConfig({ provider: "ollama", model: "llama3.2" }) as {
        providerId: string;
        modelId: string;
        url: string;
        apiKey: string;
      };
      expect(ollamaConfig).toEqual({
        providerId: "ollama",
        modelId: "llama3.2",
        url: "http://127.0.0.1:11434/v1",
        apiKey: "ollama",
      });
    });
  });

  describe("2. Task-Based & Per-Agent Routing", () => {
    it("routes tasks to strong vs fast/cheap models by default", () => {
      // Planning & synthesis route to strong models
      const planning = resolveModelForTask("planning", ["nebius", "ollama"]);
      expect(planning.primary.model).toBe("deepseek-ai/DeepSeek-V4-Pro");

      const synthesis = resolveModelForTask("synthesis", ["nebius", "ollama"]);
      expect(synthesis.primary.model).toBe("MiniMaxAI/MiniMax-M3");

      // Execution & routine route to fast/cheap models
      const execution = resolveModelForTask("execution", ["nebius", "ollama"]);
      expect(execution.primary.model).toBe("deepseek-ai/DeepSeek-V4-Flash-0731");

      const routine = resolveModelForTask("routine", ["nebius", "ollama"]);
      expect(routine.primary.model).toBe("nvidia/Nemotron-3_5-Lightning");
    });

    it("adapts task routing to available providers when primary is unconfigured", () => {
      // Only OpenAI is available
      const openAiRoute = resolveModelForTask("planning", ["openai"]);
      expect(openAiRoute.primary.provider).toBe("openai");
      expect(openAiRoute.primary.model).toBe("gpt-4o");

      const openAiRoutine = resolveModelForTask("routine", ["openai"]);
      expect(openAiRoutine.primary.provider).toBe("openai");
      expect(openAiRoutine.primary.model).toBe("gpt-4o-mini");

      // Only Ollama is available
      const ollamaRoute = resolveModelForTask("execution", ["ollama"]);
      expect(ollamaRoute.primary.provider).toBe("ollama");
      expect(ollamaRoute.primary.model).toBe("llama3.2");
    });

    it("respects per-agent configuration overrides stored in SQLite", async () => {
      // Configure agent-specific override in SQLite
      await saveAgentModelConfig(
        {
          agentId: "agent-special-1",
          provider: "openai",
          primaryModel: "gpt-4o",
          fallbackProvider: "ollama",
          fallbackModel: "llama3.2",
          updatedAt: new Date().toISOString(),
        },
        client,
      );

      // Even if task is routine, agent custom config takes precedence
      const resolved = await resolveModelForAgent("agent-special-1", "routine", client);
      expect(resolved.primary).toEqual({ provider: "openai", model: "gpt-4o" });
      expect(resolved.fallback).toEqual({ provider: "ollama", model: "llama3.2" });

      // Unconfigured agent falls back to task routing
      const unconfigured = await resolveModelForAgent("agent-other", "planning", client);
      expect(unconfigured.primary).toEqual(DEFAULT_TASK_ROUTING.planning.primary);
    });
  });

  describe("3. Forced Primary Failure & Automatic Fallback", () => {
    it("catches primary failure (e.g. HTTP 429), invokes fallback, and records fallback_used = 1", async () => {
      const executeFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("HTTP 429: Rate limit exceeded on primary provider"))
        .mockResolvedValueOnce({ text: "Recovered successfully via fallback model" });

      const result = await executeModelWithFallback({
        agentId: "scout-1",
        taskId: "task-test-429",
        taskType: "planning",
        primary: { provider: "nebius", model: "deepseek-ai/DeepSeek-V4-Pro" },
        fallback: { provider: "ollama", model: "llama3.2" },
        promptTokens: 200,
        completionTokens: 80,
        client,
        execute: executeFn,
      });

      expect(executeFn).toHaveBeenCalledTimes(2);
      expect(result.fallbackUsed).toBe(true);
      expect(result.target).toEqual({ provider: "ollama", model: "llama3.2" });
      expect(result.result).toEqual({ text: "Recovered successfully via fallback model" });

      // Verify SQLite log reflects fallback_used = 1
      const logs = await listModelUsageLogs({ agentId: "scout-1" }, client);
      expect(logs).toHaveLength(1);
      expect(logs[0].fallbackUsed).toBe(true);
      expect(logs[0].provider).toBe("ollama");
      expect(logs[0].model).toBe("llama3.2");
      expect(logs[0].promptTokens).toBe(200);
      expect(logs[0].completionTokens).toBe(80);
    });
  });

  describe("4. Token & Cost Tracking (SQLite)", () => {
    it("persists token usage and cost calculation in model_usage_logs and aggregates summary", async () => {
      // 1. Primary success log
      await executeModelWithFallback({
        agentId: "atlas-1",
        taskId: "conv-1",
        primary: { provider: "openai", model: "openai/gpt-4o" },
        promptTokens: 1000,
        completionTokens: 500,
        client,
        execute: async () => ({ ok: true }),
      });

      // 2. Second log for another agent
      await executeModelWithFallback({
        agentId: "quill-1",
        taskId: "conv-2",
        primary: { provider: "nebius", model: "MiniMaxAI/MiniMax-M3" },
        promptTokens: 2000,
        completionTokens: 1000,
        client,
        execute: async () => ({ ok: true }),
      });

      const summary = await getModelUsageSummary(undefined, client);
      expect(summary.totalCalls).toBe(2);
      expect(summary.totalPromptTokens).toBe(3000);
      expect(summary.totalCompletionTokens).toBe(1500);
      expect(summary.totalTokens).toBe(4500);
      expect(summary.totalCostUsd).toBeGreaterThan(0);
      expect(summary.fallbackCalls).toBe(0);

      // Verify breakdown by agent
      expect(summary.byAgent["atlas-1"]).toBeDefined();
      expect(summary.byAgent["atlas-1"].promptTokens).toBe(1000);
      expect(summary.byAgent["quill-1"]).toBeDefined();
      expect(summary.byAgent["quill-1"].promptTokens).toBe(2000);
    });
  });

  describe("5. Mock Mode ([MOCKED] prefix requirement)", () => {
    it("prefixes all mock model outputs with [MOCKED]", async () => {
      const mockModel = createMockModel("Atlas");

      const response = await (mockModel as any).doStream({
        prompt: [{ role: "user", content: "Can you plan a release schedule?" }],
      });

      const reader = response.stream.getReader();
      let streamedText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "text-delta" && typeof value.delta === "string") {
          streamedText += value.delta;
        }
      }

      expect(streamedText).toContain(MOCK_PREFIX);
      expect(streamedText.startsWith(MOCK_PREFIX)).toBe(true);
      expect(streamedText).toContain("Hi, I'm **Atlas**");
    });

    it("prefixes tool results in mock model with [MOCKED]", async () => {
      const mockModel = createMockModel("Scout");

      const response = await (mockModel as any).doStream({
        prompt: [
          { role: "user", content: "remember my favorite color is blue" },
          { role: "tool", content: [{ output: { value: "saved successfully" } }] },
        ],
      });

      const reader = response.stream.getReader();
      let streamedText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "text-delta" && typeof value.delta === "string") {
          streamedText += value.delta;
        }
      }

      expect(streamedText.startsWith(MOCK_PREFIX)).toBe(true);
      expect(streamedText).toContain("Done. The tool returned:");
    });
  });
});
