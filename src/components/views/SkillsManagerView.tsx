"use client";

import { useEffect, useState } from "react";
import { useApp } from "../OpenCrewBotApp";
import { Button } from "../ui";
import { Wrench, BookOpen, Save, RefreshCw, Layers, Check } from "lucide-react";
import type { Skill } from "@/lib/server/skills";

export function SkillsManagerView() {
  const { toast } = useApp();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    void fetchSkills();
  }, []);

  const toolsCatalog = [
    { name: "analyze_csv", category: "Deterministic Business", description: "Pure TypeScript math for exact totals, revenue shares, and funnel drop-off bottleneck analysis." },
    { name: "web_fetch_research", category: "Live Web", description: "Live HTTP web text extractor with timeout enforcement and explicit error reporting." },
    { name: "web_search", category: "Search", description: "Tavily web search and citation extractor." },
    { name: "read_page", category: "Content", description: "Full web page extractor." },
    { name: "execute_typescript", category: "Code Mode", description: "Isolated QuickJS WebAssembly code isolate for multi-tool parallel logic." },
    { name: "github_repo_overview", category: "Integrations", description: "Live GitHub REST API repository inspector." },
    { name: "github_create_issue", category: "Integrations (Gated)", description: "Gated issue creator requiring PermissionGuard approval." },
    { name: "slack_post_message", category: "Integrations (Gated)", description: "Gated Slack webhook/bot dispatcher." },
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-app">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Skills & Tools Ecosystem</h1>
          <p className="text-xs text-mute">
            Dynamic Markdown skill playbooks injected into agent prompts based on task trigger matching.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchSkills} className="gap-1.5 text-xs">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Skills & Tools List */}
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

          <div className="mt-6 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint border-t border-line pt-4">
            <Wrench size={12} />
            Available Tools Catalog ({toolsCatalog.length})
          </div>
          <div className="mt-2 space-y-2">
            {toolsCatalog.map((tool) => (
              <div key={tool.name} className="rounded-xl border border-line/60 bg-raised-2 p-2.5">
                <div className="flex items-center justify-between">
                  <code className="text-[11px] font-semibold text-accent">{tool.name}</code>
                  <span className="text-[9.5px] text-faint">{tool.category}</span>
                </div>
                <p className="mt-1 text-[11px] text-mute">{tool.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Playbook Markdown Editor */}
        <div className="flex flex-1 flex-col overflow-y-auto p-6 bg-app">
          {selectedSkill ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div>
                  <h2 className="text-base font-bold text-ink">{selectedSkill.name} Playbook</h2>
                  <p className="text-xs text-mute">Stored in <code className="text-faint">{selectedSkill.path}</code></p>
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
    </div>
  );
}
