// Module G: Human Approval and Autonomy
// Central PermissionGuard middleware managing ASK_FIRST, CONTROLLED_ACCESS, and FULL_ACCESS policies,
// tool risk classification, secret redaction, SQLite approval queues, and immutable audit logs.
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { redactSecrets } from "./memory";
import {
  createApprovalRequest,
  getApprovalRequest,
  updateApprovalRequestStatus,
  logAudit,
  listApprovalRequests,
  listAuditLogs,
  type ApprovalRequest,
  type ApprovalStatus,
  type AuditDecision,
  type AuditLog,
  type ToolRiskLevel,
} from "./db";

export type PermissionLevel = "ASK_FIRST" | "CONTROLLED_ACCESS" | "FULL_ACCESS";

export function normalizePermissionLevel(level?: string | null): PermissionLevel {
  if (!level) return "ASK_FIRST";
  const upper = level.toUpperCase().trim();
  if (upper === "FULL" || upper === "FULL_ACCESS") return "FULL_ACCESS";
  if (upper === "CONTROLLED" || upper === "CONTROLLED_ACCESS") return "CONTROLLED_ACCESS";
  return "ASK_FIRST";
}

const READ_ONLY_VERBS = /^(get|list|search|read|fetch|find|view|show|describe|lookup|query)(_|$)/i;
const SENSITIVE_KEYWORDS = /(execute_typescript|delete|drop|admin|auth|token|credential|transfer|pay|wipe|destroy|format|shutdown)/i;
const BROWSER_READ_ACTIONS = /^(browser_)?(snapshot|screenshot|scroll|wait|tabs|close|get_|read|extract|console)/i;
const COMPOSIO_READ_ACTIONS = /SEARCH_TOOLS|GET_TOOL_SCHEMAS|MANAGE_CONNECTIONS/i;

export function classifyToolRisk(toolName: string): ToolRiskLevel {
  const name = toolName.trim();

  // Sensitive actions: code execution, destructive operations, auth/credential changes
  if (SENSITIVE_KEYWORDS.test(name)) {
    return "sensitive";
  }

  // Safe read tools
  if (["web_search", "read_page", "crawl_site", "ask_user", "memory_add", "memory_edit"].includes(name)) {
    return "read_safe";
  }

  if (name.startsWith("COMPOSIO_")) {
    return COMPOSIO_READ_ACTIONS.test(name) ? "read_safe" : "external_write";
  }

  if (name.startsWith("mcp_")) {
    const action = name.split("_").slice(2).join("_") || name;
    return READ_ONLY_VERBS.test(action) ? "read_safe" : "external_write";
  }

  if (name.startsWith("browser_")) {
    return BROWSER_READ_ACTIONS.test(name) ? "read_safe" : "external_write";
  }

  if (READ_ONLY_VERBS.test(name)) {
    return "read_safe";
  }

  // Default for modifying or unknown external tools
  return "external_write";
}

/** Redacts any secrets/passwords/tokens from JSON payload */
export function sanitizeActionPreview(args: unknown): string {
  if (args === undefined || args === null) return "{}";
  let str: string;
  try {
    str = typeof args === "string" ? args : JSON.stringify(args);
  } catch {
    str = String(args);
  }
  return redactSecrets(str);
}

function summarizeResult(result: unknown): string | null {
  if (result === undefined || result === null) return null;
  if (typeof result === "string") return redactSecrets(result.slice(0, 500));
  try {
    return redactSecrets(JSON.stringify(result).slice(0, 500));
  } catch {
    return redactSecrets(String(result).slice(0, 500));
  }
}

export interface ToolExecutionOptions<T = unknown> {
  toolName: string;
  args?: unknown;
  executor: () => Promise<T>;
  agentId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  permissionLevel?: PermissionLevel | string;
  allowedTools?: string[];
  maxCallsPerRun?: number;
  client?: Client;
}

export type ToolExecutionResult<T = unknown> =
  | { status: "EXECUTED"; result: T; auditDecision: "AUTO_ALLOWED" }
  | { status: "WAITING_APPROVAL"; approvalId: string; preview: string; riskLevel: ToolRiskLevel }
  | { status: "BLOCKED"; error: string; auditDecision: "BLOCKED" };

interface PendingCallback {
  executor: () => Promise<unknown>;
  toolName: string;
  agentId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  preview: string;
  riskLevel: ToolRiskLevel;
  permissionLevel: PermissionLevel;
  client?: Client;
}

export class PermissionGuard {
  readonly pendingCallbacks = new Map<string, PendingCallback>();
  readonly runCallCounts = new Map<string, number>();

  resetRunCounts(runKey?: string): void {
    if (runKey) {
      this.runCallCounts.delete(runKey);
    } else {
      this.runCallCounts.clear();
    }
  }

