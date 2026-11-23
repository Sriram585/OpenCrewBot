// Real GitHub Integration using GitHub REST API
// Read operations work with or without GITHUB_TOKEN; write operations (createIssue) are gated by PermissionGuard.
import { permissionGuard } from "../permissions";
import type { Client } from "@libsql/client";

function getHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "OpenCrewBot-GitHub-Integration",
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

export async function getRepoOverview(owner: string, repo: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    fullName: data.full_name,
    description: data.description,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    defaultBranch: data.default_branch,
    topics: data.topics,
  };
}

export async function listRepoFiles(
  owner: string,
  repo: string,
  path = "",
): Promise<Array<{ name: string; path: string; type: string; size: number }>> {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
    { headers: getHeaders() },
  );
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as Array<{ name: string; path: string; type: string; size: number }>;
  return Array.isArray(data)
    ? data.map((item) => ({ name: item.name, path: item.path, type: item.type, size: item.size }))
    : [];
}

export async function listIssues(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
): Promise<Array<{ number: number; title: string; state: string; user: string; createdAt: string }>> {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${state}`,
    { headers: getHeaders() },
  );
  if (!res.ok) {
    throw new Error(`GitHub API error (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as Array<{
    number: number;
    title: string;
    state: string;
    user?: { login: string };
    created_at: string;
  }>;
  return Array.isArray(data)
    ? data.map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        user: issue.user?.login || "unknown",
        createdAt: issue.created_at,
      }))
    : [];
}

/**
 * Creates an issue on GitHub. Gated by PermissionGuard.
 */
export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  bodyText: string,
  options?: {
    agentId?: string;
    taskId?: string;
    permissionLevel?: string;
    client?: Client;
  },
): Promise<{ success: boolean; issue?: Record<string, unknown>; approvalId?: string }> {
  const executor = async () => {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      {
        method: "POST",
        headers: {
          ...getHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, body: bodyText }),
      },
    );
    if (!res.ok) {
      throw new Error(`GitHub API write error (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as Record<string, unknown>;
  };

  const guardResult = await permissionGuard.executeTool({
    toolName: "github_create_issue",
    args: { owner, repo, title, body: bodyText },
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
    throw new Error(`GitHub issue creation blocked: ${guardResult.error}`);
  }

  return { success: true, issue: guardResult.result as Record<string, unknown> };
}

export function isGitHubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN?.trim());
}
