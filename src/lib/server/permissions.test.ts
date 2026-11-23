// Tests for Module G: Human Approval and Autonomy
// Verifies PermissionGuard, approval workflows, risk classification, secret redaction,
// and audit logging using isolated in-memory SQLite instances.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Client } from "@libsql/client";
import { openClient } from "@/db/client";
import {
  PermissionGuard,
  classifyToolRisk,
  normalizePermissionLevel,
  sanitizeActionPreview,
} from "./permissions";
import {
  getApprovalRequest,
  listApprovalRequests,
  listAuditLogs,
} from "@/db";

describe("Module G: Human Approval and Autonomy (permissions.ts)", () => {
  let client: Client;
  let guard: PermissionGuard;

  beforeEach(async () => {
    client = await openClient(":memory:");
    guard = new PermissionGuard();
  });

  afterEach(() => {
    guard.clearPendingCallbacks();
    guard.resetRunCounts();
    try {
      client.close();
    } catch {
      // ignore
    }
  });

  describe("Permission Level Normalization & Risk Classification", () => {
    it("normalizes legacy and explicit permission levels", () => {
      expect(normalizePermissionLevel(undefined)).toBe("ASK_FIRST");
      expect(normalizePermissionLevel(null)).toBe("ASK_FIRST");
      expect(normalizePermissionLevel("ask")).toBe("ASK_FIRST");
      expect(normalizePermissionLevel("ASK_FIRST")).toBe("ASK_FIRST");
      expect(normalizePermissionLevel("controlled")).toBe("CONTROLLED_ACCESS");
      expect(normalizePermissionLevel("CONTROLLED_ACCESS")).toBe("CONTROLLED_ACCESS");
      expect(normalizePermissionLevel("full")).toBe("FULL_ACCESS");
      expect(normalizePermissionLevel("FULL_ACCESS")).toBe("FULL_ACCESS");
    });

    it("classifies tool risk accurately", () => {
      // Sensitive operations
      expect(classifyToolRisk("execute_typescript")).toBe("sensitive");
      expect(classifyToolRisk("delete_user_data")).toBe("sensitive");
      expect(classifyToolRisk("drop_database_table")).toBe("sensitive");
      expect(classifyToolRisk("update_admin_auth_token")).toBe("sensitive");
      expect(classifyToolRisk("transfer_funds")).toBe("sensitive");

      // Safe read operations
      expect(classifyToolRisk("web_search")).toBe("read_safe");
      expect(classifyToolRisk("read_page")).toBe("read_safe");
      expect(classifyToolRisk("crawl_site")).toBe("read_safe");
      expect(classifyToolRisk("ask_user")).toBe("read_safe");
      expect(classifyToolRisk("memory_add")).toBe("read_safe");
      expect(classifyToolRisk("browser_snapshot")).toBe("read_safe");
      expect(classifyToolRisk("browser_screenshot")).toBe("read_safe");
      expect(classifyToolRisk("COMPOSIO_SEARCH_TOOLS")).toBe("read_safe");
      expect(classifyToolRisk("mcp_github_get_file")).toBe("read_safe");
      expect(classifyToolRisk("list_repositories")).toBe("read_safe");

      // External write operations
      expect(classifyToolRisk("browser_goto")).toBe("external_write");
      expect(classifyToolRisk("browser_click")).toBe("external_write");
      expect(classifyToolRisk("COMPOSIO_MULTI_EXECUTE")).toBe("external_write");
      expect(classifyToolRisk("COMPOSIO_SLACK_SEND_MESSAGE")).toBe("external_write");
      expect(classifyToolRisk("send_email")).toBe("external_write");
    });
  });

  describe("PermissionGuard Security Tests (Requirements a-f)", () => {
    // a) ASK_FIRST blocks an external write tool, creates a PENDING approval request, and spyTool is called 0 times.
    it("(a) ASK_FIRST blocks an external write tool, creates a PENDING approval request, and does not execute the tool", async () => {
      const spyTool = vi.fn().mockResolvedValue({ success: true, clicked: true });

      const result = await guard.executeTool({
        toolName: "browser_click",
        args: { selector: "#deploy-btn", target: "production" },
        executor: spyTool,
        agentId: "agent-alice",
        taskId: "task-101",
        runId: "run-201",
        permissionLevel: "ASK_FIRST",
        client,
      });

      expect(spyTool).toHaveBeenCalledTimes(0);
      expect(result.status).toBe("WAITING_APPROVAL");
      if (result.status === "WAITING_APPROVAL") {
        expect(result.riskLevel).toBe("external_write");
        expect(result.approvalId).toMatch(/^appr-/);

        // Verify PENDING record exists in SQLite
        const req = await getApprovalRequest(result.approvalId, client);
        expect(req).not.toBeNull();
        expect(req?.status).toBe("PENDING");
        expect(req?.toolName).toBe("browser_click");
        expect(req?.agentId).toBe("agent-alice");
        expect(req?.riskLevel).toBe("external_write");
        expect(req?.actionPreviewJson).toContain("#deploy-btn");
      }
    });

    // b) Calling reject marks the request REJECTED, writes an audit_logs entry, and spyTool remains at 0 calls.
    it("(b) Calling reject marks the request REJECTED, logs to audit_logs, and spyTool remains unexecuted", async () => {
      const spyTool = vi.fn().mockResolvedValue({ deleted: true });

      const execution = await guard.executeTool({
        toolName: "browser_goto",
        args: { url: "https://admin.example.com/delete-all" },
        executor: spyTool,
        agentId: "agent-bob",
        taskId: "task-102",
        permissionLevel: "ASK_FIRST",
        client,
      });

      expect(execution.status).toBe("WAITING_APPROVAL");
      if (execution.status !== "WAITING_APPROVAL") return;

      const rejectResult = await guard.reject(
        execution.approvalId,
        "security-officer",
        "Action is too dangerous",
        client,
      );
      expect(rejectResult.success).toBe(true);

      // Verify tool was never executed
      expect(spyTool).toHaveBeenCalledTimes(0);

      // Verify DB approval request is REJECTED
      const req = await getApprovalRequest(execution.approvalId, client);
      expect(req?.status).toBe("REJECTED");
      expect(req?.resolvedBy).toBe("security-officer");
      expect(req?.decisionNote).toBe("Action is too dangerous");
      expect(req?.resolvedAt).toBeTruthy();

      // Verify audit log has REJECTED record
      const logs = await listAuditLogs({ decision: "REJECTED" }, client);
      expect(logs).toHaveLength(1);
      expect(logs[0].toolName).toBe("browser_goto");
      expect(logs[0].decision).toBe("REJECTED");
      expect(logs[0].resultSummary).toContain("security-officer");
    });

    // c) Calling approve marks the request APPROVED, invokes spyTool exactly 1 time, logs to audit_logs, and prevents double-execution.
    it("(c) Calling approve marks request APPROVED, invokes spyTool exactly once, logs audit, and blocks double approval", async () => {
      const spyTool = vi.fn().mockResolvedValue({ status: "deployed", version: "v2.0" });

      const execution = await guard.executeTool({
        toolName: "COMPOSIO_SLACK_SEND_MESSAGE",
        args: { channel: "#general", text: "Release v2.0 deployed" },
        executor: spyTool,
        agentId: "agent-charlie",
        taskId: "task-103",
        permissionLevel: "ASK_FIRST",
        client,
      });

      expect(spyTool).toHaveBeenCalledTimes(0);
      if (execution.status !== "WAITING_APPROVAL") return;

      const approveResult = await guard.approve<{ status: string; version: string }>(
        execution.approvalId,
        "lead-reviewer",
        "Looks good to deploy",
        client,
      );

      expect(approveResult.success).toBe(true);
      expect(approveResult.result).toEqual({ status: "deployed", version: "v2.0" });
      expect(spyTool).toHaveBeenCalledTimes(1);

      // Verify DB record is APPROVED
      const req = await getApprovalRequest(execution.approvalId, client);
      expect(req?.status).toBe("APPROVED");
      expect(req?.resolvedBy).toBe("lead-reviewer");
      expect(req?.decisionNote).toBe("Looks good to deploy");

      // Verify audit log
      const logs = await listAuditLogs({ decision: "APPROVED" }, client);
      expect(logs).toHaveLength(1);
      expect(logs[0].toolName).toBe("COMPOSIO_SLACK_SEND_MESSAGE");
      expect(logs[0].decision).toBe("APPROVED");
      expect(logs[0].resultSummary).toContain("deployed");

      // Attempting to approve a second time must throw and NOT call spyTool again
      await expect(
        guard.approve(execution.approvalId, "lead-reviewer", "duplicate approval", client),
      ).rejects.toThrow(/already APPROVED/);

      expect(spyTool).toHaveBeenCalledTimes(1);
    });

    // d) CONTROLLED_ACCESS allows safe read within limits, blocks once limit exceeded, and blocks external write.
    it("(d) CONTROLLED_ACCESS allows safe read tools within limits, blocks limit breaches, and blocks external writes", async () => {
      const readSpy = vi.fn().mockImplementation((idx: number) => Promise.resolve({ data: `item-${idx}` }));
      const writeSpy = vi.fn().mockResolvedValue({ written: true });

      const runId = "controlled-run-1";
      const maxCalls = 2;

      // 1. First safe read call (under limit)
      const res1 = await guard.executeTool({
        toolName: "web_search",
        args: { query: "search 1" },
        executor: () => readSpy(1),
        runId,
        permissionLevel: "CONTROLLED_ACCESS",
        maxCallsPerRun: maxCalls,
        client,
      });
      expect(res1.status).toBe("EXECUTED");
      expect(readSpy).toHaveBeenCalledTimes(1);

      // 2. Second safe read call (reaches limit)
      const res2 = await guard.executeTool({
        toolName: "read_page",
        args: { url: "https://example.com/page1" },
        executor: () => readSpy(2),
        runId,
        permissionLevel: "CONTROLLED_ACCESS",
        maxCallsPerRun: maxCalls,
        client,
      });
      expect(res2.status).toBe("EXECUTED");
      expect(readSpy).toHaveBeenCalledTimes(2);

      // 3. Third safe read call (exceeds limit -> BLOCKED)
      const res3 = await guard.executeTool({
        toolName: "web_search",
        args: { query: "search 3" },
        executor: () => readSpy(3),
        runId,
        permissionLevel: "CONTROLLED_ACCESS",
        maxCallsPerRun: maxCalls,
        client,
      });
      expect(res3.status).toBe("BLOCKED");
      expect(readSpy).toHaveBeenCalledTimes(2); // still 2, not called!

      // Check BLOCKED audit log
      const blockedLogs = await listAuditLogs({ decision: "BLOCKED" }, client);
      expect(blockedLogs.length).toBeGreaterThanOrEqual(1);
      expect(blockedLogs[0].error).toContain("limit of 2 exceeded");

      // 4. External write in CONTROLLED_ACCESS requires approval
      const writeRes = await guard.executeTool({
        toolName: "browser_click",
        args: { selector: "#confirm" },
        executor: writeSpy,
        runId,
        permissionLevel: "CONTROLLED_ACCESS",
        maxCallsPerRun: maxCalls,
        client,
      });
      expect(writeRes.status).toBe("WAITING_APPROVAL");
      expect(writeSpy).toHaveBeenCalledTimes(0);
    });

    // e) FULL_ACCESS executes permitted tools autonomously and writes an AUTO_ALLOWED audit log.
    it("(e) FULL_ACCESS executes tools autonomously and records AUTO_ALLOWED in audit_logs", async () => {
      const toolSpy = vi.fn().mockResolvedValue({ performed: true, action: "autonomous-write" });

      const result = await guard.executeTool({
        toolName: "browser_type",
        args: { selector: "input.search", text: "automated query" },
        executor: toolSpy,
        agentId: "agent-full",
        taskId: "task-full-1",
        permissionLevel: "FULL_ACCESS",
        client,
      });

      expect(result.status).toBe("EXECUTED");
      expect(toolSpy).toHaveBeenCalledTimes(1);
      if (result.status === "EXECUTED") {
        expect(result.auditDecision).toBe("AUTO_ALLOWED");
        expect(result.result).toEqual({ performed: true, action: "autonomous-write" });
      }

      // Check audit log
      const logs = await listAuditLogs({ agentId: "agent-full" }, client);
      expect(logs).toHaveLength(1);
      expect(logs[0].decision).toBe("AUTO_ALLOWED");
      expect(logs[0].permissionLevel).toBe("FULL_ACCESS");
      expect(logs[0].toolName).toBe("browser_type");
      expect(logs[0].resultSummary).toContain("autonomous-write");
    });

    // f) Secrets passed inside tool arguments are redacted in both approval_requests and audit_logs.
    it("(f) Secrets passed inside tool arguments are redacted in action_preview_json in approval_requests and audit_logs", async () => {
      const secretApiKey = "sk-live-secret-token-1234567890abcdef";
      const sensitivePassword = "password: super-secret-password-123";
      const githubToken = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";

      const toolSpy = vi.fn().mockResolvedValue({ status: "success" });

      // Trigger approval request with secret args
      const execResult = await guard.executeTool({
        toolName: "browser_fill",
        args: {
          key: secretApiKey,
          auth: sensitivePassword,
          gh: githubToken,
          publicField: "visible-username",
        },
        executor: toolSpy,
        agentId: "agent-secure",
        taskId: "task-secrets-1",
        permissionLevel: "ASK_FIRST",
        client,
      });

      expect(execResult.status).toBe("WAITING_APPROVAL");
      if (execResult.status !== "WAITING_APPROVAL") return;

      // Check preview from execution result
      expect(execResult.preview).not.toContain(secretApiKey);
      expect(execResult.preview).not.toContain(sensitivePassword);
      expect(execResult.preview).not.toContain(githubToken);
      expect(execResult.preview).toContain("«redacted");
      expect(execResult.preview).toContain("visible-username");

      // Check preview in SQLite approval_requests table
      const req = await getApprovalRequest(execResult.approvalId, client);
      expect(req?.actionPreviewJson).not.toContain(secretApiKey);
      expect(req?.actionPreviewJson).not.toContain(sensitivePassword);
      expect(req?.actionPreviewJson).not.toContain(githubToken);
      expect(req?.actionPreviewJson).toContain("«redacted");

      // Now approve the action and check audit_logs table
      await guard.approve(execResult.approvalId, "admin", "Approved with redaction check", client);

      const logs = await listAuditLogs({ agentId: "agent-secure" }, client);
      expect(logs).toHaveLength(1);
      expect(logs[0].actionPreviewJson).not.toContain(secretApiKey);
      expect(logs[0].actionPreviewJson).not.toContain(sensitivePassword);
      expect(logs[0].actionPreviewJson).not.toContain(githubToken);
      expect(logs[0].actionPreviewJson).toContain("«redacted");
    });

    // Cancel workflow
    it("handles cancel cleanly, updating status and logging to audit_logs", async () => {
      const toolSpy = vi.fn().mockResolvedValue({ cancelled: false });

      const execResult = await guard.executeTool({
        toolName: "browser_goto",
        args: { url: "https://example.com/pending" },
        executor: toolSpy,
        agentId: "agent-cancel",
        permissionLevel: "ASK_FIRST",
        client,
      });

      expect(execResult.status).toBe("WAITING_APPROVAL");
      if (execResult.status !== "WAITING_APPROVAL") return;

      const cancelRes = await guard.cancel(execResult.approvalId, "operator", "Task was aborted by user", client);
      expect(cancelRes.success).toBe(true);

      const req = await getApprovalRequest(execResult.approvalId, client);
      expect(req?.status).toBe("CANCELLED");
      expect(req?.decisionNote).toBe("Task was aborted by user");

      expect(toolSpy).toHaveBeenCalledTimes(0);

      const logs = await listAuditLogs({ decision: "CANCELLED" }, client);
      expect(logs).toHaveLength(1);
      expect(logs[0].decision).toBe("CANCELLED");
    });
  });
});
