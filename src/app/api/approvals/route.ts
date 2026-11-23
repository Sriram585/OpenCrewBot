import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { listApprovalRequests, listAuditLogs, type ApprovalStatus } from "@/db";

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
