// Module H: Integrations Hub
// Tracks live vs mocked status across GitHub, Slack, MCP, and Gmail integrations.
import { isGitHubConfigured, getRepoOverview, listRepoFiles, listIssues, createIssue } from "./github";
import { isSlackConfigured, postSlackMessage } from "./slack";
import { isMcpConfigured, getAvailableMcpTools } from "./mcp";

export { isGitHubConfigured, getRepoOverview, listRepoFiles, listIssues, createIssue };
export { isSlackConfigured, postSlackMessage };
export { isMcpConfigured, getAvailableMcpTools };

export type IntegrationMode = "LIVE" | "MOCKED" | "UNCONFIGURED";

export interface IntegrationStatus {
  id: string;
  name: string;
  mode: IntegrationMode;
  description: string;
  availableTools: string[];
  disclaimer?: string;
}

export async function getIntegrationsStatus(): Promise<IntegrationStatus[]> {
  const githubConfigured = isGitHubConfigured();
  const slackConfigured = isSlackConfigured();
  const mcpConfigured = await isMcpConfigured();
  const gmailConfigured = Boolean(process.env.GMAIL_API_KEY?.trim());

  return [
    {
      id: "github",
      name: "GitHub",
      // Public repository reading works live without token; write actions require GITHUB_TOKEN
      mode: githubConfigured ? "LIVE" : "LIVE",
      description: "Real REST API for inspecting repositories, reading files, and gated issue creation.",
      availableTools: ["github_repo_overview", "github_list_files", "github_read_file", "github_list_issues", "github_create_issue"],
      disclaimer: githubConfigured ? "Authenticated live mode." : "Unauthenticated public read mode; set GITHUB_TOKEN for private repos & writes.",
    },
    {
      id: "slack",
      name: "Slack",
      mode: slackConfigured ? "LIVE" : "UNCONFIGURED",
      description: "Real webhooks and bot messaging for collaborative channels.",
      availableTools: ["slack_post_message"],
      disclaimer: slackConfigured ? "Connected live via webhook/token." : "Unconfigured: Set SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN to enable live delivery.",
    },
    {
      id: "mcp",
      name: "Model Context Protocol (MCP)",
      mode: "LIVE",
      description: "Standardized tool & context connector bridging remote and local MCP endpoints.",
      availableTools: ["mcp_filesystem_read", "mcp_fetch_resource", ...(await getAvailableMcpTools()).map((t) => t.name)],
    },
    {
      id: "gmail",
      name: "Gmail",
      mode: gmailConfigured ? "LIVE" : "MOCKED",
      description: "Email drafting, dispatch, and mailbox sync.",
      availableTools: ["gmail_search_threads", "gmail_send_draft"],
      disclaimer: gmailConfigured
        ? "Connected live via API key."
        : "Simulated in Mock Mode: Outputs are prefixed with [MOCKED] until GMAIL_API_KEY is configured.",
    },
  ];
}
