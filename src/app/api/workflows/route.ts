import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { workflowScheduler } from "@/lib/server/scheduler";
import type { WorkflowStatus } from "@/lib/shared/types";

export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status")?.toUpperCase();
    const roomId = url.searchParams.get("roomId") || undefined;

    const status = statusParam && ["ACTIVE", "PAUSED"].includes(statusParam)
      ? (statusParam as WorkflowStatus)
      : undefined;

    const workflows = await workflowScheduler.listWorkflows({ status, roomId });
    return { workflows };
  });
}

export async function POST(request: Request) {
  await connection();
  return handle(async () => {
    const payload = await body<{
      name: string;
      description?: string;
      roomId?: string;
      goalPrompt: string;
      cronExpression: string;
      status?: WorkflowStatus;
    }>(request);

    const workflow = await workflowScheduler.createWorkflow(payload);
    return { ok: true, workflow };
  });
}
