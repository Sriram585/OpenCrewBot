// Backwards compatibility layer for legacy bot memory calls, delegating directly to MemoryService.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACES_DIR } from "./config";
import { memoryService, redactSecrets } from "./memory";

export { redactSecrets };

export const MEMORY_PROMPT_LIMIT = { lines: 200, bytes: 16 * 1024 };

export function workspaceDir(botId: string): string {
  return join(WORKSPACES_DIR, botId.replace(/[^a-zA-Z0-9_-]/g, ""));
}

export function memoryPath(botId: string): string {
  return memoryService.resolveFilePath("agent", botId);
}

export function readMemory(botId: string): string {
  return memoryService.readFile("agent", botId);
}

export function writeMemory(botId: string, content: string): string {
  return memoryService.writeFile("agent", botId, content);
}

export function appendMemory(botId: string, note: string, section?: string): string {
  return memoryService.appendEntry("agent", botId, {
    content: note,
    reason: section || "Durable fact",
    source: "user",
  });
}

export function editMemory(botId: string, find: string, replace: string): { ok: boolean; reason?: string } {
  return memoryService.editFile("agent", botId, find, replace);
}

export function deleteWorkspace(botId: string): void {
  rmSync(workspaceDir(botId), { recursive: true, force: true });
}

export function memoryForPrompt(botId: string): { text: string; truncated: boolean } {
  const full = readMemory(botId);
  return { text: full.trim(), truncated: false };
}
