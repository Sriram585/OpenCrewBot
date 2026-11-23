// Tests for Module F (Skills & Tools), Module H (Integrations), and Module I (Scheduled AI Workflows)
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Client } from "@libsql/client";
import { openClient } from "@/db/client";
import { skillLoader } from "./skills";
import { analyzeCsv, webFetchResearch } from "./tools-business";
import { createIssue, getIntegrationsStatus } from "./integrations";
import { permissionGuard } from "./permissions";
import { workflowScheduler } from "./scheduler";
import { getApprovalRequest, listAuditLogs, getScheduledWorkflow } from "@/db";

describe("Module F, H, I: Capabilities, Integrations, and Scheduler (capabilities.test.ts)", () => {
  let client: Client;

  beforeEach(async () => {
    client = await openClient(":memory:");
  });

  afterEach(() => {
    workflowScheduler.stopAll();
    workflowScheduler.setCustomExecutor(undefined);
    permissionGuard.clearPendingCallbacks();
    try {
      client.close();
    } catch {
      // ignore
    }
  });

  describe("Module F: Skills Ecosystem (Requirement a)", () => {
    it("(a) loads all 8 markdown skills and dynamically selects matching skills for a given task prompt", () => {
      const skills = skillLoader.listSkills();
      expect(skills.length).toBeGreaterThanOrEqual(8);

      const skillIds = skills.map((s) => s.id);
      expect(skillIds).toContain("market-research");
      expect(skillIds).toContain("competitor-analysis");
      expect(skillIds).toContain("financial-modelling");
      expect(skillIds).toContain("presentation-creation");
      expect(skillIds).toContain("email-drafting");
      expect(skillIds).toContain("code-review");
      expect(skillIds).toContain("data-analysis");
      expect(skillIds).toContain("lead-generation");

      // Verify dynamic matching based on prompt triggers
      const marketMatch = skillLoader.matchSkills("We need comprehensive market research and industry sizing");
      expect(marketMatch.map((s) => s.id)).toContain("market-research");

      const codeMatch = skillLoader.matchSkills("Perform a code review and security audit on this TypeScript pull request");
      expect(codeMatch.map((s) => s.id)).toContain("code-review");

      const dataMatch = skillLoader.matchSkills("Analyze CSV data and pinpoint funnel conversion bottleneck dropoffs");
      expect(dataMatch.map((s) => s.id)).toContain("data-analysis");

      // Verify prompt injection
      const injected = skillLoader.injectSkillPrompt("Draft an outreach email sequence", "Base instructions.");
      expect(injected).toContain("Base instructions.");
      expect(injected).toContain("Email Drafting");
      expect(injected).toContain("Methodology");
    });
  });

  describe("Module F & H: Deterministic Business Tools (Requirement b)", () => {
    it("(b) analyze_csv computes exact totals, conversion percentages, and segment metrics without LLM guessing", () => {
      const sampleCsv = `
lead_id,segment,stage,revenue
101,Enterprise,Visited,1000
102,Enterprise,SignedUp,2000
103,Enterprise,Converted,3000
104,SMB,Visited,400
105,SMB,SignedUp,600
106,SMB,Visited,200
      `.trim();

      const result = analyzeCsv(sampleCsv);

      // Exact row count
      expect(result.rowCount).toBe(6);

      // Exact numerical arithmetic
      expect(result.numericalSummaries.revenue).toBeDefined();
      expect(result.numericalSummaries.revenue.sum).toBe(7200);
      expect(result.numericalSummaries.revenue.min).toBe(200);
      expect(result.numericalSummaries.revenue.max).toBe(3000);
      expect(result.numericalSummaries.revenue.average).toBe(1200);

      // Exact group-by segment revenue
      expect(result.segmentRevenue).toBeDefined();
      const enterpriseSeg = result.segmentRevenue?.find((s) => s.segment === "Enterprise");
      const smbSeg = result.segmentRevenue?.find((s) => s.segment === "SMB");

      expect(enterpriseSeg?.revenue).toBe(6000);
      expect(enterpriseSeg?.percentageOfTotal).toBe(83.3);
      expect(smbSeg?.revenue).toBe(1200);
      expect(smbSeg?.percentageOfTotal).toBe(16.7);

      // Funnel analysis
      expect(result.funnelConversion).toBeDefined();
      expect(result.funnelConversion?.stages).toHaveLength(3);
      expect(result.funnelConversion?.stages[0].stage).toBe("Visited");
      expect(result.funnelConversion?.stages[0].count).toBe(3);
      expect(result.chartData.barChart).toBeDefined();
      expect(result.chartData.funnelChart).toBeDefined();
    });
  });

  describe("Module H: Live Integrations & Gated Writes (Requirement c)", () => {
    it("(c) blocks GitHub issue creation under ASK_FIRST via PermissionGuard and accurately reports LIVE vs MOCKED status", async () => {
      // 1. Gated write test
      const createRes = await createIssue(
        "octocat",
        "Hello-World",
        "Bug: Memory leak in worker",
        "Detailed bug report",
        {
          agentId: "agent-chief-of-staff",
          taskId: "task-gh-1",
          permissionLevel: "ASK_FIRST",
          client,
        },
      );

      // Must be blocked by PermissionGuard returning approvalId WITHOUT calling GitHub API
      expect(createRes.success).toBe(false);
      expect(createRes.approvalId).toMatch(/^appr-/);

      // Verify pending record in SQLite
      const approval = await getApprovalRequest(createRes.approvalId!, client);
      expect(approval?.status).toBe("PENDING");
      expect(approval?.toolName).toBe("github_create_issue");
      expect(approval?.actionPreviewJson).toContain("Hello-World");

      // Rejecting the request ensures it never fires
      await permissionGuard.reject(createRes.approvalId!, "security-admin", "Do not post to public repo", client);
      const afterReject = await getApprovalRequest(createRes.approvalId!, client);
      expect(afterReject?.status).toBe("REJECTED");

      const audits = await listAuditLogs({ decision: "REJECTED" }, client);
      expect(audits).toHaveLength(1);
      expect(audits[0].toolName).toBe("github_create_issue");

      // 2. Integration status verification
      const statuses = await getIntegrationsStatus();
      expect(statuses.length).toBeGreaterThanOrEqual(4);

      const github = statuses.find((s) => s.id === "github");
      const slack = statuses.find((s) => s.id === "slack");
      const mcp = statuses.find((s) => s.id === "mcp");
      const gmail = statuses.find((s) => s.id === "gmail");

      expect(github?.mode).toBe("LIVE");
      expect(mcp?.mode).toBe("LIVE");
      expect(slack?.mode).toMatch(/^(LIVE|UNCONFIGURED)$/);
      expect(gmail?.mode).toBe("MOCKED"); // Explicitly marked MOCKED
      expect(gmail?.disclaimer).toContain("[MOCKED]");
    });
  });

  describe("Module I: Scheduled AI Workflows (Requirement d)", () => {
    it("(d) creates a scheduled workflow, executes manually, logs execution history, toggles status, and records failures", async () => {
      // 1. Create scheduled workflow
      const wf = await workflowScheduler.createWorkflow(
        {
          name: "Weekly Competitor Brief",
          description: "Scans competitors every Monday at 9 AM",
          goalPrompt: "Compare competitor product updates and new pricing tiers",
          cronExpression: "0 9 * * 1",
          status: "ACTIVE",
        },
        client,
      );

      expect(wf.id).toMatch(/^wf-/);
      expect(wf.status).toBe("ACTIVE");

      // 2. Manual execution
      workflowScheduler.setCustomExecutor(async () => "Weekly competitor report compiled successfully.");
      const runRes = await workflowScheduler.runWorkflow(wf.id, "MANUAL", client);

      expect(runRes.status).toBe("COMPLETED");
      expect(runRes.output).toContain("Weekly competitor report compiled successfully.");

      // Check run history
      const history = await workflowScheduler.listHistory(wf.id, 10, client);
      expect(history).toHaveLength(1);
      expect(history[0].triggerType).toBe("MANUAL");
      expect(history[0].status).toBe("COMPLETED");

      // 3. Toggle Pause / Resume
      const paused = await workflowScheduler.toggleWorkflow(wf.id, client);
      expect(paused.status).toBe("PAUSED");

      const resumed = await workflowScheduler.toggleWorkflow(wf.id, client);
      expect(resumed.status).toBe("ACTIVE");

      // 4. Failure recording
      workflowScheduler.setCustomExecutor(async () => {
        throw new Error("External data source unreachable");
      });

      const failedRun = await workflowScheduler.runWorkflow(wf.id, "SCHEDULED", client);
      expect(failedRun.status).toBe("FAILED");
      expect(failedRun.error).toContain("External data source unreachable");

      const updatedWf = await getScheduledWorkflow(wf.id, client);
      expect(updatedWf?.lastStatus).toBe("FAILED");
      expect(updatedWf?.lastError).toContain("External data source unreachable");

      const fullHistory = await workflowScheduler.listHistory(wf.id, 10, client);
      expect(fullHistory).toHaveLength(2);
      expect(fullHistory[0].status).toBe("FAILED");
    });
  });
});
