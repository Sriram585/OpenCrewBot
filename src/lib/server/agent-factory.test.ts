// Tests for Module B: Dynamic Agent Creation & Specialized Pre-Seeded Agent Factory
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "@libsql/client";
import { openClient } from "@/db/client";
import {
  PRE_SEEDED_AGENTS,
  seedSpecializedAgents,
  createAgentFromNaturalLanguage,
  parseAgentPrompt,
} from "./agent-factory";
import { getBot, listBots, getAgentModelConfig } from "@/db";
import { memoryService } from "./memory";

describe("Module B: Dynamic Agent Creation (agent-factory.ts)", () => {
  let client: Client;

  beforeEach(async () => {
    client = await openClient(":memory:");
  });

  afterEach(() => {
    try {
      client.close();
    } catch {
      // ignore
    }
  });

  describe("Pre-Seeded Specialized Agents", () => {
    it("has 8 complete, specialized agents defined", () => {
      expect(PRE_SEEDED_AGENTS).toHaveLength(8);

      const expectedNames = [
        "Chief of Staff",
        "Market Researcher",
        "Competitor Analyst",
        "Marketing Strategist",
        "Content Creator",
        "Data Analyst",
        "Senior Code Reviewer",
        "Automation Ops",
      ];

      for (const name of expectedNames) {
        const found = PRE_SEEDED_AGENTS.find((a) => a.name === name);
        expect(found).toBeDefined();
        expect(found?.role).toBeTruthy();
        expect(found?.instructions).toBeTruthy();
        expect(found?.modelProvider).toBe("nebius");
        expect(found?.primaryModel).toBeTruthy();
        expect(found?.tools).toBeDefined();
        expect(found?.skills).toBeInstanceOf(Array);
        expect(found?.skills!.length).toBeGreaterThan(0);
        expect(found?.permissionLevel).toMatch(/^(ASK_FIRST|CONTROLLED_ACCESS|FULL_ACCESS)$/);
      }
    });

    it("seeds 8 specialized agents into SQLite without duplicates", async () => {
      const seeded = await seedSpecializedAgents(client);
      expect(seeded).toHaveLength(8);

      const allBots = await listBots(client);
      expect(allBots).toHaveLength(8);

      // Verify model config is saved for seeded agents
      const config = await getAgentModelConfig("agent-chief-of-staff", client);
      expect(config).not.toBeNull();
      expect(config?.provider).toBe("nebius");

      // Verify agent memory file was created with provenance
      const memoryContent = memoryService.readFile("agent", "agent-chief-of-staff");
      expect(memoryContent).toContain("Executive Orchestrator");
      expect(memoryContent).toContain("Reason: Pre-seeded specialized agent initialization");

      // Running seed again must be idempotent and add 0 duplicate agents
      const secondRun = await seedSpecializedAgents(client);
      expect(secondRun).toHaveLength(0);
      const afterSecond = await listBots(client);
      expect(afterSecond).toHaveLength(8);
    });
  });

  describe("Natural Language Agent Parsing", () => {
    it("parses prompt into validated agent specifications", () => {
      const spec = parseAgentPrompt(
        "Create an autonomous SEO Specialist agent to audit web pages and analyze organic search rankings",
      );

      expect(spec.name).toBe("SEO Specialist");
      expect(spec.role).toBe("SEO Specialist");
      expect(spec.tools.webSearch).toBe(true);
      expect(spec.skills).toContain("web_search");
      expect(spec.permissionLevel).toBe("CONTROLLED_ACCESS");
      expect(spec.outputFormat).toBe("markdown");
    });

    it("detects critical/danger instructions and assigns ASK_FIRST permission level", () => {
      const spec = parseAgentPrompt(
        "Create a Production Deployer agent that writes and executes critical deployment scripts on production servers",
      );

      expect(spec.permissionLevel).toBe("ASK_FIRST");
      expect(spec.tools.codeMode).toBe(true);
    });
  });

  describe("Dynamic Agent Creation & Persistence (Requirement e)", () => {
    it("(e) creates a 9th dynamic agent from prompt, persists to SQLite, creates .md memory, and makes immediately queryable", async () => {
      // First seed the 8 base agents
      await seedSpecializedAgents(client);
      const initialBots = await listBots(client);
      expect(initialBots).toHaveLength(8);

      // Create a 9th dynamic agent
      const dynamicAgent = await createAgentFromNaturalLanguage(
        "Create an autonomous SEO Specialist agent to crawl competitor sites and extract organic keywords",
        client,
      );

      expect(dynamicAgent).toBeDefined();
      expect(dynamicAgent.id).toMatch(/^agent-dyn-/);
      expect(dynamicAgent.name).toBe("SEO Specialist");
      expect(dynamicAgent.isDynamic).toBe(true);
      expect(dynamicAgent.tools.webSearch).toBe(true);

      // Verify queryable in SQLite
      const fetched = await getBot(dynamicAgent.id, client);
      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe("SEO Specialist");
      expect(fetched?.isDynamic).toBe(true);

      // Verify total bots is now 9
      const allBots = await listBots(client);
      expect(allBots).toHaveLength(9);

      // Verify model config is saved in agent_model_configs table
      const modelCfg = await getAgentModelConfig(dynamicAgent.id, client);
      expect(modelCfg).not.toBeNull();
      expect(modelCfg?.agentId).toBe(dynamicAgent.id);

      // Verify .md memory file exists on disk with mandatory provenance format
      const memoryContent = memoryService.readFile("agent", dynamicAgent.id);
      expect(memoryContent).toBeTruthy();
      expect(memoryContent).toContain("SEO Specialist");
      expect(memoryContent).toContain("Source: user");
      expect(memoryContent).toContain("Reason: Dynamic natural language agent creation");
    });
  });
});
