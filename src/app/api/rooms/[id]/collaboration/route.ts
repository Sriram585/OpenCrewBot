import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { listCollaborationMessages } from "@/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  return handle(async () => {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId") || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;

    const messages = await listCollaborationMessages(id, { runId, limit });
    return { messages };
  });
}
