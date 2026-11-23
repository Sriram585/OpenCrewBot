// Real Slack Integration using Webhook / Bot API
// Write operations (postSlackMessage) are gated by PermissionGuard.
import { permissionGuard } from "../permissions";
import type { Client } from "@libsql/client";

export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN?.trim() || process.env.SLACK_WEBHOOK_URL?.trim());
}

export async function postSlackMessage(
  target: string,
  text: string,
  options?: {
    agentId?: string;
    taskId?: string;
    permissionLevel?: string;
    client?: Client;
  },
): Promise<{ success: boolean; result?: unknown; approvalId?: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim() || (target.startsWith("http") ? target : undefined);
  const botToken = process.env.SLACK_BOT_TOKEN?.trim();

  const executor = async () => {
    if (!webhookUrl && !botToken) {
      throw new Error("Slack is unconfigured: neither SLACK_WEBHOOK_URL nor SLACK_BOT_TOKEN is set.");
    }

    if (webhookUrl) {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`Slack webhook error (${res.status}): ${await res.text()}`);
      return { ok: true, via: "webhook" };
    }

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: target, text }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) throw new Error(`Slack API error: ${data.error || "unknown"}`);
    return data;
  };

  const guardResult = await permissionGuard.executeTool({
    toolName: "slack_post_message",
    args: { target, text },
    executor,
    agentId: options?.agentId,
    taskId: options?.taskId,
    permissionLevel: options?.permissionLevel || "ASK_FIRST",
    client: options?.client,
  });

  if (guardResult.status === "WAITING_APPROVAL") {
    return { success: false, approvalId: guardResult.approvalId };
  }

  if (guardResult.status === "BLOCKED") {
    throw new Error(`Slack action blocked: ${guardResult.error}`);
  }

  return { success: true, result: guardResult.result };
}