  clearPendingCallbacks(): void {
    this.pendingCallbacks.clear();
  }

  async executeTool<T = unknown>(options: ToolExecutionOptions<T>): Promise<ToolExecutionResult<T>> {
    const level = normalizePermissionLevel(options.permissionLevel);
    const risk = classifyToolRisk(options.toolName);
    const previewJson = sanitizeActionPreview(options.args);
    const runKey = options.runId || options.taskId || options.agentId || "default";

    // 1. FULL_ACCESS: All permitted tools execute autonomously
    if (level === "FULL_ACCESS") {
      try {
        const result = await options.executor();
        await logAudit(
          {
            agentId: options.agentId,
            taskId: options.taskId,
            toolName: options.toolName,
            permissionLevel: level,
            decision: "AUTO_ALLOWED",
            actionPreviewJson: previewJson,
            resultSummary: summarizeResult(result),
          },
          options.client,
        );
        return { status: "EXECUTED", result, auditDecision: "AUTO_ALLOWED" };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await logAudit(
          {
            agentId: options.agentId,
            taskId: options.taskId,
            toolName: options.toolName,
            permissionLevel: level,
            decision: "AUTO_ALLOWED",
            actionPreviewJson: previewJson,
            error: errorMsg,
          },
          options.client,
        );
        throw err;
      }
    }

    // 2. CONTROLLED_ACCESS: Safe read actions within limits execute autonomously; writes or limit breaches block/ask
    if (level === "CONTROLLED_ACCESS") {
      const isAllowedByWhitelist = !options.allowedTools || options.allowedTools.includes(options.toolName);
      const isSafe = risk === "read_safe" && isAllowedByWhitelist;

      if (isSafe) {
        const currentCount = this.runCallCounts.get(runKey) ?? 0;
        const maxCalls = options.maxCallsPerRun ?? 10;

        if (currentCount >= maxCalls) {
          const errorMsg = `Controlled access call limit of ${maxCalls} exceeded for run ${runKey}`;
          await logAudit(
            {
              agentId: options.agentId,
              taskId: options.taskId,
              toolName: options.toolName,
              permissionLevel: level,
              decision: "BLOCKED",
              actionPreviewJson: previewJson,
              error: errorMsg,
            },
            options.client,
          );
          return { status: "BLOCKED", error: errorMsg, auditDecision: "BLOCKED" };
        }

        // Increment count and execute safe read tool
        this.runCallCounts.set(runKey, currentCount + 1);
        try {
          const result = await options.executor();
          await logAudit(
            {
              agentId: options.agentId,
              taskId: options.taskId,
              toolName: options.toolName,
              permissionLevel: level,
              decision: "AUTO_ALLOWED",
              actionPreviewJson: previewJson,
              resultSummary: summarizeResult(result),
            },
            options.client,
          );
          return { status: "EXECUTED", result, auditDecision: "AUTO_ALLOWED" };
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          await logAudit(
            {
              agentId: options.agentId,
              taskId: options.taskId,
              toolName: options.toolName,
              permissionLevel: level,
              decision: "AUTO_ALLOWED",
              actionPreviewJson: previewJson,
              error: errorMsg,
            },
            options.client,
          );
          throw err;
        }
      }

      // If not safe or write/sensitive: falls through to approval request
    }

    // 3. ASK_FIRST (or CONTROLLED_ACCESS write/sensitive):
    // If read_safe in ASK_FIRST, can it run or should it ask?
    // Requirement 1: "ASK_FIRST: Every external, write, or sensitive tool action requires human approval before execution."
    if (level === "ASK_FIRST" && risk === "read_safe") {
      // Safe read tools execute autonomously
      try {
        const result = await options.executor();
        await logAudit(
          {
            agentId: options.agentId,
            taskId: options.taskId,
            toolName: options.toolName,
            permissionLevel: level,
            decision: "AUTO_ALLOWED",
            actionPreviewJson: previewJson,
            resultSummary: summarizeResult(result),
          },
          options.client,
        );
        return { status: "EXECUTED", result, auditDecision: "AUTO_ALLOWED" };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await logAudit(
          {
            agentId: options.agentId,
            taskId: options.taskId,
            toolName: options.toolName,
            permissionLevel: level,
            decision: "AUTO_ALLOWED",
            actionPreviewJson: previewJson,
            error: errorMsg,
          },
          options.client,
        );
        throw err;
      }
    }

    // Any external write, sensitive, or unapproved action requires approval!
    const approvalId = `appr-${randomUUID()}`;
    await createApprovalRequest(
      {
        id: approvalId,
        taskId: options.taskId,
        runId: options.runId,
        agentId: options.agentId,
        toolName: options.toolName,
        riskLevel: risk,
        actionPreviewJson: previewJson,
        status: "PENDING",
      },
      options.client,
    );

    // Register callback for execution when approved
    this.pendingCallbacks.set(approvalId, {
      executor: options.executor,
      toolName: options.toolName,
      agentId: options.agentId,
      taskId: options.taskId,
      runId: options.runId,
      preview: previewJson,
      riskLevel: risk,
      permissionLevel: level,
      client: options.client,
    });

    return {
      status: "WAITING_APPROVAL",
      approvalId,
      preview: previewJson,
      riskLevel: risk,
    };
  }

