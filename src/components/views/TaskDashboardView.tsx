"use client";

import { useEffect, useState } from "react";
import { useApp } from "../OpenCrewBotApp";
import { Button } from "../ui";
import {
  Play,
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  StopCircle,
  BarChart3,
  TrendingDown,
  Layers,
  Sparkles,
} from "lucide-react";
import type { Run, Task } from "@/lib/shared/types";

export function TaskDashboardView() {
  const { state, toast } = useApp();
  const rooms = state.rooms || [];

  const [goal, setGoal] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [launching, setLaunching] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [polling, setPolling] = useState(false);

  const sampleGoals = [
    "Develop Q3 Go-To-Market Strategy with competitor benchmarking and pricing metrics",
    "Analyze conversion rate dropoff from CSV metrics and synthesize funnel optimization playbook",
    "Review technical architecture and security audit for the API gateway",
  ];

  const handleLaunch = async () => {
    if (!goal.trim()) return;
    setLaunching(true);
    setActiveRun(null);
    setTasks([]);

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim(),
          roomId: selectedRoomId || undefined,
        }),
      });

      const data = (await res.json()) as { ok: boolean; run: Run; tasks: Task[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to orchestrate goal");

      setActiveRun(data.run);
      setTasks(data.tasks || []);
      toast(`Run initiated with ${data.tasks?.length || 0} tasks!`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Error initiating run");
    } finally {
      setLaunching(false);
    }
  };

  const handleCancel = async () => {
    if (!activeRun) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/runs/${activeRun.id}/cancel`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; run: Run };
      if (data.ok) {
        setActiveRun(data.run);
        toast("Run was cancelled.");
        void refreshRun(activeRun.id);
      }
    } catch {
      toast("Failed to cancel run.");
    } finally {
      setCancelling(false);
    }
  };

  const refreshRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const data = (await res.json()) as { run: Run; tasks: Task[] };
      if (data.run) {
        setActiveRun(data.run);
        setTasks(data.tasks || []);
      }
    } catch {
      // ignore transient poll error
    }
  };

  // Poll active run if running
  useEffect(() => {
    if (!activeRun || activeRun.status === "COMPLETED" || activeRun.status === "FAILED" || activeRun.status === "CANCELLED") {
      return;
    }
    const interval = setInterval(() => {
      void refreshRun(activeRun.id);
    }, 2000);
    return () => clearInterval(interval);
  }, [activeRun?.id, activeRun?.status]);

  // Extract chart data if present in task outputs or finalOutput
  const extractedCharts = extractChartsFromOutputs(tasks, activeRun?.finalOutput);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-app p-6 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
          <Sparkles size={13} />
          Module A & D: Autonomous Task Execution Engine
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Task Execution Dashboard
        </h1>
        <p className="mt-1 text-sm text-mute">
          Decompose high-level strategic goals into parallel DAG workflows, monitor real-time execution progress, and inspect synthesized business deliverables.
        </p>
      </div>

      {/* Goal Launch Card */}
      <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
        <label htmlFor="goal-input" className="block text-sm font-semibold text-ink">
          Define High-Level Business Objective
        </label>
        <div className="mt-2.5 flex flex-col gap-3 sm:flex-row">
          <input
            id="goal-input"
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Develop Q3 Go-To-Market Strategy with competitor benchmarking and pricing metrics..."
            className="flex-1 rounded-xl border border-line bg-raised-2 px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <select
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="rounded-xl border border-line bg-raised-2 px-3 py-2 text-xs font-medium text-ink focus:border-accent focus:outline-none"
          >
            <option value="">No Room (Global Orchestrator)</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            disabled={launching || !goal.trim()}
            onClick={handleLaunch}
            className="gap-2 shrink-0"
          >
            <Play size={15} />
            {launching ? "Orchestrating..." : "Launch DAG Run"}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-faint">Sample Goals:</span>
          {sampleGoals.map((g, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setGoal(g)}
              className="rounded-lg bg-raised-2 px-2.5 py-1 text-[11.5px] text-mute hover:bg-hover hover:text-ink"
            >
              {g.slice(0, 36)}...
            </button>
          ))}
        </div>
      </div>

      {/* Live Run DAG Overview */}
      {activeRun && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-raised p-6 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-faint">{activeRun.id}</span>
                <StatusBadge status={activeRun.status} />
              </div>
              <h2 className="mt-1.5 text-lg font-bold text-ink">{activeRun.goal}</h2>
              <div className="mt-1 flex items-center gap-4 text-xs text-mute">
                <span>Created: {new Date(activeRun.createdAt).toLocaleTimeString()}</span>
                {activeRun.completedAt && (
                  <span>Completed: {new Date(activeRun.completedAt).toLocaleTimeString()}</span>
                )}
              </div>
            </div>

            {activeRun.status === "RUNNING" && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
                className="gap-1.5 self-start sm:self-auto"
              >
                <StopCircle size={15} />
                {cancelling ? "Cancelling..." : "Cancel Run"}
              </Button>
            )}
          </div>

          {/* Tasks DAG Table */}
          <div className="rounded-2xl border border-line bg-raised overflow-hidden shadow-sm">
            <div className="border-b border-line px-6 py-4">
              <h3 className="text-sm font-semibold text-ink">
                DAG Task Execution Plan ({tasks.length} tasks)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-raised-2 text-[11px] font-semibold text-faint uppercase">
                  <tr>
                    <th className="px-6 py-3">Task ID & Title</th>
                    <th className="px-4 py-3">Assigned Agent</th>
                    <th className="px-4 py-3">Dependencies</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Retries</th>
                    <th className="px-4 py-3">Timings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {tasks.map((task) => (
                    <tr key={task.id} className="hover:bg-hover/40 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-ink">{task.title}</div>
                        <div className="font-mono text-[10.5px] text-faint">{task.id}</div>
                      </td>
                      <td className="px-4 py-3.5 text-mute font-medium">
                        {task.assignedAgentId?.replace("agent-", "") || "Unassigned"}
                      </td>
                      <td className="px-4 py-3.5">
                        {task.dependencies?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {task.dependencies.map((d) => (
                              <span key={d} className="rounded bg-raised-2 px-1.5 py-0.5 text-[10px] font-mono text-mute">
                                {d.split("-").pop()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-faint">None (Parallel)</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="px-4 py-3.5 font-mono text-mute">
                        {task.retries} / {task.maxRetries}
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-faint">
                        {task.startedAt ? new Date(task.startedAt).toLocaleTimeString() : "—"}
                        {task.completedAt ? ` → ${new Date(task.completedAt).toLocaleTimeString()}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visual SVG Analytics Charts (if analyze_csv was executed) */}
          {extractedCharts && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Bar Chart */}
              {extractedCharts.barChart && extractedCharts.barChart.length > 0 && (
                <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 size={17} className="text-accent" />
                    <h3 className="text-sm font-semibold text-ink">Segment Revenue Share</h3>
                  </div>
                  <div className="space-y-3">
                    {extractedCharts.barChart.map((item, idx) => {
                      const maxVal = Math.max(...extractedCharts.barChart!.map((b) => b.value), 1);
                      const pct = Math.round((item.value / maxVal) * 100);
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-ink">{item.label}</span>
                            <span className="text-mute font-mono">${item.value.toLocaleString()}</span>
                          </div>
                          <div className="h-3 w-full rounded-full bg-raised-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-accent transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Funnel Dropoff Chart */}
              {extractedCharts.funnelChart && extractedCharts.funnelChart.length > 0 && (
                <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingDown size={17} className="text-warn" />
                    <h3 className="text-sm font-semibold text-ink">Funnel Stage Conversion & Drop-off</h3>
                  </div>
                  <div className="space-y-2">
                    {extractedCharts.funnelChart.map((stage, idx) => {
                      const firstVal = extractedCharts.funnelChart![0]?.value || 1;
                      const widthPct = Math.max(15, Math.round((stage.value / firstVal) * 100));
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="w-24 text-right text-xs text-mute truncate">{stage.step}</span>
                          <div className="flex-1">
                            <div
                              className="flex items-center justify-between rounded-lg bg-sky-500/20 border border-sky-500/40 px-3 py-1.5 text-xs text-sky-200"
                              style={{ width: `${widthPct}%` }}
                            >
                              <span className="font-semibold">{stage.value}</span>
                              <span className="text-[10px] opacity-80">{widthPct}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Consolidated Executive Deliverable */}
          {activeRun.finalOutput && (
            <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
              <h3 className="text-base font-bold text-ink mb-3">Consolidated Executive Deliverable</h3>
              <div className="rounded-xl border border-line/60 bg-raised-2 p-5 font-mono text-xs text-ink leading-relaxed whitespace-pre-wrap">
                {activeRun.finalOutput}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: "bg-ok/15 text-ok border-ok/30",
    RUNNING: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    WAITING_APPROVAL: "bg-warn/15 text-warn border-warn/30",
    PENDING: "bg-raised-2 text-mute border-line",
    FAILED: "bg-danger/15 text-danger border-danger/30",
    CANCELLED: "bg-faint/20 text-faint border-line",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase ${
        styles[status] || styles.PENDING
      }`}
    >
      {status}
    </span>
  );
}

function extractChartsFromOutputs(tasks: Task[], finalOutput?: string | null) {
  for (const t of tasks) {
    if (t.output && t.output.includes('"chartData"')) {
      try {
        const jsonMatch = t.output.match(/\{[\s\S]*"chartData"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { chartData?: { barChart?: any[]; funnelChart?: any[] } };
          if (parsed.chartData) return parsed.chartData;
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}
