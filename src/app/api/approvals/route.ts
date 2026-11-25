import { connection } from "next/server";
import { randomUUID } from "node:crypto";
import { body, handle } from "@/lib/server/http";
import { listApprovalRequests, listAuditLogs, createApprovalRequest, getApprovalRequest, type ApprovalStatus } from "@/db";
import { sanitizeActionPreview } from "@/lib/server/permissions";

export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status")?.toUpperCase();
    const agentId = url.searchParams.get("agentId") || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;

    const status = statusParam && ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(statusParam)
      ? (statusParam as ApprovalStatus)
      : undefined;

    const [requests, recentAuditLogs] = await Promise.all([
      listApprovalRequests({ status, agentId, limit }),
      listAuditLogs({ agentId, limit: Math.min(limit, 100) }),
    ]);

    return {
      requests,
      recentAuditLogs,
    };
  });
}

export async function POST(request: Request) {
  await connection();
  return handle(async () => {
    const payload = await body<{
      agentId?: string;
      toolName?: string;
      args?: unknown;
      riskLevel?: "read_safe" | "external_write" | "sensitive";
      runId?: string;
      taskId?: string;
    }>(request);

    const agentId = payload.agentId || "agent-code_architect";
    const toolName = payload.toolName || "github_create_issue";
    const riskLevel = payload.riskLevel || "sensitive";
    const args = payload.args || {
      repo: "meetuniversity/core-admissions",
      title: "[MeetUniversity-Audit] Upgrade README with automated verification badges",
      body: "Deploy autonomous webhook handler with elevated repository write access.",
      apiKey: "ghp_SECRET_REDACTED_BY_PERMISSION_GUARD",
    };

    const id = `appr-${randomUUID().slice(0, 8)}`;
    await createApprovalRequest({
      id,
      runId: payload.runId || null,
      taskId: payload.taskId || null,
      agentId,
      toolName,
      actionPreviewJson: sanitizeActionPreview(args),
      riskLevel,
    });

    const req = await getApprovalRequest(id);
    return { ok: true, request: req };
  });
}
