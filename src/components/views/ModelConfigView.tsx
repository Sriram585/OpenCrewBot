"use client";

import { useEffect, useState, useCallback } from "react";
import { Cpu, DollarSign, Database, Activity, RefreshCw, Save, ArrowRightLeft, CheckCircle2 } from "lucide-react";

interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  models: string[];
}

interface AgentModelConfig {
  agentId: string;
  provider: string;
  primaryModel: string;
  fallbackProvider: string | null;
  fallbackModel: string | null;
  updatedAt: string;
}

interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  fallbackCount: number;
  mockCount: number;
}

interface UsageLog {
  id: string;
  agentId: string;
  model: string;
  provider: string;
  taskType: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  fallbackUsed: number;
  mockMode: number;
  timestamp: string;
}

export function ModelConfigView() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [agentConfigs, setAgentConfigs] = useState<AgentModelConfig[]>([]);
  const [taskRouting, setTaskRouting] = useState<Record<string, { provider: string; model: string }>>({});
  const [mockMode, setMockMode] = useState(false);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"routing" | "usage">("routing");

  // Form State
  const [selectedAgent, setSelectedAgent] = useState("agent-chief-of-staff");
  const [formProvider, setFormProvider] = useState("nebius");
  const [formPrimaryModel, setFormPrimaryModel] = useState("meta-llama/Llama-3.3-70B-Instruct");
  const [formFallbackProvider, setFormFallbackProvider] = useState("ollama");
  const [formFallbackModel, setFormFallbackModel] = useState("llama3.2:latest");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [configRes, usageRes] = await Promise.all([
        fetch("/api/models/config"),
        fetch("/api/models/usage?limit=100"),
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setProviders(configData.providers || []);
        setAgentConfigs(configData.agentConfigs || []);
        setTaskRouting(configData.defaultTaskRouting || {});
        setMockMode(Boolean(configData.mockMode));
      }

      if (usageRes.ok) {
        const usageData = await usageRes.json();
        setSummary(usageData.summary || null);
        setLogs(usageData.logs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When agent selection changes, populate form if config exists
  useEffect(() => {
    const existing = agentConfigs.find((c) => c.agentId === selectedAgent);
    if (existing) {
      setFormProvider(existing.provider);
      setFormPrimaryModel(existing.primaryModel);
      setFormFallbackProvider(existing.fallbackProvider || "ollama");
      setFormFallbackModel(existing.fallbackModel || "llama3.2:latest");
    }
  }, [selectedAgent, agentConfigs]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch("/api/models/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent,
          provider: formProvider,
          primaryModel: formPrimaryModel,
          fallbackProvider: formFallbackProvider,
          fallbackModel: formFallbackModel,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save configuration");
      }

      setMessage({ text: `Model configuration updated for ${selectedAgent}!` });
      await fetchData();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Save failed", error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950 text-zinc-100 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Cpu className="w-7 h-7 text-indigo-400" />
            <h1 className="text-2xl font-bold tracking-tight">Multi-Model Intelligence & Routing</h1>
            {mockMode && (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                MOCK_MODE Active
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Configure per-agent LLM providers, automatic fallbacks, task-based routing, and monitor token economics.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 p-3 rounded-lg text-sm flex items-center justify-between ${
            message.error
              ? "bg-red-950/50 border border-red-800/80 text-red-300"
              : "bg-emerald-950/50 border border-emerald-800/80 text-emerald-300"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs hover:underline opacity-80">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 mt-6 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab("routing")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "routing"
              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
              : "text-zinc-400 hover:bg-zinc-900"
          }`}
        >
          <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
          Model Routing & Fallbacks
        </button>
        <button
          onClick={() => setActiveTab("usage")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "usage"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "text-zinc-400 hover:bg-zinc-900"
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-400" />
          Token Economics & Cost Logs
        </button>
      </div>

      {/* Tab 1: Routing */}
      {activeTab === "routing" && (
        <div className="mt-6 space-y-6">
          {/* Provider Status Grid */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
              Configured Providers
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/40 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-zinc-200">{p.name}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        p.configured ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                      title={p.configured ? "Configured" : "Unconfigured"}
                    />
                  </div>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    {p.configured ? `${p.models.length} models ready` : "No API key"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-Agent Configuration Form */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-4">
            <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              Per-Agent Primary & Fallback Configuration
            </h2>
            <p className="text-xs text-zinc-400">
              When an agent runs a task, the engine will query the Primary Model. If it encounters network errors, HTTP 429, or 5xx, it automatically falls back to the configured Fallback Model.
            </p>

            <form onSubmit={handleSaveConfig} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1.5">
                    Target Agent:
                  </label>
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="agent-chief-of-staff">Chief of Staff (agent-chief-of-staff)</option>
                    <option value="agent-market-researcher">Market Researcher (agent-market-researcher)</option>
                    <option value="agent-competitor-analyst">Competitor Analyst (agent-competitor-analyst)</option>
                    <option value="agent-marketing-strategist">Marketing Strategist (agent-marketing-strategist)</option>
                    <option value="agent-content-creator">Content Creator (agent-content-creator)</option>
                    <option value="agent-data-analyst">Data Analyst (agent-data-analyst)</option>
                    <option value="agent-senior-code-reviewer">Senior Code Reviewer (agent-senior-code-reviewer)</option>
                    <option value="agent-automation-ops">Automation Ops (agent-automation-ops)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1.5">
                    Primary Provider:
                  </label>
                  <select
                    value={formProvider}
                    onChange={(e) => setFormProvider(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="nebius">Nebius (Meta Llama, DeepSeek, Qwen)</option>
                    <option value="openai">OpenAI (GPT-4o, GPT-4o-mini)</option>
                    <option value="gemini">Google Gemini (Gemini 2.5 Flash / Pro)</option>
                    <option value="groq">Groq (Llama-3-70B ultra-fast)</option>
                    <option value="ollama">Local Ollama (Offline endpoint)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1.5">
                    Primary Model Identifier:
                  </label>
                  <input
                    type="text"
                    value={formPrimaryModel}
                    onChange={(e) => setFormPrimaryModel(e.target.value)}
                    placeholder="e.g. meta-llama/Llama-3.3-70B-Instruct"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1.5">
                    Fallback Provider (On 429 / 5xx / Network Failure):
                  </label>
                  <select
                    value={formFallbackProvider}
                    onChange={(e) => setFormFallbackProvider(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="ollama">Local Ollama (Offline Fallback)</option>
                    <option value="nebius">Nebius</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="groq">Groq</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1.5">
                    Fallback Model Identifier:
                  </label>
                  <input
                    type="text"
                    value={formFallbackModel}
                    onChange={(e) => setFormFallbackModel(e.target.value)}
                    placeholder="e.g. llama3.2:latest or gpt-4o-mini"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-zinc-800">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </form>
          </div>

          {/* Task-Based Routing Table */}
          <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
            <h3 className="font-semibold text-xs text-zinc-300 uppercase tracking-wider">
              Default Task-Based Fallback Routing
            </h3>
            <p className="text-xs text-zinc-400">
              When no explicit agent override is configured, tasks are routed automatically based on complexity:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(taskRouting).map(([taskType, target]) => (
                <div key={taskType} className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-mono">
                  <span className="font-bold text-indigo-300 uppercase block mb-1">{taskType}</span>
                  <div className="text-zinc-400 text-[11px] truncate">Provider: {target.provider}</div>
                  <div className="text-zinc-500 text-[11px] truncate">{target.model}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Token Economics & Cost Logs */}
      {activeTab === "usage" && (
        <div className="mt-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 uppercase font-mono block">Prompt Tokens</span>
              <span className="text-xl font-bold font-mono text-zinc-100">
                {(summary?.totalPromptTokens || 0).toLocaleString()}
              </span>
            </div>
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 uppercase font-mono block">Completion Tokens</span>
              <span className="text-xl font-bold font-mono text-zinc-100">
                {(summary?.totalCompletionTokens || 0).toLocaleString()}
              </span>
            </div>
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 uppercase font-mono block">Total Tokens</span>
              <span className="text-xl font-bold font-mono text-indigo-400">
                {(summary?.totalTokens || 0).toLocaleString()}
              </span>
            </div>
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 uppercase font-mono block">Total Cost (USD)</span>
              <span className="text-xl font-bold font-mono text-emerald-400">
                ${(summary?.totalCostUsd || 0).toFixed(4)}
              </span>
            </div>
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <span className="text-xs text-zinc-500 uppercase font-mono block">Fallbacks Triggered</span>
              <span className="text-xl font-bold font-mono text-amber-400">
                {summary?.fallbackCount || 0}
              </span>
            </div>
          </div>

          {/* Usage Logs Table */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-semibold text-xs uppercase tracking-wider text-zinc-300">
                Live Model Call Invocations ({logs.length})
              </h3>
              <span className="text-xs text-zinc-500 font-mono">Real-time SQLite log</span>
            </div>

            {logs.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                No model usage logs recorded yet. Execute runs to populate cost tracking.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 uppercase">
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Agent</th>
                      <th className="p-3">Provider / Model</th>
                      <th className="p-3">Task Type</th>
                      <th className="p-3 text-right">Tokens</th>
                      <th className="p-3 text-right">Cost</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-800/30">
                        <td className="p-3 text-zinc-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3 font-semibold text-zinc-300">{log.agentId}</td>
                        <td className="p-3 text-zinc-300">
                          <span className="text-indigo-400">{log.provider}</span> / {log.model}
                        </td>
                        <td className="p-3 text-zinc-400">{log.taskType || "standard"}</td>
                        <td className="p-3 text-right text-zinc-200">
                          {(log.promptTokens + log.completionTokens).toLocaleString()}
                        </td>
                        <td className="p-3 text-right text-emerald-400">
                          ${log.costUsd.toFixed(5)}
                        </td>
                        <td className="p-3 text-center">
                          {log.fallbackUsed === 1 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Fallback
                            </span>
                          ) : log.mockMode === 1 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              Mocked
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Primary
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
