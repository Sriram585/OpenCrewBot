import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { InputError } from "@/lib/server/service";
import { memoryService, type MemoryScope, MEMORY_SCOPES } from "@/lib/server/memory";

export async function POST(request: Request) {
  await connection();
  return handle(async () => {
    const data = await body<{
      scope: MemoryScope;
      id?: string;
      content: string;
      reason?: string;
      source?: string;
    }>(request);

    if (!data.scope || !MEMORY_SCOPES.includes(data.scope)) {
      throw new InputError(`Invalid scope. Must be one of: ${MEMORY_SCOPES.join(", ")}`);
    }
    if (!data.content?.trim()) {
      throw new InputError("content string is required.");
    }

    const entry = memoryService.appendEntry(data.scope, data.id, {
      content: data.content,
      reason: data.reason,
      source: data.source,
    });
    const path = memoryService.resolveFilePath(data.scope, data.id);

    return { ok: true, scope: data.scope, id: data.id || null, path, entry };
  });
}
