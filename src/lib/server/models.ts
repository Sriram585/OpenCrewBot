// Multi-Provider Model Router, Task-Based Routing, Automatic Fallback, and Usage/Cost Tracking.
// Supports Nebius Token Factory, OpenAI, Gemini, Groq, and local Ollama endpoints.
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import type { ModelOption } from "@/lib/shared/types";
import {
  getAgentModelConfig,
  logModelUsage,
  type AgentModelConfig,
  type ModelUsageLogInput,
} from "@/db";

export const DEFAULT_MODEL = "MiniMaxAI/MiniMax-M3";
export const DEFAULT_PROVIDER = "nebius";

export type ProviderId = "nebius" | "openai" | "gemini" | "groq" | "ollama" | string;

export interface ModelTarget {
  provider: ProviderId;
  model: string;
}

export type TaskType = "planning" | "synthesis" | "execution" | "routine" | "general";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  type: "hosted" | "local";
  available: boolean;
  baseUrl?: string;
}

export function getAvailableProviders(): ProviderInfo[] {
  return [
    {
      id: "nebius",
      name: "Nebius Token Factory",
      type: "hosted",
      available: Boolean(process.env.NEBIUS_API_KEY),
    },
    {
      id: "openai",
      name: "OpenAI",
      type: "hosted",
      available: Boolean(process.env.OPENAI_API_KEY),
    },
    {
      id: "gemini",
      name: "Google Gemini",
      type: "hosted",
      available: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    },
    {
      id: "groq",
      name: "Groq",
      type: "hosted",
      available: Boolean(process.env.GROQ_API_KEY),
    },
    {
      id: "ollama",
      name: "Ollama (Local)",
      type: "local",
      available: Boolean(process.env.OLLAMA_BASE_URL),
      baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
    },
  ];
}

// ── Default Task-Based Routing Profiles ───────────────────────────────────

export const DEFAULT_TASK_ROUTING: Record<TaskType, { primary: ModelTarget; fallback?: ModelTarget }> = {
  planning: {
    primary: { provider: "nebius", model: "deepseek-ai/DeepSeek-V4-Pro" },
    fallback: { provider: "nebius", model: "MiniMaxAI/MiniMax-M3" },
  },
  synthesis: {
    primary: { provider: "nebius", model: "MiniMaxAI/MiniMax-M3" },
    fallback: { provider: "nebius", model: "deepseek-ai/DeepSeek-V4.1-Flash" },
  },
  execution: {
    primary: { provider: "nebius", model: "deepseek-ai/DeepSeek-V4-Flash-0731" },
    fallback: { provider: "ollama", model: "llama3.2" },
  },
  routine: {
    primary: { provider: "nebius", model: "nvidia/Nemotron-3_5-Lightning" },
    fallback: { provider: "ollama", model: "llama3.2" },
  },
  general: {
    primary: { provider: "nebius", model: "MiniMaxAI/MiniMax-M3" },
    fallback: { provider: "nebius", model: "deepseek-ai/DeepSeek-V4-Flash-0731" },
  },
};

/** Resolves task-based model routing, adapting to currently available providers if primary is unconfigured. */
export function resolveModelForTask(taskType: TaskType, overrideProviders?: string[]): { primary: ModelTarget; fallback?: ModelTarget } {
  const profile = DEFAULT_TASK_ROUTING[taskType] || DEFAULT_TASK_ROUTING.general;
  if (!overrideProviders) {
    return profile;
  }

  // If primary provider is in overrideProviders, use standard profile
  if (overrideProviders.includes(profile.primary.provider)) {
    return profile;
  }

  // Fallbacks based on available alternative providers
  if (overrideProviders.includes("openai")) {
    const isStrong = taskType === "planning" || taskType === "synthesis";
    return {
      primary: { provider: "openai", model: isStrong ? "gpt-4o" : "gpt-4o-mini" },
      fallback: { provider: "ollama", model: "llama3.2" },
    };
  }

  if (overrideProviders.includes("gemini")) {
    const isStrong = taskType === "planning" || taskType === "synthesis";
    return {
      primary: { provider: "gemini", model: isStrong ? "gemini-1.5-pro" : "gemini-2.0-flash" },
      fallback: { provider: "ollama", model: "llama3.2" },
    };
  }

  if (overrideProviders.includes("groq")) {
    return {
      primary: { provider: "groq", model: "llama-3.3-70b-versatile" },
      fallback: { provider: "ollama", model: "llama3.2" },
    };
  }

  if (overrideProviders.includes("ollama")) {
    return {
      primary: { provider: "ollama", model: "llama3.2" },
    };
  }

  return profile;
}

