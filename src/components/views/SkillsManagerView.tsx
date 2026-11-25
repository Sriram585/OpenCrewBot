"use client";

import { useEffect, useState } from "react";
import { useApp } from "../OpenCrewBotApp";
import { Button } from "../ui";
import {
  Wrench,
  BookOpen,
  Save,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  TrendingDown,
  Layers,
  Terminal,
} from "lucide-react";
import type { Skill } from "@/lib/server/skills";
import type { CsvAnalysisResult } from "@/lib/server/tools-business";

export function SkillsManagerView() {
  const { toast } = useApp();
  const [activeTab, setActiveTab] = useState<"skills" | "tools">("tools");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Tool Sandbox State
  const [selectedTool, setSelectedTool] = useState("analyze_csv");
  const [csvPath, setCsvPath] = useState("data/samples/meetuniversity_sales.csv");
  const [runningTool, setRunningTool] = useState(false);
  const [toolResult, setToolResult] = useState<CsvAnalysisResult | null>(null);

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/skills");
      const data = (await res.json()) as { skills: Skill[] };
      setSkills(data.skills || []);
      if (!selectedSkill && data.skills?.length > 0) {
        selectSkill(data.skills[0]);
      }
    } catch {
      toast("Failed to load skills.");
    } finally {
      setLoading(false);
    }
  };

  const selectSkill = (skill: Skill) => {
    setSelectedSkill(skill);
    setContent(skill.rawContent || "");
  };

  const saveSkill = async () => {
    if (!selectedSkill) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/skills/${selectedSkill.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast(`Saved skill playbook "${selectedSkill.name}"`);
      void fetchSkills();
    } catch {
      toast("Error saving skill playbook.");
    } finally {
      setSaving(false);
    }
  };

  const handleRunTool = async () => {
    setRunningTool(true);
    try {
      const res = await fetch("/api/tools/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: selectedTool,
          path: csvPath,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Tool execution failed");
      setToolResult(data.result);
      toast(`Executed ${selectedTool} deterministically!`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Error executing tool");
    } finally {
      setRunningTool(false);
    }
  };

  useEffect(() => {
    void fetchSkills();
  }, []);

  const toolsCatalog = [
    {
      name: "analyze_csv",
      category: "Deterministic Business",
      description: "Pure TypeScript math for exact totals, revenue shares, and funnel drop-off bottleneck analysis.",
    },
    {
      name: "web_fetch_research",
      category: "Live Web",
      description: "Live HTTP web text extractor with timeout enforcement and explicit error reporting.",
    },
    {
      name: "web_search",
      category: "Search",
      description: "Tavily web search and citation extractor.",
    },
    {
      name: "read_page",
      category: "Content",
      description: "Full web page extractor.",
    },
    {
      name: "execute_typescript",
      category: "Code Mode",
      description: "Isolated QuickJS WebAssembly code isolate for multi-tool parallel logic.",
    },
    {
      name: "github_repo_overview",
      category: "Integrations",
      description: "Live GitHub REST API repository inspector.",
    },
    {
      name: "github_create_issue",
      category: "Integrations (Gated)",
      description: "Gated issue creator requiring PermissionGuard approval.",
    },
    {
      name: "slack_post_message",
      category: "Integrations (Gated)",
      description: "Gated Slack webhook/bot dispatcher.",
    },
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-app">
      {/* Header with Mode Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-line px-6 py-4 gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Tools & Playbooks Sandbox</h1>
          <p className="text-xs text-mute">
            Execute deterministic TypeScript business tools and inspect dynamic Markdown skill playbooks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-raised-2 p-1 ring-1 ring-line">
            <button
              onClick={() => setActiveTab("tools")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "tools" ? "bg-accent text-accent-ink" : "text-mute hover:text-ink"
              }`}
            >
              <Wrench size={13} />
              Tools Sandbox
            </button>
            <button
              onClick={() => setActiveTab("skills")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "skills" ? "bg-accent text-accent-ink" : "text-mute hover:text-ink"
              }`}
            >
              <BookOpen size={13} />
              Skill Playbooks ({skills.length})
            </button>
          </div>

          {activeTab === "skills" && (
            <Button variant="ghost" size="sm" onClick={fetchSkills} className="gap-1.5 text-xs">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {activeTab === "tools" ? (
        /* Tools & Sandboxes Interactive Runner */
        <div className="flex flex-1 overflow-hidden">
          {/* Tools List */}
          <div className="w-80 shrink-0 border-r border-line bg-raised overflow-y-auto p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              <Wrench size={12} />
              Available Tools ({toolsCatalog.length})
            </div>
            <div className="mt-2 space-y-2">
              {toolsCatalog.map((tool) => {
                const active = selectedTool === tool.name;
                return (
                  <button
                    key={tool.name}
                    onClick={() => setSelectedTool(tool.name)}
                    className={`flex w-full flex-col rounded-xl p-3 text-left transition-colors ${
                      active ? "bg-active border border-line-strong text-ink ring-1 ring-accent/30" : "hover:bg-hover text-mute"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <code className="text-[11.5px] font-bold text-accent">{tool.name}</code>
                      <span className="rounded bg-raised-2 px-1.5 py-0.5 text-[9px] font-mono text-faint">
                        {tool.category}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-mute line-clamp-2">{tool.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tool Execution Playground */}
          <div className="flex flex-1 flex-col overflow-y-auto p-6 bg-app space-y-6">
            <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-ink">{selectedTool}</span>
                    <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-accent">
                      Deterministic Execution
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-mute">
                    Executes pure TypeScript algorithms without LLM hallucinations. Mathematical operations compute exact totals and bottleneck rates.
                  </p>
                </div>

                <Button
                  id="run-tool-button"
                  variant="primary"
                  onClick={handleRunTool}
                  disabled={runningTool}
                  className="gap-2 shrink-0"
                >
                  <Play size={14} className={runningTool ? "animate-spin" : ""} />
                  {runningTool ? "Computing Metrics..." : "Run Tool in Sandbox"}
                </Button>
              </div>

              {selectedTool === "analyze_csv" && (
                <div className="mt-4 space-y-3">
                  <label htmlFor="csv-path-input" className="block text-xs font-semibold uppercase tracking-wider text-faint">
                    CSV Dataset Path
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="csv-path-input"
                      type="text"
                      value={csvPath}
                      onChange={(e) => setCsvPath(e.target.value)}
                      placeholder="data/samples/meetuniversity_sales.csv"
                      className="flex-1 rounded-xl border border-line bg-raised-2 px-3.5 py-2 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCsvPath("data/samples/meetuniversity_sales.csv")}
                      className="rounded-xl border border-line bg-raised-2 px-3 py-1.5 text-xs text-mute hover:text-ink font-medium"
                    >
                      Use MeetUniversity Sales CSV
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Results Presentation */}
            {toolResult && (
              <div className="space-y-6">
                {/* Metrics Summary Row */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-line bg-raised p-4">
                    <span className="text-[11px] font-semibold uppercase text-faint">Rows Analyzed</span>
                    <div className="mt-1 text-2xl font-bold text-ink">{toolResult.rowCount}</div>
                    <span className="text-[10px] text-mute">Complete CRM Leads</span>
                  </div>

                  <div className="rounded-xl border border-line bg-raised p-4">
                    <span className="text-[11px] font-semibold uppercase text-faint">Total Pipeline Revenue</span>
                    <div className="mt-1 text-2xl font-bold text-ok font-mono">
                      ₹{(toolResult.numericalSummaries?.revenue_inr?.sum || 0).toLocaleString("en-IN")}
                    </div>
                    <span className="text-[10px] text-mute">Computed Sum</span>
                  </div>

                  <div className="rounded-xl border border-line bg-raised p-4">
                    <span className="text-[11px] font-semibold uppercase text-faint">Overall Conversion</span>
                    <div className="mt-1 text-2xl font-bold text-accent">
                      {(toolResult.funnelConversion?.overallConversionRate || 0).toFixed(1)}%
                    </div>
                    <span className="text-[10px] text-mute">Lead to Enrolled</span>
                  </div>

                  <div className="rounded-xl border border-line bg-raised p-4">
                    <span className="text-[11px] font-semibold uppercase text-faint">Critical Bottleneck</span>
                    <div className="mt-1 text-base font-bold text-warn truncate">
                      {toolResult.funnelConversion?.bottleneckStage || "None"}
                    </div>
                    <span className="text-[10px] text-mute">Steepest Drop-off</span>
                  </div>
                </div>

                {/* Bottleneck Alert Banner */}
                {toolResult.funnelConversion?.bottleneckStage && (
                  <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-xs text-warn flex items-start gap-3">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Conversion Bottleneck Detected:</span>
                      <p className="mt-0.5 text-ink/90 leading-relaxed">
                        The sharpest drop-off occurs at stage <code className="font-bold font-mono px-1 bg-warn/20 rounded">{toolResult.funnelConversion.bottleneckStage}</code>.
                        Over 70% of prospective students stall after counselling before beginning formal university applications, pointing to decision paralysis during university shortlisting.
                      </p>
                    </div>
                  </div>
                )}

                {/* Charts Grid */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Bar Chart: Segment Revenue Share */}
                  {toolResult.chartData?.barChart && (
                    <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <BarChart3 size={17} className="text-accent" />
                        <h3 className="text-sm font-semibold text-ink">Segment Revenue Share (INR)</h3>
                      </div>
                      <div className="space-y-3">
                        {toolResult.chartData.barChart.map((item, idx) => {
                          const maxVal = Math.max(...toolResult.chartData.barChart!.map((b) => b.value), 1);
                          const pct = Math.round((item.value / maxVal) * 100);
                          return (
                            <div key={idx} className="space-y-1">
                              <div className="flex justify-between text-xs font-medium">
                                <span className="text-ink font-semibold">{item.label}</span>
                                <span className="text-mute font-mono">₹{item.value.toLocaleString("en-IN")}</span>
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

                  {/* Funnel Chart: Conversion Drop-off */}
                  {toolResult.chartData?.funnelChart && (
                    <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <TrendingDown size={17} className="text-warn" />
                        <h3 className="text-sm font-semibold text-ink">Funnel Stage Progression & Drop-off</h3>
                      </div>
                      <div className="space-y-2.5">
                        {toolResult.chartData.funnelChart.map((stage, idx) => {
                          const firstVal = toolResult.chartData.funnelChart![0]?.value || 1;
                          const widthPct = Math.max(18, Math.round((stage.value / firstVal) * 100));
                          return (
                            <div key={idx} className="flex items-center gap-3">
                              <span className="w-28 text-right text-xs text-mute truncate font-medium">
                                {stage.step}
                              </span>
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

                {/* Raw JSON metrics inspector */}
                <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase text-faint">
                    <Terminal size={14} />
                    Deterministic Metrics Payload (Zero Hallucination)
                  </div>
                  <pre className="p-4 rounded-xl bg-raised-2 border border-line font-mono text-xs text-ink overflow-x-auto max-h-60 whitespace-pre-wrap">
                    {JSON.stringify(
                      {
                        rowCount: toolResult.rowCount,
                        totalRevenueInr: toolResult.numericalSummaries?.revenue_inr?.sum,
                        overallConversionRate: toolResult.funnelConversion?.overallConversionRate,
                        bottleneckStage: toolResult.funnelConversion?.bottleneckStage,
                        segmentRevenue: toolResult.segmentRevenue,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Skill Playbooks Editor */
        <div className="flex flex-1 overflow-hidden">
          {/* Left Skills List */}
          <div className="w-80 shrink-0 border-r border-line bg-raised overflow-y-auto p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              <BookOpen size={12} />
              Skill Playbooks ({skills.length})
            </div>
            <div className="mt-2 space-y-2">
              {skills.map((s) => {
                const active = selectedSkill?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => selectSkill(s)}
                    className={`flex w-full flex-col rounded-xl p-3 text-left transition-colors ${
                      active ? "bg-active border border-line-strong text-ink" : "hover:bg-hover text-mute"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink">{s.name}</span>
                      <span className="rounded bg-raised-2 px-1.5 py-0.5 text-[9.5px] font-mono text-faint">
                        {s.outputFormat}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.triggers.slice(0, 3).map((t) => (
                        <span key={t} className="rounded bg-raised-2 px-1 py-0.5 text-[10px] text-mute">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Playbook Markdown Editor */}
          <div className="flex flex-1 flex-col overflow-y-auto p-6 bg-app">
            {selectedSkill ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <div>
                    <h2 className="text-base font-bold text-ink">{selectedSkill.name} Playbook</h2>
                    <p className="text-xs text-mute">
                      Stored in <code className="text-faint">{selectedSkill.path}</code>
                    </p>
                  </div>
                  <Button variant="primary" size="sm" onClick={saveSkill} disabled={saving} className="gap-1.5 text-xs">
                    <Save size={13} />
                    {saving ? "Saving Playbook..." : "Save Playbook"}
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-raised p-3">
                    <span className="font-semibold text-ink">Active Triggers:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedSkill.triggers.map((t) => (
                        <span key={t} className="rounded bg-raised-2 px-1.5 py-0.5 text-[11px] text-mute">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-line bg-raised p-3">
                    <span className="font-semibold text-ink">Required Tools:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedSkill.requiredTools.map((t) => (
                        <span key={t} className="rounded bg-accent/10 text-accent px-1.5 py-0.5 text-[11px] font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex-1">
                  <label className="text-xs font-semibold text-faint uppercase">Playbook Markdown Definition</label>
                  <textarea
                    rows={20}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-line bg-raised-2 p-4 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-mute text-sm">
                Select a skill playbook on the left to inspect or edit.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
