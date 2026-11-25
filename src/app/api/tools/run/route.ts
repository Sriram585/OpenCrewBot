import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { analyzeCsv } from "@/lib/server/tools-business";

export async function POST(request: Request) {
  await connection();
  return handle(async () => {
    const payload = await body<{
      tool: string;
      path?: string;
      csvContent?: string;
    }>(request);

    const toolName = payload.tool || "analyze_csv";

    if (toolName === "analyze_csv") {
      let content = payload.csvContent;
      if (!content) {
        const filePath = payload.path || "data/samples/meetuniversity_sales.csv";
        const filename = filePath.split("/").pop() || "meetuniversity_sales.csv";
        const absolutePath = join(process.cwd(), "data", "samples", filename);

        if (!existsSync(absolutePath)) {
          throw new Error(`CSV file not found at ${absolutePath}`);
        }
        content = readFileSync(absolutePath, "utf-8");
      }

      const result = analyzeCsv(content);
      return {
        ok: true,
        tool: "analyze_csv",
        path: payload.path || "data/samples/meetuniversity_sales.csv",
        result,
      };
    }

    throw new Error(`Tool "${toolName}" is not directly invokable via test runner.`);
  });
}
