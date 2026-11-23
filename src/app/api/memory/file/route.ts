import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { InputError } from "@/lib/server/service";
import { memoryService, type MemoryScope, MEMORY_SCOPES } from "@/lib/server/memory";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") as MemoryScope | null;
  const id = url.searchParams.get("id") || undefined;

  if (!scope || !MEMORY_SCOPES.includes(scope)) {
    throw new InputError(`Invalid scope. Must be one of: ${MEMORY_SCOPES.join(", ")}`);
  }

  return handle(async () => {
    const content = memoryService.readFile(scope, id);
    const path = memoryService.resolveFilePath(scope, id);
    return { scope, id: id || null, path, content };
  });
}

export async function PUT(request: Request) {
  await connection();
  return handle(async () => {
    const data = await body<{ scope: MemoryScope; id?: string; content: string }>(request);
    if (!data.scope || !MEMORY_SCOPES.includes(data.scope)) {
      throw new InputError(`Invalid scope. Must be one of: ${MEMORY_SCOPES.join(", ")}`);
    }
    if (typeof data.content !== "string") {
      throw new InputError("content string is required.");
    }

    const saved = memoryService.writeFile(data.scope, data.id, data.content);
    const path = memoryService.resolveFilePath(data.scope, data.id);
    return { ok: true, scope: data.scope, id: data.id || null, path, content: saved };
  });
}
