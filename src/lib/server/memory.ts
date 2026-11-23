// Module E: Persistent Scoped Markdown Memory System
// Supports 5 scopes: agents, rooms, projects, user preferences, decisions, and tasks.
// Always reads directly from disk with zero stale caching and mandatory provenance formatting.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { DATA_DIR, MEMORY_DIR, WORKSPACES_DIR } from "./config";

export type MemoryScope = "agent" | "room" | "project" | "user" | "decisions" | "tasks";

export const MEMORY_SCOPES: MemoryScope[] = ["agent", "room", "project", "user", "decisions", "tasks"];

export interface ProvenanceMemoryInput {
  content: string;
  source?: string;
  reason?: string;
  timestamp?: string;
}

export interface MemoryFileInfo {
  scope: MemoryScope;
  id: string;
  path: string;
  absolutePath: string;
  size: number;
  lastModified: string;
}

export const SECRET_PATTERNS: RegExp[] = [
  /\b(sk|pk|rk|tvly|ak|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{12,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S+/gi,
];

/** Strips API keys, passwords, and tokens before persisting to disk. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (m) => `«redacted ${m.length} chars»`);
  }
  return out;
}

/** Formats a memory entry into the mandatory provenance format. */
export function formatProvenanceEntry(input: ProvenanceMemoryInput): string {
  const timestamp = input.timestamp || new Date().toISOString();
  const source = input.source || "user";
  const reason = input.reason || "Observed requirement or statement";
  const cleanContent = input.content.trim().replace(/\r?\n+/g, " ");
  return `- [${timestamp}] | Source: ${source} | Reason: ${reason} | Content: ${cleanContent}`;
}

export class MemoryService {
  readonly baseDir: string;

  constructor(baseDir: string = MEMORY_DIR) {
    this.baseDir = resolve(baseDir);
    this.ensureDirs();
  }

  ensureDirs(): void {
    mkdirSync(this.baseDir, { recursive: true });
    mkdirSync(join(this.baseDir, "agents"), { recursive: true });
    mkdirSync(join(this.baseDir, "rooms"), { recursive: true });
    mkdirSync(join(this.baseDir, "projects"), { recursive: true });
    mkdirSync(join(this.baseDir, "user"), { recursive: true });
    mkdirSync(join(this.baseDir, "decisions"), { recursive: true });
    mkdirSync(join(this.baseDir, "tasks"), { recursive: true });
  }

  resolveFilePath(scope: MemoryScope | string, id?: string): string {
    const cleanId = (id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const normalizedScope = (scope || "").toLowerCase().trim().replace(/s$/, "");

    switch (normalizedScope) {
      case "agent": {
        const fileId = cleanId || "default";
        return join(this.baseDir, "agents", `${fileId}.md`);
      }
      case "room": {
        const fileId = cleanId || "default";
        return join(this.baseDir, "rooms", `${fileId}.md`);
      }
      case "project": {
        const fileId = cleanId || "default";
        return join(this.baseDir, "projects", `${fileId}.md`);
      }
      case "user": {
        const fileId = cleanId || "preferences";
        return join(this.baseDir, "user", `${fileId}.md`);
      }
      case "decision": {
        const fileId = cleanId || "log";
        return join(this.baseDir, "decisions", `${fileId}.md`);
      }
      case "task": {
        const fileId = cleanId || "history";
        return join(this.baseDir, "tasks", `${fileId}.md`);
      }
      default: {
        const folder = (scope || "").toLowerCase().trim();
        const fileId = cleanId || "default";
        return join(this.baseDir, folder, `${fileId}.md`);
      }
    }
  }

  /** Read file directly from disk on every invocation. Never cached in RAM. */
  readFile(scope: MemoryScope, id?: string): string {
    const path = this.resolveFilePath(scope, id);
    if (existsSync(path)) {
      return readFileSync(path, "utf8");
    }
    // Backward compatibility for agent memory: check data/workspaces/<botId>/MEMORY.md
    if (scope === "agent" && id) {
      const legacyPath = join(WORKSPACES_DIR, id.replace(/[^a-zA-Z0-9_-]/g, ""), "MEMORY.md");
      if (existsSync(legacyPath)) {
        return readFileSync(legacyPath, "utf8");
      }
    }
    return "";
  }

  /** Write cleaned Markdown directly to disk. Runs automatic secret redaction. */
  writeFile(scope: MemoryScope, id: string | undefined, content: string): string {
    this.ensureDirs();
    const path = this.resolveFilePath(scope, id);
    const clean = redactSecrets(content);
    const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
    writeFileSync(tmp, clean, { mode: 0o600 });
    try {
      renameSync(tmp, path);
    } catch {
      // Windows / OneDrive fallback when atomic rename over an existing file is locked
      writeFileSync(path, clean, { mode: 0o600 });
      try {
        rmSync(tmp, { force: true });
      } catch {
        // ignore
      }
    }

    // If writing agent memory, also update legacy workspace for backwards compatibility
    if (scope === "agent" && id) {
      try {
        const legacyDir = join(WORKSPACES_DIR, id.replace(/[^a-zA-Z0-9_-]/g, ""));
        mkdirSync(legacyDir, { recursive: true });
        const legacyPath = join(legacyDir, "MEMORY.md");
        writeFileSync(legacyPath, clean, { mode: 0o600 });
      } catch {
        // legacy workspace is best-effort
      }
    }

    return clean;
  }

  /** Appends a new provenance-tagged memory entry. */
  appendEntry(scope: MemoryScope, id: string | undefined, entry: ProvenanceMemoryInput): string {
    const formatted = formatProvenanceEntry(entry);
    const cleanLine = redactSecrets(formatted);
    const existing = this.readFile(scope, id).trimEnd();
    const updated = existing ? `${existing}\n${cleanLine}\n` : `${cleanLine}\n`;
    this.writeFile(scope, id, updated);
    return cleanLine;
  }

  /** Replaces an exact string occurrence in the memory file. */
  editFile(scope: MemoryScope, id: string | undefined, find: string, replace: string): { ok: boolean; reason?: string } {
    const content = this.readFile(scope, id);
    const count = content.split(find).length - 1;
    if (!find || count === 0) {
      return { ok: false, reason: "That exact text isn't in memory. Copy the text exactly." };
    }
    if (count > 1) {
      return { ok: false, reason: `That text appears ${count} times. Include more surrounding words to match once.` };
    }
    this.writeFile(scope, id, content.replace(find, replace));
    return { ok: true };
  }

  /** Lists all existing Markdown memory files across scopes with metadata. */
  listFiles(): MemoryFileInfo[] {
    this.ensureDirs();
    const files: MemoryFileInfo[] = [];

    const scanScope = (scope: MemoryScope, folderName: string) => {
      const dir = join(this.baseDir, folderName);
      if (!existsSync(dir)) return;
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".md")) continue;
        const fullPath = join(dir, file);
        try {
          const st = statSync(fullPath);
          const id = file.replace(/\.md$/, "");
          files.push({
            scope,
            id,
            path: `${folderName}/${file}`,
            absolutePath: fullPath,
            size: st.size,
            lastModified: st.mtime.toISOString(),
          });
        } catch {
          // ignore unreadable
        }
      }
    };

    scanScope("agent", "agents");
    scanScope("room", "rooms");
    scanScope("project", "projects");
    scanScope("user", "user");
    scanScope("decisions", "decisions");
    scanScope("tasks", "tasks");

    return files.sort((a, b) => a.scope.localeCompare(b.scope) || a.id.localeCompare(b.id));
  }

  /**
   * Directly reads live memory files from disk on every agent turn and builds
   * the system prompt context. User preferences are never truncated.
   */
  getPromptContext(options: { agentId?: string; roomId?: string; projectId?: string }): string {
    const sections: string[] = [];

    // 1. User Preferences: ALWAYS included in full (zero truncation)
    const userPrefs = this.readFile("user", "preferences").trim();
    if (userPrefs) {
      sections.push(`## User Preferences (Global)\n${userPrefs}`);
    }

    // 2. Individual Agent Memory
    if (options.agentId) {
      const agentMemory = this.readFile("agent", options.agentId).trim();
      if (agentMemory) {
        sections.push(`## Your Memory\n${agentMemory}`);
      }
    }

    // 3. Shared Room Memory
    if (options.roomId) {
      const roomMemory = this.readFile("room", options.roomId).trim();
      if (roomMemory) {
        sections.push(`## Shared Room Memory\n${roomMemory}`);
      }
    }

    // 4. Project Memory
    if (options.projectId) {
      const projectMemory = this.readFile("project", options.projectId).trim();
      if (projectMemory) {
        sections.push(`## Project Memory\n${projectMemory}`);
      }
    }

    // 5. Decisions Log
    const decisions = this.readFile("decisions", "log").trim();
    if (decisions) {
      sections.push(`## Important Decisions Log\n${decisions}`);
    }

    // 6. Task History
    const taskHistory = this.readFile("tasks", "history").trim();
    if (taskHistory) {
      sections.push(`## Task Context & History\n${taskHistory}`);
    }

    return sections.join("\n\n");
  }
}

export const memoryService = new MemoryService();
