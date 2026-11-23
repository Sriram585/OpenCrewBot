// MCP (Model Context Protocol) Integration Manager
// Connects to configured remote MCP servers or local stdio tools and exposes tool definitions.
import { listServers } from "../mcp-servers";

export interface McpToolDefinition {
  name: string;
  description: string;
  serverId?: string;
}

export async function getAvailableMcpTools(): Promise<McpToolDefinition[]> {
  try {
    const servers = await listServers();
    const tools: McpToolDefinition[] = [
      {
        name: "mcp_filesystem_read",
        description: "Read files from local workspace or host path via MCP.",
      },
      {
        name: "mcp_fetch_resource",
        description: "Fetch remote HTTP/HTTPS resource via MCP protocol bridge.",
      },
    ];

    for (const s of servers) {
      tools.push({
        name: `mcp_${s.id}_execute`,
        description: `Execute tools hosted on remote MCP server: ${s.name} (${s.url})`,
        serverId: s.id,
      });
    }

    return tools;
  } catch {
    return [];
  }
}

export async function isMcpConfigured(): Promise<boolean> {
  try {
    const servers = await listServers();
    return servers.length > 0;
  } catch {
    return false;
  }
}
