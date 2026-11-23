import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { memoryService } from "@/lib/server/memory";

export async function GET() {
  await connection();
  return handle(async () => {
    const files = memoryService.listFiles();
    const byScope: Record<string, typeof files> = {
      agent: [],
      room: [],
      project: [],
      user: [],
      decisions: [],
      tasks: [],
    };
    for (const f of files) {
      if (!byScope[f.scope]) byScope[f.scope] = [];
      byScope[f.scope].push(f);
    }
    return { files, byScope };
  });
}
