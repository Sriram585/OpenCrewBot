"use client";

import { useEffect, useState, useCallback } from "react";
import { History, Download, ChevronRight, ChevronDown, CheckCircle2, XCircle, AlertTriangle, RefreshCw, FileText } from "lucide-react";

interface TaskItem {
  id: string;
  runId: string;
  title: string;
  description: string | null;
  assignedAgentId: string | null;
  dependencies: string[];
  status: "PENDING" | "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
  retries: number;
  maxRetries: number;
  output: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface RunItem {
  id: string;
  roomId: string | null;
  goal: string;
  status: "PENDING" | "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
  finalOutput: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export function ExecutionHistoryView() {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runTasks, setRunTasks] = useState<Record<string, TaskItem[]>>({});
  const [fetchingTasks, setFetchingTasks] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/runs?limit=100");
      if (!res.ok) throw new Error("Failed to load runs");
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const toggleRunDetails = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }

    setExpandedRunId(runId);
    if (!runTasks[runId]) {
      try {
        setFetchingTasks(runId);
        const res = await fetch(`/api/runs/${runId}`);
        if (res.ok) {
          const data = await res.json();
          setRunTasks((prev) => ({ ...prev, [runId]: data.tasks || [] }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setFetchingTasks(null);
      }
    }
  };

  const handleDownloadDeliverable = (run: RunItem) => {
    const tasks = runTasks[run.id] || [];
    const content = [
      `# Executive Deliverable: ${run.goal}`,
      ``,
      `**Run ID:** \`${run.id}\``,
      `**Status:** ${run.status}`,
      `**Started:** ${run.startedAt ? new Date(run.startedAt).toISOString() : "N/A"}`,
      `**Completed:** ${run.completedAt ? new Date(run.completedAt).toISOString() : "N/A"}`,
      ``,
      `---`,
      ``,
      `## Consolidated Output`,
      ``,
      run.finalOutput || "_No final deliverable output recorded._",
      ``,
      `---`,
      ``,
      `## Task Execution Breakdown (${tasks.length} tasks)`,
      ``,
      ...tasks.map(
        (t) =>
          `### ${t.title} [${t.status}]\n` +
          `- **Assigned Agent:** ${t.assignedAgentId || "Unassigned"}\n` +
          `- **Retries:** ${t.retries}/${t.maxRetries}\n` +
          (t.output ? `\n**Output:**\n${t.output}\n` : "") +
          (t.error ? `\n**Error:**\n${t.error}\n` : "")
      ),
    ].join("\n");

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${run.id}-deliverable.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredRuns = runs.filter((r) => {
    if (statusFilter === "ALL") return true;
    return r.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">COMPLETED</span>;
      case "RUNNING":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse">RUNNING</span>;
      case "WAITING_APPROVAL":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">WAITING APPROVAL</span>;
      case "FAILED":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">FAILED</span>;
      case "CANCELLED":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">CANCELLED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-zinc-800 text-zinc-300">{status}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950 text-zinc-100 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <History className="w-7 h-7 text-cyan-400" />
            <h1 className="text-2xl font-bold tracking-tight">Execution History & Deliverables</h1>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Complete audit record of past autonomous DAG runs, task graphs, error traces, and downloadable executive deliverables.
          </p>
        </div>

        <button
          onClick={fetchRuns}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mt-6 pb-2">
        <span className="text-xs text-zinc-500 font-mono">STATUS:</span>
        {["ALL", "COMPLETED", "RUNNING", "WAITING_APPROVAL", "FAILED", "CANCELLED"].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === st
                ? "bg-zinc-800 text-zinc-100 border border-zinc-700"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {st} ({runs.filter((r) => st === "ALL" || r.status === st).length})
          </button>
        ))}
      </div>

      {/* Runs Table / List */}
      <div className="mt-4 space-y-3">
        {filteredRuns.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30 text-zinc-500 text-sm">
            No execution runs found matching this filter.
          </div>
        ) : (
          filteredRuns.map((run) => {
            const isExpanded = expandedRunId === run.id;
            const tasks = runTasks[run.id] || [];

            return (
              <div
                key={run.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden hover:border-zinc-700 transition-all"
              >
                {/* Summary Row */}
                <div
                  onClick={() => toggleRunDetails(run.id)}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-zinc-900/80 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button className="text-zinc-400 mt-1">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-zinc-100 text-sm truncate">{run.goal}</span>
                        {getStatusBadge(run.status)}
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-zinc-500 font-mono mt-1">
                        <span>ID: {run.id.slice(0, 18)}...</span>
                        <span>•</span>
                        <span>Created: {new Date(run.createdAt).toLocaleString()}</span>
                        {run.completedAt && (
                          <>
                            <span>•</span>
                            <span>Finished: {new Date(run.completedAt).toLocaleTimeString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDownloadDeliverable(run)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                      title="Download Markdown Deliverable"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download .md
                    </button>
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="p-5 border-t border-zinc-800/80 bg-zinc-950/60 space-y-4">
                    {/* Error Banner if Failed */}
                    {run.error && (
                      <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/80 text-xs text-red-300 font-mono flex items-start gap-2">
                        <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Run Execution Error:</strong> {run.error}
                        </div>
                      </div>
                    )}

                    {/* Consolidated Output Deliverable */}
                    {run.finalOutput && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            Consolidated Deliverable
                          </h4>
                        </div>
                        <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 text-xs text-zinc-200 leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap font-sans">
                          {run.finalOutput}
                        </div>
                      </div>
                    )}

                    {/* Tasks Breakdown */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Subtasks Breakdown ({tasks.length})
                      </h4>
                      {fetchingTasks === run.id ? (
                        <div className="p-4 text-center text-xs text-zinc-500 animate-pulse font-mono">
                          Loading task details...
                        </div>
                      ) : tasks.length === 0 ? (
                        <div className="p-4 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                          No subtasks registered for this run.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {tasks.map((task) => (
                            <div
                              key={task.id}
                              className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800/80 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-zinc-200">{task.title}</span>
                                  {getStatusBadge(task.status)}
                                </div>
                                <span className="text-[11px] font-mono text-zinc-500">
                                  Agent: <strong className="text-zinc-400">{task.assignedAgentId || "N/A"}</strong>
                                  {" | "}Retries: {task.retries}/{task.maxRetries}
                                </span>
                              </div>

                              {task.output && (
                                <div className="p-2 bg-zinc-950 rounded border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                                  {task.output}
                                </div>
                              )}

                              {task.error && (
                                <div className="p-2 bg-red-950/40 rounded border border-red-900/50 text-[11px] font-mono text-red-300">
                                  {task.error}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
