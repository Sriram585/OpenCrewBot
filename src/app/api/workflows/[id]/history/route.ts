import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { workflowScheduler } from "@/lib/server/scheduler";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  return handle(async () => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit")) || 50;
    const history = await workflowScheduler.listHistory(id, limit);
    return { history };
  });
}
