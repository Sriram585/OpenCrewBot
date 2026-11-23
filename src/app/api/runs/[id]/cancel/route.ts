import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { executionEngine } from "@/lib/server/execution-engine";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  return handle(async () => {
    const run = await executionEngine.cancelRun(id);
    return { ok: true, run };
  });
}
