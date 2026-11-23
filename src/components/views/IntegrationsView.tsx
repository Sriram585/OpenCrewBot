"use client";

import { useEffect, useState, useCallback } from "react";
import { Plug, CheckCircle2, AlertTriangle, HelpCircle, RefreshCw, Key, ShieldCheck, Terminal } from "lucide-react";

interface IntegrationStatus {
  id: string;
  name: string;
  status: "LIVE" | "MOCKED" | "UNCONFIGURED";
  description: string;
  tools: string[];
  configDetails?: string;
  envKeys?: string[];
}

export function IntegrationsView() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationStatus | null>(null);
  const [filter, setFilter] = useState<"ALL" | "LIVE" | "MOCKED" | "UNCONFIGURED">("ALL");

  const fetchIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/integrations");
      if (!res.ok) throw new Error("Failed to load integrations");
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch (err) {
      console.error("Error fetching integrations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const filteredIntegrations = integrations.filter((item) => {
    if (filter === "ALL") return true;
    return item.status === filter;
  });

  const getStatusBadge = (status: "LIVE" | "MOCKED" | "UNCONFIGURED") => {
    switch (status) {
      case "LIVE":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            LIVE
          </span>
        );
      case "MOCKED":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            MOCKED (SIMULATED)
          </span>
        );
      case "UNCONFIGURED":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
            UNCONFIGURED
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950 text-zinc-100 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Plug className="w-7 h-7 text-blue-400" />
            <h1 className="text-2xl font-bold tracking-tight">Integrations Hub</h1>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Live vs. Mocked status verification for external APIs, MCP servers, and messaging platforms.
          </p>
        </div>

        <button
          onClick={fetchIntegrations}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Status
        </button>
      </div>

      {/* Governance & Architecture Notice */}
      <div className="mt-4 p-4 rounded-xl border border-blue-900/40 bg-blue-950/20 text-xs text-blue-300 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-blue-200">
            Strict PermissionGuard & Transparency Protocol:
          </p>
          <p className="text-blue-300/80 leading-relaxed">
            All external write operations (GitHub issue creation, Slack posts, MCP mutating tools) require human approval under <code className="text-blue-100 font-mono">ASK_FIRST</code> or <code className="text-blue-100 font-mono">CONTROLLED_ACCESS</code>. Simulated services (e.g. Gmail) are explicitly marked <code className="text-amber-300 font-mono">MOCKED</code> so you never confuse simulated outputs with real-world execution.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mt-6 pb-2">
        <span className="text-xs text-zinc-500 font-mono">FILTER:</span>
        {(["ALL", "LIVE", "MOCKED", "UNCONFIGURED"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === mode
                ? "bg-zinc-800 text-zinc-100 border border-zinc-700"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {mode} ({integrations.filter((i) => mode === "ALL" || i.status === mode).length})
          </button>
        ))}
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {filteredIntegrations.map((item) => (
          <div
            key={item.id}
            className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-zinc-100 text-base">{item.name}</h3>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{item.description}</p>
                </div>
                {getStatusBadge(item.status)}
              </div>

              {item.configDetails && (
                <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs font-mono text-zinc-400">
                  <span className="text-zinc-500 font-semibold block mb-0.5">Configuration:</span>
                  {item.configDetails}
                </div>
              )}

              {/* Tools Available */}
              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Registered Tools ({item.tools?.length || 0}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {item.tools && item.tools.length > 0 ? (
                    item.tools.map((tool) => (
                      <span
                        key={tool}
                        className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-950 text-blue-300 border border-zinc-800 flex items-center gap-1"
                      >
                        <Terminal className="w-3 h-3 text-zinc-500" />
                        {tool}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-600 italic">No direct tools exposed</span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Actions / Details */}
            <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
              <span className="text-[11px] text-zinc-500 font-mono">ID: {item.id}</span>
              <button
                onClick={() => setSelectedIntegration(item)}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium hover:underline flex items-center gap-1"
              >
                <Key className="w-3 h-3" />
                Setup Guide
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Setup Guide Modal */}
      {selectedIntegration && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                <Plug className="w-4 h-4 text-blue-400" />
                Setup Guide: {selectedIntegration.name}
              </h3>
              <button
                onClick={() => setSelectedIntegration(null)}
                className="text-zinc-500 hover:text-zinc-300 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <p className="leading-relaxed">
                To connect <strong className="text-white">{selectedIntegration.name}</strong> in production, configure the corresponding environment variables in your <code className="text-amber-300 font-mono">.env</code> file:
              </p>

              {selectedIntegration.id === "github" && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 font-mono text-zinc-300 space-y-1">
                  <div className="text-emerald-400">GITHUB_TOKEN=ghp_yourPersonalAccessToken</div>
                  <div className="text-zinc-500"># Grants read/write access to repos and PRs</div>
                </div>
              )}

              {selectedIntegration.id === "slack" && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 font-mono text-zinc-300 space-y-1">
                  <div className="text-emerald-400">SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...</div>
                  <div className="text-zinc-500"># Or SLACK_BOT_TOKEN=xoxb-... for two-way messaging</div>
                </div>
              )}

              {selectedIntegration.id === "mcp" && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 font-mono text-zinc-300 space-y-1">
                  <div className="text-emerald-400">MCP_CONFIG_PATH=data/mcp/servers.json</div>
                  <div className="text-zinc-500"># OpenCrewBot connects to Model Context Protocol servers</div>
                </div>
              )}

              {selectedIntegration.id === "gmail" && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 font-mono text-zinc-300 space-y-1">
                  <div className="text-amber-400">GMAIL_CLIENT_ID=...</div>
                  <div className="text-amber-400">GMAIL_CLIENT_SECRET=...</div>
                  <div className="text-zinc-500"># Notice: Currently operating in simulated MOCKED mode</div>
                </div>
              )}

              <p className="text-zinc-400 text-[11px] leading-relaxed">
                After updating your environment, restart the OpenCrewBot server or click &quot;Refresh Status&quot; to verify connection health.
              </p>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-800">
              <button
                onClick={() => setSelectedIntegration(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
