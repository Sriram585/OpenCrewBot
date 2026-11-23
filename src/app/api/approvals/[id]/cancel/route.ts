import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { permissionGuard } from "@/lib/server/permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  return handle(async () => {
    let payload: { resolvedBy?: string; note?: string } = {};
    try {
      payload = await body<{ resolvedBy?: string; note?: string }>(request);
    } catch {
      // payload is optional
    }

    const res = await permissionGuard.cancel(
      id,
      payload.resolvedBy || "user",
      payload.note,
    );
    return { ok: true, ...res };
  });
}