  async approve<T = unknown>(
    approvalId: string,
    resolvedBy = "user",
    decisionNote?: string,
    client?: Client,
  ): Promise<{ success: boolean; result?: T }> {
    const req = await getApprovalRequest(approvalId, client);
    if (!req) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    if (req.status !== "PENDING") {
      throw new Error(`Approval request ${approvalId} is already ${req.status} (cannot approve twice)`);
    }

    // Remove callback immediately to prevent double execution
    const cb = this.pendingCallbacks.get(approvalId);
    this.pendingCallbacks.delete(approvalId);

    await updateApprovalRequestStatus(
      approvalId,
      {
        status: "APPROVED",
        resolvedBy,
        decisionNote: decisionNote || "Approved by human operator",
        resolvedAt: new Date().toISOString(),
      },
      client,
    );

    let result: T | undefined;
    if (cb) {
      try {
        result = (await cb.executor()) as T;
        await logAudit(
          {
            agentId: req.agentId,
            taskId: req.taskId,
            toolName: req.toolName,
            permissionLevel: cb.permissionLevel,
            decision: "APPROVED",
            actionPreviewJson: req.actionPreviewJson,
            resultSummary: summarizeResult(result),
          },
          client,
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await logAudit(
          {
            agentId: req.agentId,
            taskId: req.taskId,
            toolName: req.toolName,
            permissionLevel: cb.permissionLevel,
            decision: "APPROVED",
            actionPreviewJson: req.actionPreviewJson,
            error: errorMsg,
          },
          client,
        );
        throw err;
      }
    } else {
      // Callback was not found in memory (e.g. server restarted or recorded elsewhere)
      await logAudit(
        {
          agentId: req.agentId,
          taskId: req.taskId,
          toolName: req.toolName,
          permissionLevel: "ASK_FIRST",
          decision: "APPROVED",
          actionPreviewJson: req.actionPreviewJson,
          resultSummary: "Approved without active execution callback",
        },
        client,
      );
    }

    return { success: true, result };
  }

  async reject(
    approvalId: string,
    resolvedBy = "user",
    decisionNote?: string,
    client?: Client,
  ): Promise<{ success: boolean }> {
    const req = await getApprovalRequest(approvalId, client);
    if (!req) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    if (req.status !== "PENDING") {
      throw new Error(`Approval request ${approvalId} is already ${req.status}`);
    }

    // Delete callback so tool is guaranteed NEVER to execute
    this.pendingCallbacks.delete(approvalId);

    await updateApprovalRequestStatus(
      approvalId,
      {
        status: "REJECTED",
        resolvedBy,
        decisionNote: decisionNote || "Rejected by human operator",
        resolvedAt: new Date().toISOString(),
      },
      client,
    );

    await logAudit(
      {
        agentId: req.agentId,
        taskId: req.taskId,
        toolName: req.toolName,
        permissionLevel: "ASK_FIRST",
        decision: "REJECTED",
        actionPreviewJson: req.actionPreviewJson,
        resultSummary: `Rejected by ${resolvedBy}: ${decisionNote || "No note"}`,
      },
      client,
    );

    return { success: true };
  }

  async cancel(
    approvalId: string,
    resolvedBy = "user",
    decisionNote?: string,
    client?: Client,
  ): Promise<{ success: boolean }> {
    const req = await getApprovalRequest(approvalId, client);
    if (!req) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    if (req.status !== "PENDING") {
      throw new Error(`Approval request ${approvalId} is already ${req.status}`);
    }

    this.pendingCallbacks.delete(approvalId);

    await updateApprovalRequestStatus(
      approvalId,
      {
        status: "CANCELLED",
        resolvedBy,
        decisionNote: decisionNote || "Cancelled",
        resolvedAt: new Date().toISOString(),
      },
      client,
    );

    await logAudit(
      {
        agentId: req.agentId,
        taskId: req.taskId,
        toolName: req.toolName,
        permissionLevel: "ASK_FIRST",
        decision: "CANCELLED",
        actionPreviewJson: req.actionPreviewJson,
        resultSummary: `Cancelled by ${resolvedBy}: ${decisionNote || "No note"}`,
      },
      client,
    );

    return { success: true };
  }
}

// Global singleton instance
export const permissionGuard = new PermissionGuard();
