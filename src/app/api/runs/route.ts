import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { createRun, createTask, listRuns } from "@/db";
import type { RunStatus } from "@/lib/shared/types";
import { executionEngine } from "@/lib/server/execution-engine";
import { randomUUID } from "node:crypto";

export async function GET(request: Request) {
  await connection();
  return handle(async () => {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status")?.toUpperCase();
    const roomId = url.searchParams.get("roomId") || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;

    const status = statusParam && ["PENDING", "RUNNING", "WAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED"].includes(statusParam)
      ? (statusParam as RunStatus)
      : undefined;

    const runs = await listRuns({ status, roomId, limit });
    return { runs };
  });
}

export async function POST(request: Request) {
  await connection();
  return handle(async () => {
    const payload = await body<{
      goal: string;
      roomId?: string;
      tasks?: Array<{
        id?: string;
        title: string;
        description?: string;
        assignedAgentId?: string;
        dependencies?: string[];
        timeoutMs?: number;
        maxRetries?: number;
      }>;
      runAsync?: boolean;
    }>(request);

    if (!payload.goal?.trim()) {
      throw new Error("Run goal is required.");
    }

    const runId = `run-${randomUUID()}`;
    await createRun({
      id: runId,
      roomId: payload.roomId || null,
      goal: payload.goal.trim(),
      status: "PENDING",
    });

    const taskInputs = payload.tasks || [];
    for (let i = 0; i < taskInputs.length; i++) {
      const t = taskInputs[i];
      const taskId = t.id || `task-${runId}-${i + 1}`;
      await createTask({
        id: taskId,
        runId,
        title: t.title,
        description: t.description || null,
        assignedAgentId: t.assignedAgentId || null,
        dependencies: t.dependencies || [],
        timeoutMs: t.timeoutMs || 60000,
        maxRetries: t.maxRetries ?? 3,
        status: "PENDING",
      });
    }

    // Execute run (synchronously if not requested async)
    if (payload.runAsync) {
      void executionEngine.executeRun(runId).catch((err) => {
        console.error(`Background execution error for run ${runId}:`, err);
      });
      return { ok: true, runId, status: "PENDING" };
    }

    const completedRun = await executionEngine.executeRun(runId);
    return { ok: true, run: completedRun };
  });
}
