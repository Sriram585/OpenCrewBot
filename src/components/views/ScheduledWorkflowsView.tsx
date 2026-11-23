"use client";

import { useEffect, useState, useCallback } from "react";
import { Calendar, Play, Pause, Plus, RefreshCw, Clock, History, CheckCircle2, AlertCircle } from "lucide-react";

interface ScheduledWorkflow {
  id: string;
  name: string;
  description: string | null;
  roomId: string | null;
  goalPrompt: string;
  cronExpression: string;
  status: "ACTIVE" | "PAUSED";
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  runId: string;
  triggerType: "SCHEDULED" | "MANUAL";
  status: "COMPLETED" | "FAILED" | "RUNNING";
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export function ScheduledWorkflowsView() {
  const [workflows, setWorkflows] = useState<ScheduledWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [selectedWorkflowHistory, setSelectedWorkflowHistory] = useState<{
    workflow: ScheduledWorkflow;
    history: WorkflowRunRecord[];
  } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // New Workflow Form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("0 9 * * *");
  const [goalPrompt, setGoalPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error("Failed to load workflows");
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } catch (err: unknown) {
      console.error(err);
      setMessage({ text: err instanceof Error ? err.message : "Error fetching workflows", error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleToggle = async (id: string) => {
    try {
      setActionInProgress(id);
      const res = await fetch(`/api/workflows/${id}/toggle`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to toggle workflow status");
      setMessage({ text: "Workflow status toggled successfully." });
      await fetchWorkflows();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Toggle failed", error: true });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      setActionInProgress(id);
      const res = await fetch(`/api/workflows/${id}/run`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to execute workflow");
      const data = await res.json();
      setMessage({ text: `Workflow executed! Run ID: ${data.runId || "completed"}` });
      await fetchWorkflows();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Execution failed", error: true });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleViewHistory = async (workflow: ScheduledWorkflow) => {
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/history?limit=30`);
      if (!res.ok) throw new Error("Failed to fetch history");
      const data = await res.json();
      setSelectedWorkflowHistory({ workflow, history: data.history || [] });
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error loading history", error: true });
    }
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !goalPrompt.trim() || !cronExpression.trim()) return;

    try {
      setCreating(true);
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          cronExpression: cronExpression.trim(),
          goalPrompt: goalPrompt.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create workflow");
      }

      setMessage({ text: `Scheduled workflow "${name}" created!` });
      setName("");
      setDescription("");
      setGoalPrompt("");
      setCronExpression("0 9 * * *");
      setShowCreate(false);
      await fetchWorkflows();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Create failed", error: true });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950 text-zinc-100 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Calendar className="w-7 h-7 text-pink-400" />
            <h1 className="text-2xl font-bold tracking-tight">Scheduled AI Workflows</h1>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Automate recurring autonomous multi-agent runs on standard cron schedules with automatic execution history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-pink-600 hover:bg-pink-500 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Workflow
          </button>
          <button
            onClick={fetchWorkflows}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
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

      {/* Create Workflow Panel */}
      {showCreate && (
        <div className="mt-6 p-5 rounded-xl border border-pink-500/30 bg-zinc-900/60 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <h2 className="text-base font-semibold text-pink-300 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Create Scheduled AI Workflow
            </h2>
            <button onClick={() => setShowCreate(false)} className="text-xs text-zinc-500 hover:text-zinc-300">
              Cancel
            </button>
          </div>

          <form onSubmit={handleCreateWorkflow} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1">
                  Workflow Name:
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Daily Competitor Briefing"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-pink-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1">
                  Cron Expression (5-part format):
                </label>
                <input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="e.g. 0 9 * * * (Daily at 9 AM)"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-pink-500"
                  required
                />
                <div className="flex gap-2 mt-1">
                  {[
                    { label: "Daily 9am", expr: "0 9 * * *" },
                    { label: "Hourly", expr: "0 * * * *" },
                    { label: "Every 15m", expr: "*/15 * * * *" },
                    { label: "Mon 8am", expr: "0 8 * * 1" },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setCronExpression(preset.expr)}
                      className="text-[10px] text-pink-400 hover:underline"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1">
                Description (Optional):
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of workflow objective"
                className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-pink-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase mb-1">
                Autonomous Goal Prompt:
              </label>
              <textarea
                value={goalPrompt}
                onChange={(e) => setGoalPrompt(e.target.value)}
                rows={3}
                placeholder="Describe the exact task the Chief of Staff and agent swarm will execute upon every schedule trigger..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-pink-500 font-sans"
                required
              />
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-800">
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-pink-600 hover:bg-pink-500 text-white transition-colors disabled:opacity-50"
              >
                {creating ? "Scheduling..." : "Save & Activate Workflow"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Workflows List */}
      <div className="mt-6 space-y-4">
        {workflows.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
            <Clock className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-zinc-300">No Scheduled Workflows</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">
              Create an automated cron schedule above to have your multi-agent swarm run market research, reporting, or health checks autonomously.
            </p>
          </div>
        ) : (
          workflows.map((wf) => (
            <div
              key={wf.id}
              className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-zinc-100 text-base truncate">{wf.name}</h3>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      wf.status === "ACTIVE"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                    }`}
                  >
                    {wf.status}
                  </span>
                  <code className="text-xs font-mono bg-zinc-950 px-2 py-0.5 rounded text-pink-300 border border-zinc-800">
                    {wf.cronExpression}
                  </code>
                </div>

                {wf.description && <p className="text-xs text-zinc-400">{wf.description}</p>}

                <p className="text-xs text-zinc-300 font-mono bg-zinc-950/60 p-2 rounded border border-zinc-800/80 line-clamp-2">
                  Goal: {wf.goalPrompt}
                </p>

                <div className="flex items-center gap-4 text-[11px] text-zinc-500 font-mono pt-1">
                  <span>Last Run: {wf.lastRunAt ? new Date(wf.lastRunAt).toLocaleString() : "Never"}</span>
                  <span>•</span>
                  <span>Created: {new Date(wf.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRunNow(wf.id)}
                  disabled={actionInProgress === wf.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                  title="Execute workflow immediately"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Run Now
                </button>

                <button
                  onClick={() => handleToggle(wf.id)}
                  disabled={actionInProgress === wf.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                    wf.status === "ACTIVE"
                      ? "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                      : "bg-emerald-950 border-emerald-800 text-emerald-300 hover:bg-emerald-900"
                  }`}
                >
                  {wf.status === "ACTIVE" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {wf.status === "ACTIVE" ? "Pause" : "Resume"}
                </button>

                <button
                  onClick={() => handleViewHistory(wf)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                  title="View run history"
                >
                  <History className="w-3.5 h-3.5" />
                  History
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* History Modal */}
      {selectedWorkflowHistory && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="font-semibold text-zinc-100">
                  Execution History: {selectedWorkflowHistory.workflow.name}
                </h3>
                <span className="text-xs text-zinc-400 font-mono">
                  Cron: {selectedWorkflowHistory.workflow.cronExpression}
                </span>
              </div>
              <button
                onClick={() => setSelectedWorkflowHistory(null)}
                className="text-zinc-500 hover:text-zinc-300 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {selectedWorkflowHistory.history.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-sm">
                  No execution runs recorded for this workflow yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase">
                    <tr>
                      <th className="p-3">Started At</th>
                      <th className="p-3">Trigger</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Run ID</th>
                      <th className="p-3">Error / Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {selectedWorkflowHistory.history.map((h) => (
                      <tr key={h.id} className="hover:bg-zinc-800/30">
                        <td className="p-3 text-zinc-400">{new Date(h.startedAt).toLocaleString()}</td>
                        <td className="p-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300">
                            {h.triggerType}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              h.status === "COMPLETED"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : h.status === "RUNNING"
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-red-500/20 text-red-300"
                            }`}
                          >
                            {h.status}
                          </span>
                        </td>
                        <td className="p-3 text-zinc-300 truncate max-w-xs">{h.runId}</td>
                        <td className="p-3 text-zinc-400 truncate max-w-xs">{h.error || "Success"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-800">
              <button
                onClick={() => setSelectedWorkflowHistory(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
