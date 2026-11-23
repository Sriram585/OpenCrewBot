import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { chiefOfStaffService } from "@/lib/server/chief-of-staff";

export async function POST(request: Request) {
  await connection();
  return handle(async () => {
    const payload = await body<{
      goal: string;
      roomId?: string;
      projectId?: string;
      executeAsync?: boolean;
    }>(request);

    if (!payload.goal?.trim()) {
      throw new Error("Goal is required for orchestration.");
    }

    const result = await chiefOfStaffService.orchestrateGoal(payload.goal.trim(), {
      roomId: payload.roomId,
      projectId: payload.projectId,
      executeAsync: payload.executeAsync,
    });

    return {
      ok: true,
      runId: result.run.id,
      run: result.run,
      tasks: result.tasks,
    };
  });
}
