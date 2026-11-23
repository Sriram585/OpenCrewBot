import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { getModelUsageSummary, listModelUsageLogs } from "@/db";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const agentId = url.searchParams.get("agentId") || undefined;
  const model = url.searchParams.get("model") || undefined;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 1000);

  return handle(async () => {
    const [summary, logs] = await Promise.all([
      getModelUsageSummary({ agentId, model }),
      listModelUsageLogs({ agentId, model, limit }),
    ]);
    return { summary, logs };
  });
}
