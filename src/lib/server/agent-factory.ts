// Module B: Dynamic Agent Creation & Specialized Pre-Seeded Agent Factory
// Supports on-demand natural language agent creation and pre-seeds 8 production-grade specialized agents.
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import type { Bot, BotInput } from "@/lib/shared/types";
import { DEFAULT_MODEL } from "./models";
import { memoryService } from "./memory";
import { getBot, listBots, saveAgentModelConfig, saveBot } from "./db";
import { publish } from "./bus";

export const PRE_SEEDED_AGENTS: Bot[] = [
  {
    id: "agent-chief-of-staff",
    name: "Chief of Staff",
    handle: "chief-of-staff",
    title: "Executive Orchestrator",
    role: "Executive Orchestrator",
    description: "Coordinates complex workflows, breaks down goals into ordered DAG tasks, and delegates to specialist agents.",
    instructions:
      "You are the Chief of Staff. You analyze high-level strategic objectives, decompose them into modular tasks with clear dependencies, and coordinate specialist agents. Synthesize multi-agent outputs into executive briefings.",
    emoji: "🏛️",
    color: "#4f46e5",
    model: DEFAULT_MODEL,
    modelProvider: "nebius",
    primaryModel: DEFAULT_MODEL,
    fallbackModel: "meta-llama/Llama-3.1-8B-Instruct",
    tools: { webSearch: true, memory: true, codeMode: false, browser: false, askUser: true },
    connections: [],
    skills: ["task_decomposition", "workflow_orchestration", "executive_synthesis", "delegation"],
    approval: "ask",
    permissionLevel: "ASK_FIRST",
    outputFormat: "executive_brief",
    isDynamic: false,
    pinned: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "agent-market-researcher",
    name: "Market Researcher",
    handle: "market-researcher",
    title: "Web & Market Intelligence",
    role: "Web & Market Intelligence",
    description: "Conducts web searches, market size analysis, industry trend extraction, and source verification.",
    instructions:
      "You are the Market Researcher. Discover current market dynamics, consumer sentiment, market size, and growth drivers. Always cite reliable URLs and verify facts across multiple sources.",
    emoji: "🔭",
    color: "#2563eb",
    model: DEFAULT_MODEL,
    modelProvider: "nebius",
    primaryModel: DEFAULT_MODEL,
    fallbackModel: "meta-llama/Llama-3.1-8B-Instruct",
    tools: { webSearch: true, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    skills: ["web_search", "trend_analysis", "market_sizing", "source_verification"],
    approval: "ask",
    permissionLevel: "CONTROLLED_ACCESS",
    outputFormat: "market_report",
    isDynamic: false,
    pinned: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "agent-competitor-analyst",
    name: "Competitor Analyst",
    handle: "competitor-analyst",
    title: "Competitive Intelligence",
    role: "Competitive Intelligence",
    description: "Performs deep competitor benchmarking, feature comparison matrices, and SWOT analyses.",
    instructions:
      "You are the Competitor Analyst. Evaluate competing products, pricing tiers, feature coverage, and strategic positioning. Deliver structured comparison tables and SWOT analyses.",
    emoji: "⚔️",
    color: "#dc2626",
    model: DEFAULT_MODEL,
    modelProvider: "nebius",
    primaryModel: DEFAULT_MODEL,
    fallbackModel: "meta-llama/Llama-3.1-8B-Instruct",
    tools: { webSearch: true, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    skills: ["competitor_benchmarking", "swot_analysis", "feature_matrix", "pricing_analysis"],
    approval: "ask",
    permissionLevel: "CONTROLLED_ACCESS",
    outputFormat: "markdown",
    isDynamic: false,
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "agent-marketing-strategist",
    name: "Marketing Strategist",
    handle: "marketing-strategist",
    title: "Go-To-Market & Growth",
    role: "Go-To-Market & Growth",
    description: "Designs marketing funnels, positioning statements, messaging architecture, and campaign roadmaps.",
    instructions:
      "You are the Marketing Strategist. Formulate go-to-market strategies, target buyer personas, value propositions, and multichannel acquisition funnels.",
    emoji: "🎯",
    color: "#ea580c",
    model: DEFAULT_MODEL,
    modelProvider: "nebius",
    primaryModel: DEFAULT_MODEL,
    fallbackModel: "meta-llama/Llama-3.1-8B-Instruct",
    tools: { webSearch: false, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    skills: ["gtm_strategy", "funnel_design", "positioning", "audience_segmentation"],
    approval: "ask",
    permissionLevel: "CONTROLLED_ACCESS",
    outputFormat: "strategy_doc",
    isDynamic: false,
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "agent-content-creator",
    name: "Content Creator",
    handle: "content-creator",
    title: "Copywriting & Content",
    role: "Copywriting & Content",
    description: "Crafts high-converting landing page copy, launch announcements, blog posts, and social copy.",
    instructions:
      "You are the Content Creator. Transform strategic positioning into captivating, authentic, and clear copy. Write engaging headlines, narrative blog posts, launch threads, and email sequences.",
    emoji: "✒️",
    color: "#db2777",
    model: DEFAULT_MODEL,
    modelProvider: "nebius",
    primaryModel: DEFAULT_MODEL,
    fallbackModel: "meta-llama/Llama-3.1-8B-Instruct",
    tools: { webSearch: false, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    skills: ["copywriting", "editorial_writing", "social_media", "storytelling"],
    approval: "ask",
    permissionLevel: "CONTROLLED_ACCESS",
    outputFormat: "markdown",
    isDynamic: false,
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "agent-data-analyst",
    name: "Data Analyst",
    handle: "data-analyst",
    title: "Quantitative & Metrics Analysis",
    role: "Quantitative & Metrics Analysis",
    description: "Analyzes quantitative metrics, computes ROI, runs statistical models, and produces structured summaries.",
    instructions:
      "You are the Data Analyst. Perform rigorous quantitative calculations, statistical validations, and metrics analysis. Use code mode for exact arithmetic.",
    emoji: "📊",
    color: "#059669",
    model: DEFAULT_MODEL,
    modelProvider: "nebius",
    primaryModel: DEFAULT_MODEL,
    fallbackModel: "meta-llama/Llama-3.1-8B-Instruct",
    tools: { webSearch: false, memory: true, codeMode: true, browser: false, askUser: false },
    connections: [],
    skills: ["quantitative_analysis", "metrics_modeling", "code_computation", "roi_calculation"],
    approval: "ask",
    permissionLevel: "CONTROLLED_ACCESS",
    outputFormat: "table_summary",
    isDynamic: false,
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "agent-senior-code-reviewer",
    name: "Senior Code Reviewer",
    handle: "senior-code-reviewer",
    title: "Architecture & Code Quality",
    role: "Architecture & Code Quality",
    description: "Inspects codebases, identifies security vulnerabilities, verifies test coverage, and enforces best practices.",
    instructions:
      "You are the Senior Code Reviewer. Review architecture, design patterns, TypeScript/Python implementations, concurrency models, and security posture. Provide actionable refactoring guidance.",
    emoji: "🛡️",
    color: "#7c3aed",
    model: DEFAULT_MODEL,
    modelProvider: "nebius",
    primaryModel: DEFAULT_MODEL,
    fallbackModel: "meta-llama/Llama-3.1-8B-Instruct",
    tools: { webSearch: false, memory: true, codeMode: true, browser: false, askUser: false },
    connections: [],
    skills: ["code_review", "security_auditing", "architectural_design", "typescript"],
    approval: "ask",
    permissionLevel: "CONTROLLED_ACCESS",
    outputFormat: "code_review",
    isDynamic: false,
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "agent-automation-ops",
    name: "Automation Ops",
    handle: "automation-ops",
    title: "Workflow & Tool Automation",
    role: "Workflow & Tool Automation",
    description: "Automates web workflows, handles cloud browser navigation, coordinates external app actions, and verifies task health.",
    instructions:
      "You are Automation Ops. Execute robust browser actions, automated workflows, and operational integrations. Request human approval for destructive or state-mutating actions.",
    emoji: "⚙️",
    color: "#0891b2",
    model: DEFAULT_MODEL,
    modelProvider: "nebius",
    primaryModel: DEFAULT_MODEL,
    fallbackModel: "meta-llama/Llama-3.1-8B-Instruct",
    tools: { webSearch: true, memory: true, codeMode: true, browser: true, askUser: true },
    connections: [],
    skills: ["browser_automation", "workflow_ops", "pipeline_monitoring", "system_health"],
    approval: "ask",
    permissionLevel: "ASK_FIRST",
    outputFormat: "json",
    isDynamic: false,
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

export async function seedSpecializedAgents(client?: Client): Promise<Bot[]> {
  const existingBots = await listBots(client);
  const existingIds = new Set(existingBots.map((b) => b.id));
  const seeded: Bot[] = [];

  for (const agent of PRE_SEEDED_AGENTS) {
    if (!existingIds.has(agent.id)) {
      await saveBot(agent, client);
      await saveAgentModelConfig(
        {
          agentId: agent.id,
          provider: agent.modelProvider || "nebius",
          primaryModel: agent.primaryModel || agent.model,
          fallbackProvider: agent.modelProvider || "nebius",
          fallbackModel: agent.fallbackModel || null,
          updatedAt: agent.createdAt,
        },
        client,
      );
      // Initialize memory file
      memoryService.appendEntry("agent", agent.id, {
        content: `Agent ${agent.name} initialized with role ${agent.role}`,
        source: "system",
        reason: "Pre-seeded specialized agent initialization",
      });
      seeded.push(agent);
    }
  }

  if (seeded.length > 0) {
    publish({ type: "bots-changed" });
  }

  return seeded;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "agent";
}

async function generateUniqueHandle(name: string, client?: Client): Promise<string> {
  const bots = await listBots(client);
  const taken = new Set(bots.map((b) => b.handle));
  const base = slugify(name);
  let candidate = base;
  for (let n = 2; taken.has(candidate) || candidate === "all" || candidate === "everyone"; n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export interface ParsedAgentSpec {
  name: string;
  role: string;
  description: string;
  instructions: string;
  modelProvider: string;
  primaryModel: string;
  fallbackModel: string | null;
  tools: {
    webSearch: boolean;
    memory: boolean;
    codeMode: boolean;
    browser: boolean;
    askUser: boolean;
  };
  skills: string[];
  permissionLevel: "ASK_FIRST" | "CONTROLLED_ACCESS" | "FULL_ACCESS";
  outputFormat: string;
  emoji: string;
  color: string;
}

/**
 * Parses a natural language prompt into a structured agent specification.
 * Uses domain heuristics with robust fallback for mock/local execution.
 */
export function parseAgentPrompt(prompt: string): ParsedAgentSpec {
  const lower = prompt.toLowerCase();

  // 1. Extract name
  let name = "Custom Assistant";
  const nameMatch = prompt.match(/(?:named?|called|name is|create (?:a|an)?)\s+["']?([A-Z][a-zA-Z0-9\s-]{2,25})["']?/i);
  if (nameMatch && nameMatch[1]) {
    const rawName = nameMatch[1].trim().replace(/\b(?:agent|bot|assistant|specialist)\b/gi, "").trim();
    if (rawName.length >= 2) {
      name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    }
  }

  // Common persona keywords
  if (lower.includes("seo")) name = "SEO Specialist";
  else if (lower.includes("security") || lower.includes("pentest")) name = "Security Auditor";
  else if (lower.includes("financial") || lower.includes("accountant")) name = "Financial Analyst";
  else if (lower.includes("legal") || lower.includes("compliance")) name = "Legal Advisor";
  else if (lower.includes("customer support") || lower.includes("helpdesk")) name = "Support Lead";
  else if (lower.includes("devops") || lower.includes("sre") || lower.includes("kubernetes")) name = "DevOps Engineer";
  else if (lower.includes("designer") || lower.includes("ux") || lower.includes("ui")) name = "Product Designer";

  // 2. Derive tools & skills
  const needsWebSearch = /search|browse|web|google|current|news|market|trend|scrape|crawl|extract|keywords|sources/i.test(lower);
  const needsCode = /code|program|developer|math|calc|script|data|analysis|python|typescript|sql/i.test(lower);
  const needsBrowser = /browser|navigate|click|form|login|playwright|puppeteer|webpage/i.test(lower);
  const needsAskUser = /interactive|clarify|question|interview|confirm|ask user/i.test(lower);

  const skills: string[] = ["general_assistance"];
  if (needsWebSearch) skills.push("web_search", "information_retrieval");
  if (needsCode) skills.push("code_execution", "quantitative_analysis");
  if (needsBrowser) skills.push("browser_automation");

  // 3. Permission level
  let permissionLevel: "ASK_FIRST" | "CONTROLLED_ACCESS" | "FULL_ACCESS" = "CONTROLLED_ACCESS";
  if (/critical|danger|destructive|prod|write|deploy|execute|pay/i.test(lower)) {
    permissionLevel = "ASK_FIRST";
  } else if (/fully autonomous|unsupervised|unrestricted|full access/i.test(lower)) {
    permissionLevel = "FULL_ACCESS";
  }

  // 4. Role & Description
  const role = `${name}`;
  const description = `Specialized dynamic agent designed to ${prompt.slice(0, 120)}.`;
  const instructions = `You are ${name}. Your primary objective is: ${prompt.trim()}. Focus on high precision, transparency, and actionable deliverables. Store key facts in memory and provide structured results.`;

  // 5. Visual attributes
  const emojis = ["⚡", "🧠", "🎯", "🔬", "💡", "🚀", "🛡️", "📈", "🛠️", "🎨"];
  const colors = ["#2563eb", "#7c3aed", "#059669", "#ea580c", "#dc2626", "#0891b2", "#db2777"];
  const hash = Math.abs(name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0));
  const emoji = emojis[hash % emojis.length];
  const color = colors[hash % colors.length];

  return {
    name,
    role,
    description,
    instructions,
    modelProvider: "nebius",
    primaryModel: DEFAULT_MODEL,
    fallbackModel: "meta-llama/Llama-3.1-8B-Instruct",
    tools: {
      webSearch: needsWebSearch,
      memory: true,
      codeMode: needsCode,
      browser: needsBrowser,
      askUser: needsAskUser,
    },
    skills,
    permissionLevel,
    outputFormat: "markdown",
    emoji,
    color,
  };
}

/**
 * Creates an agent dynamically from natural language prompt, persists it in SQLite,
 * initializes its memory file with provenance, and registers model configuration.
 */
export async function createAgentFromNaturalLanguage(
  prompt: string,
  client?: Client,
): Promise<Bot> {
  if (!prompt || !prompt.trim()) {
    throw new Error("Natural language prompt is required to create an agent.");
  }

  const spec = parseAgentPrompt(prompt);
  const id = `agent-dyn-${randomUUID().slice(0, 8)}`;
  const handle = await generateUniqueHandle(spec.name, client);

  const bot: Bot = {
    id,
    name: spec.name,
    handle,
    title: spec.role,
    role: spec.role,
    description: spec.description,
    instructions: spec.instructions,
    emoji: spec.emoji,
    color: spec.color,
    model: spec.primaryModel,
    modelProvider: spec.modelProvider,
    primaryModel: spec.primaryModel,
    fallbackModel: spec.fallbackModel,
    tools: spec.tools,
    connections: [],
    skills: spec.skills,
    approval: spec.permissionLevel === "FULL_ACCESS" ? "full" : "ask",
    permissionLevel: spec.permissionLevel,
    outputFormat: spec.outputFormat,
    isDynamic: true,
    pinned: false,
    createdAt: new Date().toISOString(),
  };

  // 1. Save to SQLite bots table
  await saveBot(bot, client);

  // 2. Save model configuration
  await saveAgentModelConfig(
    {
      agentId: bot.id,
      provider: bot.modelProvider || "nebius",
      primaryModel: bot.primaryModel || bot.model,
      fallbackProvider: bot.modelProvider || "nebius",
      fallbackModel: bot.fallbackModel || null,
      updatedAt: bot.createdAt,
    },
    client,
  );

  // 3. Initialize scoped agent Markdown memory file with mandatory provenance
  memoryService.appendEntry("agent", bot.id, {
    content: `Agent ${bot.name} created dynamically from user prompt: "${prompt.trim()}"`,
    source: "user",
    reason: "Dynamic natural language agent creation",
    timestamp: bot.createdAt,
  });

  publish({ type: "bots-changed" });

  return bot;
}
