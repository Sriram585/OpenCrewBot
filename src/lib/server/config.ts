import { existsSync, mkdirSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import type { AppStatus } from "@/lib/shared/types";

// The data folder is chosen at runtime, so keep the bundler from tracing it.
export const DATA_DIR = resolve(/*turbopackIgnore: true*/ process.env.OPENCREWBOT_DATA_DIR || "./data");
export const WORKSPACES_DIR = resolve(DATA_DIR, "workspaces");
export const MEMORY_DIR = resolve(DATA_DIR, "memory");
mkdirSync(WORKSPACES_DIR, { recursive: true });
mkdirSync(MEMORY_DIR, { recursive: true });

// The app was called CrewRoom before; carry an existing database over once.
const APP_DB_PATH = resolve(DATA_DIR, "opencrewbot.db");
const LEGACY_DB_PATH = resolve(DATA_DIR, "crewroom.db");
if (!existsSync(APP_DB_PATH) && existsSync(LEGACY_DB_PATH)) renameSync(LEGACY_DB_PATH, APP_DB_PATH);

export const APP_DB_URL = `file:${APP_DB_PATH}`;
export const MASTRA_DB_URL = `file:${resolve(DATA_DIR, "mastra.db")}`;

/** The single local owner every bot thread belongs to. */
export const OWNER_ID = "owner";

export const keys = {
  nebius: () => Boolean(process.env.NEBIUS_API_KEY),
  openai: () => Boolean(process.env.OPENAI_API_KEY),
  gemini: () => Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
  groq: () => Boolean(process.env.GROQ_API_KEY),
  ollama: () => Boolean(process.env.OLLAMA_BASE_URL),
  tavily: () => Boolean(process.env.TAVILY_API_KEY),
  jev: () => Boolean(process.env.TYPESAFE_API_KEY),
  browserbase: () => Boolean(process.env.BROWSERBASE_API_KEY),
  composio: () => Boolean(process.env.COMPOSIO_API_KEY),
};

/** Without live keys (or when MOCK_MODE=true), bots run on a scripted mock model. */
export const isMock = () => {
  if (process.env.MOCK_MODE === "true" || process.env.MOCK_MODE === "1") return true;
  return !(keys.nebius() || keys.openai() || keys.gemini() || keys.groq() || keys.ollama());
};

export function appStatus(): AppStatus {
  return {
    mock: isMock(),
    keys: {
      nebius: keys.nebius(),
      tavily: keys.tavily(),
      jev: keys.jev(),
      browserbase: keys.browserbase(),
      composio: keys.composio(),
    },
    dataDir: DATA_DIR,
  };
}
