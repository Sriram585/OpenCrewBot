import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryService, formatProvenanceEntry, redactSecrets } from "./memory";

describe("Module E: Persistent Memory (memory.ts)", () => {
  let tempDir: string;
  let service: MemoryService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "opencrewbot-memory-test-"));
    service = new MemoryService(tempDir);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe("a) Provenance Formatting", () => {
    it("enforces mandatory provenance format: - [TIMESTAMP] | Source: ... | Reason: ... | Content: ...", () => {
      const fixedIso = "2026-11-23T15:00:00.000Z";
      const entry = formatProvenanceEntry({
        timestamp: fixedIso,
        source: "user",
        reason: "User instruction during chat",
        content: "Always format code with standard indentation",
      });

      expect(entry).toBe(
        "- [2026-11-23T15:00:00.000Z] | Source: user | Reason: User instruction during chat | Content: Always format code with standard indentation",
      );

      // Appending to disk via MemoryService maintains exact provenance line
      service.appendEntry("user", "preferences", {
        timestamp: fixedIso,
        source: "agent-atlas",
        reason: "Derived preference from conversation",
        content: "Prefer concise bullet point summaries",
      });

      const raw = service.readFile("user", "preferences");
      expect(raw).toContain(
        "- [2026-11-23T15:00:00.000Z] | Source: agent-atlas | Reason: Derived preference from conversation | Content: Prefer concise bullet point summaries",
      );
    });

    it("generates an ISO timestamp if not explicitly provided", () => {
      const line = service.appendEntry("decisions", "log", {
        content: "Chose SQLite as the primary persistence layer",
        source: "system",
        reason: "Architectural alignment",
      });

      expect(line).toMatch(/^- \[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \| Source: system \| Reason: Architectural alignment \| Content: Chose SQLite as the primary persistence layer$/);
    });
  });

  describe("b) Secret Redaction", () => {
    it("strips API keys and tokens before writing to disk", () => {
      const secretContent = "Found API key sk-proj1234567890abcdef123 and token: supersecrettoken999 in chat";
      service.appendEntry("agent", "scout", {
        content: secretContent,
        source: "scout",
        reason: "Research observation",
      });

      const fileContent = service.readFile("agent", "scout");
      expect(fileContent).not.toContain("sk-proj1234567890abcdef123");
      expect(fileContent).not.toContain("supersecrettoken999");
      expect(fileContent).toContain("«redacted");
    });

    it("redacts secrets on whole file write operations", () => {
      const input = "# Memory\n- Secret GitHub token ghp_1234567890abcdef1234567890\n- AWS AKIAIOSFODNN7EXAMPLE key";
      service.writeFile("project", "backend", input);

      const diskText = service.readFile("project", "backend");
      expect(diskText).not.toContain("ghp_1234567890abcdef1234567890");
      expect(diskText).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(diskText).toContain("«redacted");
    });
  });

  describe("c) Persistence Across Restart", () => {
    it("writes a user preference and verifies it is read back intact by a new service instance", () => {
      service.appendEntry("user", "preferences", {
        content: "Use dark theme everywhere and concise answers",
        source: "user",
        reason: "User onboarding",
      });

      // Simulate a process restart by creating a completely fresh MemoryService instance pointing to the same disk path
      const restartedService = new MemoryService(tempDir);
      const readContent = restartedService.readFile("user", "preferences");

      expect(readContent).toContain("Use dark theme everywhere and concise answers");

      // Verify listFiles includes the file
      const files = restartedService.listFiles();
      const prefFile = files.find((f) => f.scope === "user" && f.id === "preferences");
      expect(prefFile).toBeDefined();
      expect(prefFile?.size).toBeGreaterThan(0);
    });
  });

  describe("d) Live Disk Reads (Zero Stale Cache)", () => {
    it("immediately reflects external disk modifications in prompt context on the next call", () => {
      // 1. Initial agent memory written through service
      service.writeFile("agent", "quill", "# Initial Quill Memory\n- Initial fact on disk");

      const initialContext = service.getPromptContext({ agentId: "quill" });
      expect(initialContext).toContain("Initial fact on disk");

      // 2. Evaluator or user manually modifies the file directly on disk via filesystem
      const filePath = service.resolveFilePath("agent", "quill");
      writeFileSync(filePath, "# Manually Modified Memory\n- Direct edit made by evaluator on disk", "utf8");

      // 3. Next getPromptContext call MUST read directly from disk with zero delay / no stale RAM cache
      const updatedContext = service.getPromptContext({ agentId: "quill" });
      expect(updatedContext).not.toContain("Initial fact on disk");
      expect(updatedContext).toContain("Direct edit made by evaluator on disk");
    });

    it("injects user preferences in full without truncation into prompt context", () => {
      service.appendEntry("user", "preferences", {
        content: "Crucial preference that must never be truncated or omitted",
        source: "user",
        reason: "Core guideline",
      });

      const promptContext = service.getPromptContext({ agentId: "atlas" });
      expect(promptContext).toContain("## User Preferences (Global)");
      expect(promptContext).toContain("Crucial preference that must never be truncated or omitted");
    });

    it("includes shared room and decision log in prompt context when present", () => {
      service.appendEntry("room", "studio-1", {
        content: "Studio room focus: Q4 product launch",
        source: "atlas",
        reason: "Room alignment",
      });

      service.appendEntry("decisions", "log", {
        content: "Decided to adopt TypeScript throughout",
        source: "lead",
        reason: "Stack decision",
      });

      const context = service.getPromptContext({ agentId: "atlas", roomId: "studio-1" });
      expect(context).toContain("## Shared Room Memory");
      expect(context).toContain("Studio room focus: Q4 product launch");
      expect(context).toContain("## Important Decisions Log");
      expect(context).toContain("Decided to adopt TypeScript throughout");
    });
  });
});
