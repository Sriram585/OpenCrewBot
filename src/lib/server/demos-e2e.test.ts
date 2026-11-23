// E2E Verification Test Suite for MeetUniversity Business Demonstrations (Phase 8)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openClient } from "@/db/client";
import type { Client } from "@libsql/client";
import { seedSpecializedAgents } from "./agent-factory";
import { seedCollaborationRooms } from "./collaboration";
import {
  runDemo1MarketIntelligence,
  runDemo2MarketingCampaign,
  runDemo3BusinessAnalysis,
  runDemo4DevelopmentTeam,
  runDemo5AutonomousRoutine,
  runDemo6MemoryPersistence,
  runDemo7HumanIntervention,
  runFinalEvalReadiness,
} from "./evidence-generator";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("Phase 8: MeetUniversity Business Demonstrations E2E Verification Suite", () => {
  let client: Client;

  beforeAll(async () => {
    // Seed SQLite database for test execution
    client = await openClient(":memory:");
    await seedSpecializedAgents(client);
    await seedCollaborationRooms(client);
  });

  afterAll(() => {
    try {
      client.close();
    } catch {
      // ignore
    }
  });

  it("Demo 1: Market Intelligence across MeetUniversity 3 product lines", async () => {
    const res = await runDemo1MarketIntelligence(client);
    expect(res.passed).toBe(true);
    expect(res.demoId).toBe("demo-1");
    expect(existsSync(join(process.cwd(), res.files.markdown))).toBe(true);
    expect(existsSync(join(process.cwd(), res.files.json))).toBe(true);
  }, 30000);

  it("Demo 2: Marketing Campaign targeting Class 11 students for Aspirations", async () => {
    const res = await runDemo2MarketingCampaign(client);
    expect(res.passed).toBe(true);
    expect(res.demoId).toBe("demo-2");
    expect(existsSync(join(process.cwd(), res.files.markdown))).toBe(true);
    expect(existsSync(join(process.cwd(), res.files.json))).toBe(true);
  }, 30000);

  it("Demo 3: Business Analysis & Funnel Bottlenecks on meetuniversity_sales.csv", async () => {
    const res = await runDemo3BusinessAnalysis();
    expect(res.passed).toBe(true);
    expect(res.demoId).toBe("demo-3");
    const count = (res.details.rowCount as number) || (res.details.totalRows as number) || 0;
    expect(count).toBeGreaterThanOrEqual(200);
    expect(res.details.bottleneck).toBeDefined();
    expect(existsSync(join(process.cwd(), res.files.markdown))).toBe(true);
    expect(existsSync(join(process.cwd(), res.files.json))).toBe(true);
  });

  it("Demo 4: Development Team GitHub repo inspection & PENDING approval guard", async () => {
    const res = await runDemo4DevelopmentTeam(client);
    expect(res.passed).toBe(true);
    expect(res.demoId).toBe("demo-4");
    expect(res.details.secretsRedacted).toBe(true);
    expect(existsSync(join(process.cwd(), res.files.markdown))).toBe(true);
    expect(existsSync(join(process.cwd(), res.files.json))).toBe(true);
  });

  it("Demo 5: Autonomous Routine Competitor Scanner in WorkflowScheduler", async () => {
    const res = await runDemo5AutonomousRoutine(client);
    expect(res.passed).toBe(true);
    expect(res.demoId).toBe("demo-5");
    expect(res.details.historyCount).toBeGreaterThanOrEqual(1);
    expect(existsSync(join(process.cwd(), res.files.markdown))).toBe(true);
    expect(existsSync(join(process.cwd(), res.files.json))).toBe(true);
  }, 30000);

  it("Demo 6: Scoped Memory live disk reads & simulated restart verification", async () => {
    const res = await runDemo6MemoryPersistence();
    expect(res.passed).toBe(true);
    expect(res.demoId).toBe("demo-6");
    expect(res.details.liveEditDetected).toBe(true);
    expect(existsSync(join(process.cwd(), res.files.markdown))).toBe(true);
    expect(existsSync(join(process.cwd(), res.files.json))).toBe(true);
  });

  it("Demo 7: Human Intervention & tool rejection via PermissionGuard", async () => {
    const res = await runDemo7HumanIntervention(client);
    expect(res.passed).toBe(true);
    expect(res.demoId).toBe("demo-7");
    expect(res.details.rejectionStatus).toBe("REJECTED");
    expect(existsSync(join(process.cwd(), res.files.markdown))).toBe(true);
    expect(existsSync(join(process.cwd(), res.files.json))).toBe(true);
  });

  it("Final Evaluation Readiness: Unrelated domain goal with mid-run adaptive re-plan", async () => {
    const res = await runFinalEvalReadiness(client);
    expect(res.passed).toBe(true);
    expect(res.demoId).toBe("demo-eval-readiness");
    expect(res.details.hasMeetUniversityLeak).toBe(false);
    expect(existsSync(join(process.cwd(), res.files.markdown))).toBe(true);
    expect(existsSync(join(process.cwd(), res.files.json))).toBe(true);
  }, 30000);
});
