import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { workflowScheduler } from "@/lib/server/scheduler";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  return handle(async () => {
    const result = await workflowScheduler.runWorkflow(id, "MANUAL");
    return { ok: true, ...result };
  });
}