/** Resolves model configuration for an agent: checks agent_model_configs first, then task routing, then defaults. */
export async function resolveModelForAgent(
  agentId: string,
  taskType?: TaskType,
  client?: Client,
): Promise<{ primary: ModelTarget; fallback?: ModelTarget }> {
  const custom = await getAgentModelConfig(agentId, client);
  if (custom) {
    return {
      primary: { provider: custom.provider, model: custom.primaryModel },
      fallback: custom.fallbackModel
        ? { provider: custom.fallbackProvider || custom.provider, model: custom.fallbackModel }
        : undefined,
    };
  }

  if (taskType) {
    return resolveModelForTask(taskType);
  }

  return {
    primary: { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL },
    fallback: { provider: "ollama", model: "llama3.2" },
  };
}

/** Resolves Mastra-compatible model config/string for a target model. */
export function resolveMastraModelConfig(target: ModelTarget): unknown {
  if (target.provider === "ollama") {
    return {
      providerId: "ollama",
      modelId: target.model,
      url: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
      apiKey: process.env.OLLAMA_API_KEY || "ollama",
    };
  }
  if (target.provider === "gemini") {
    return `google/${target.model}`;
  }
  return `${target.provider}/${target.model}`;
}

// ── Automatic Fallback Execution ─────────────────────────────────────────

export interface ModelExecutionOptions<T> {
  agentId?: string;
  taskId?: string;
  taskType?: TaskType;
  primary: ModelTarget;
  fallback?: ModelTarget;
  execute: (target: ModelTarget, isFallback: boolean) => Promise<T>;
  promptTokens?: number;
  completionTokens?: number;
  isMock?: boolean;
  client?: Client;
}

export interface ModelExecutionResult<T> {
  result: T;
  target: ModelTarget;
  fallbackUsed: boolean;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number | null;
  logId: string;
}

export async function executeModelWithFallback<T>(
  options: ModelExecutionOptions<T>,
): Promise<ModelExecutionResult<T>> {
  let fallbackUsed = false;
  let target = options.primary;
  let result: T;

  try {
    result = await options.execute(options.primary, false);
  } catch (primaryError) {
    if (options.fallback) {
      target = options.fallback;
      fallbackUsed = true;
      result = await options.execute(options.fallback, true);
    } else {
      throw primaryError;
    }
  }

  const promptTokens = options.promptTokens ?? 0;
  const completionTokens = options.completionTokens ?? 0;
  const modelMeta = await findModel(target.model);
  const cost = costUsd(modelMeta, promptTokens, completionTokens);
  const logId = randomUUID();

  await logModelUsage(
    {
      id: logId,
      timestamp: new Date().toISOString(),
      agentId: options.agentId ?? null,
      taskId: options.taskId ?? null,
      provider: target.provider,
      model: target.model,
      promptTokens,
      completionTokens,
      estimatedCostUsd: cost,
      fallbackUsed,
      isMock: Boolean(options.isMock),
    },
    options.client,
  );

  return {
    result,
    target,
    fallbackUsed,
    promptTokens,
    completionTokens,
    estimatedCostUsd: cost,
    logId,
  };
}

// ── Model Catalog and Pricing ───────────────────────────────────────────

type Row = [id: string, context: number, tools: boolean, reasoning: boolean, vision: boolean, inPerM: number, outPerM: number];

const STATIC: Row[] = [
  // Nebius / Open-source hosted models
  ["MiniMaxAI/MiniMax-M3", 1048576, true, true, false, 0.3, 1.2],
  ["deepseek-ai/DeepSeek-V4-Flash-0731", 1024000, true, true, false, 0.14, 0.28],
  ["deepseek-ai/DeepSeek-V4.1-Flash", 1048000, true, true, true, 0.3, 1.2],
  ["deepseek-ai/DeepSeek-V4-Pro", 1048576, true, true, false, 1.75, 3.5],
  ["Qwen/Qwen3.5-397B-A17B", 262144, true, true, false, 0.6, 3.6],
  ["Qwen/Qwen3.8-27B", 262144, true, true, false, 0.45, 3],
  ["Qwen/Qwen3-235B-A22B-Instruct-2507", 262144, true, false, false, 0.2, 0.6],
  ["Qwen/Qwen3-30B-A3B-Instruct-2507", 262144, true, false, false, 0.1, 0.3],
  ["zai-org/GLM-5.3", 1024000, true, true, false, 1.4, 4.4],
  ["zai-org/GLM-5.3-Flash", 1024000, true, true, false, 0.15, 0.5],
  ["moonshotai/Kimi-K3", 1048576, true, true, false, 3, 15],
  ["moonshotai/Kimi-K2.7-Code", 262144, true, true, false, 0.95, 4],
  ["nvidia/Nemotron-3_5-Lightning", 1048576, true, true, false, 0.06, 0.24],
  ["nvidia/nemotron-3-super-120b-a12b", 262144, true, true, false, 0.3, 0.9],
  ["nvidia/Nemotron-3-Ultra-550b-a55b", 1048576, true, true, false, 1, 3],
  ["openai/gpt-oss-120b", 131072, true, true, false, 0.15, 0.6],
  ["NousResearch/Hermes-4-405B", 131072, true, true, false, 1, 3],
  ["google/gemma-3-27b-it", 110000, true, false, true, 0.1, 0.3],

  // OpenAI hosted models
  ["openai/gpt-4o", 128000, true, true, true, 2.5, 10.0],
  ["openai/gpt-4o-mini", 128000, true, false, true, 0.15, 0.6],
  ["openai/o3-mini", 200000, true, true, false, 1.1, 4.4],

  // Google / Gemini hosted models
  ["google/gemini-2.0-flash", 1048576, true, false, true, 0.1, 0.4],
  ["google/gemini-1.5-pro", 2097152, true, true, true, 1.25, 5.0],

  // Groq hosted models
  ["groq/llama-3.3-70b-versatile", 128000, true, false, false, 0.59, 0.79],
  ["groq/llama-3.1-8b-instant", 128000, true, false, false, 0.05, 0.08],

  // Local Ollama models
  ["ollama/llama3.2", 128000, true, false, false, 0, 0],
  ["ollama/qwen2.5-coder", 128000, true, false, false, 0, 0],
];

