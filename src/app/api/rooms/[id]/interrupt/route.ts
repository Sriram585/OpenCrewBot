import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { chiefOfStaffService } from "@/lib/server/chief-of-staff";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  return handle(async () => {
    const payload = await body<{
      runId: string;
      instruction: string;
    }>(request);

    if (!payload.runId?.trim()) {
      throw new Error("runId is required to interrupt a run.");
    }
    if (!payload.instruction?.trim()) {
      throw new Error("instruction is required for mid-run interruption.");
    }

    const updatedRun = await chiefOfStaffService.interruptAndReplan(
      id,
      payload.runId.trim(),
      payload.instruction.trim(),
    );

    return { ok: true, run: updatedRun };
  });
}
