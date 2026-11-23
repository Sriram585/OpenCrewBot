import { connection } from "next/server";
import { body, handle } from "@/lib/server/http";
import { isMock } from "@/lib/server/config";
import { InputError } from "@/lib/server/service";
import { DEFAULT_TASK_ROUTING, getAvailableProviders } from "@/lib/server/models";
import { getAgentModelConfig, listAgentModelConfigs, saveAgentModelConfig, type AgentModelConfig } from "@/db";

export async function GET() {
  await connection();
  return handle(async () => {
    const providers = getAvailableProviders();
    const agentConfigs = await listAgentModelConfigs();
    return {
      providers,
      defaultTaskRouting: DEFAULT_TASK_ROUTING,
      agentConfigs,
      mockMode: isMock(),
    };
  });
}

export async function POST(request: Request) {
  await connection();
  return handle(async () => {
    const data = await body<Partial<AgentModelConfig>>(request);
    if (!data.agentId?.trim()) throw new InputError("agentId is required.");
    if (!data.provider?.trim()) throw new InputError("provider is required.");
    if (!data.primaryModel?.trim()) throw new InputError("primaryModel is required.");

    const config: AgentModelConfig = {
      agentId: data.agentId.trim(),
      provider: data.provider.trim(),
      primaryModel: data.primaryModel.trim(),
      fallbackProvider: data.fallbackProvider?.trim() || null,
      fallbackModel: data.fallbackModel?.trim() || null,
      updatedAt: new Date().toISOString(),
    };

    await saveAgentModelConfig(config);
    return { ok: true, config };
  });
}