function label(id: string): string {
  const name = id.split("/").pop() ?? id;
  return name.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

function fromRow([id, context, tools, reasoning, vision, inPerM, outPerM]: Row, live = false): ModelOption {
  return { id, label: label(id), provider: id.split("/")[0], context, tools, reasoning, vision, inputPerM: inPerM, outputPerM: outPerM, live };
}

const staticOptions = STATIC.map((r) => fromRow(r));

interface LiveModel {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: { modality?: string };
  pricing?: { prompt?: string; completion?: string };
  supported_features?: string[] | null;
  status?: string | null;
}

const g = globalThis as unknown as { __opencrewbotModels?: { at: number; options: ModelOption[] } };
const LIVE_TTL_MS = 10 * 60 * 1000;

async function fetchLive(): Promise<ModelOption[] | null> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.tokenfactory.nebius.com/v1/models?verbose=true", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: LiveModel[] };
    const known = new Map(staticOptions.map((o) => [o.id, o]));
    const options: ModelOption[] = [];
    for (const m of json.data ?? []) {
      const modality = m.architecture?.modality ?? "text->text";
      if (!modality.endsWith("->text")) continue; // skip embedding / image models
      if (m.status && m.status !== "active") continue;
      const base = known.get(m.id);
      const features = m.supported_features ? new Set(m.supported_features.map((f) => f.toLowerCase())) : null;
      const name = m.name ? label(m.name.split("/").pop() ?? m.name) : undefined;
      const perM = (v?: string) => (v === undefined ? null : Math.round(Number(v) * 1e6 * 10_000) / 10_000);
      options.push({
        id: m.id,
        label: name ?? base?.label ?? label(m.id),
        provider: m.id.split("/")[0],
        context: m.context_length ?? base?.context ?? 0,
        tools: features ? features.has("tools") : (base?.tools ?? false),
        reasoning: features ? features.has("reasoning") : (base?.reasoning ?? false),
        vision: base?.vision ?? modality.includes("image"),
        inputPerM: perM(m.pricing?.prompt) ?? base?.inputPerM ?? null,
        outputPerM: perM(m.pricing?.completion) ?? base?.outputPerM ?? null,
        live: true,
      });
    }
    return options.length ? options : null;
  } catch {
    return null;
  }
}

/** The catalog, live from Token Factory when a key is set. `fresh` skips the 10-minute cache. */
export async function listModels(fresh = false): Promise<ModelOption[]> {
  const cached = g.__opencrewbotModels;
  if (!fresh && cached && Date.now() - cached.at < LIVE_TTL_MS) return cached.options;
  const live = await fetchLive();
  const options = (live ?? staticOptions).slice().sort((a, b) => Number(b.tools) - Number(a.tools) || a.id.localeCompare(b.id));
  if (live) g.__opencrewbotModels = { at: Date.now(), options };
  return options;
}

export async function findModel(id: string): Promise<ModelOption | undefined> {
  const catalog = await listModels();
  return catalog.find((m) => m.id === id || m.id.endsWith(`/${id}`) || id.endsWith(`/${m.id}`))
    ?? staticOptions.find((m) => m.id === id || m.id.endsWith(`/${id}`) || id.endsWith(`/${m.id}`));
}

export function costUsd(model: ModelOption | undefined, input: number, output: number): number | null {
  if (!model || model.inputPerM === null || model.outputPerM === null) return null;
  return (input * model.inputPerM + output * model.outputPerM) / 1e6;
}
