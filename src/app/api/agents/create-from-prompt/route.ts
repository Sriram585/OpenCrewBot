import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { createAgentFromNaturalLanguage } from "@/lib/server/agent-factory";

export async function POST(request: Request) {
  await connection();
  return handle(async () => {
    const payload = await body<{ prompt: string }>(request);
    if (!payload.prompt?.trim()) {
      throw new Error("Prompt is required to create an agent.");
    }

    const agent = await createAgentFromNaturalLanguage(payload.prompt.trim());
    return { ok: true, agent };
  });
}
