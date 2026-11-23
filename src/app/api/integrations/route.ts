import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { getIntegrationsStatus } from "@/lib/server/integrations";

export async function GET() {
  await connection();
  return handle(async () => {
    const integrations = await getIntegrationsStatus();
    return { integrations };
  });
}
