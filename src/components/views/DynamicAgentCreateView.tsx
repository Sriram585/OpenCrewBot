"use client";

import { useState } from "react";
import { useApp } from "../OpenCrewBotApp";
import { Button } from "../ui";
import { Sparkles, ArrowRight, Shield, Cpu, Wrench, CheckCircle, FileText } from "lucide-react";
import type { Bot } from "@/lib/shared/types";

export function DynamicAgentCreateView({ onOpenBotChat }: { onOpenBotChat: (botId: string) => void }) {
  const { refresh, toast } = useApp();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<Bot | null>(null);

  const examplePrompts = [
    "Create an autonomous SEO Specialist agent to audit web pages, crawl competitor domains, and extract organic keywords.",
    "Create a Security Auditor agent with code mode to review pull requests, detect OWASP vulnerabilities, and verify secrets.",
    "Create a Growth Marketing Analyst agent to analyze funnel conversion rates, compute customer acquisition cost, and draft email sequences.",
  ];

  const handleCreate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setCreatedAgent(null);

    try {
      const res = await fetch("/api/agents/create-from-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = (await res.json()) as { ok: boolean; agent?: Bot; error?: string };
      if (!res.ok || !data.ok || !data.agent) {
        throw new Error(data.error || "Failed to create agent");
      }

      setCreatedAgent(data.agent);
      await refresh();
      toast(`Created @${data.agent.handle} successfully!`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Error creating agent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-app p-6 md:p-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles size={13} />
            Module B: Natural Language Agent Factory
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Dynamic Agent Creation
          </h1>
          <p className="mt-1 text-sm text-mute">
            Describe the role and responsibilities you need. The agent factory synthesizes a validated specification, initializes scoped Markdown memory, and configures permissions automatically.
          </p>
        </div>

        {/* Input Card */}
        <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
          <label htmlFor="agent-prompt" className="block text-sm font-semibold text-ink">
            What kind of agent do you need?
          </label>
          <textarea
            id="agent-prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Create a Technical SEO Specialist agent to audit web pages, crawl competitor domains, and extract organic keywords..."
            className="mt-2.5 w-full rounded-xl border border-line bg-raised-2 p-3.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-faint">Suggestions:</span>
            {examplePrompts.map((example, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPrompt(example)}
                className="rounded-lg bg-raised-2 px-2.5 py-1 text-[11.5px] text-mute hover:bg-hover hover:text-ink"
              >
                {example.slice(10, 38)}...
              </button>
            ))}
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              variant="primary"
              disabled={loading || !prompt.trim()}
              onClick={handleCreate}
              className="gap-2"
            >
              {loading ? (
                <>
                  <Sparkles size={15} className="animate-spin" />
                  Synthesizing Agent...
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Generate Agent
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Generated Specification Card */}
        {createdAgent && (
          <div className="mt-6 rounded-2xl border border-ok/30 bg-ok/5 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-ok">
              <CheckCircle size={18} />
              <h2 className="text-base font-semibold">Agent Initialized & Immediately Ready</h2>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-line bg-raised p-5 sm:grid-cols-2">
              <div>
                <p className="text-xs text-faint">Name & Handle</p>
                <p className="font-semibold text-ink">
                  {createdAgent.name} <span className="text-xs font-normal text-accent">(@{createdAgent.handle})</span>
                </p>

                <p className="mt-3 text-xs text-faint">Role Title</p>
                <p className="text-sm font-medium text-ink">{createdAgent.role || createdAgent.title}</p>

                <p className="mt-3 text-xs text-faint">Permission Level</p>
                <span className="inline-block mt-0.5 rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok">
                  {createdAgent.permissionLevel || "CONTROLLED_ACCESS"}
                </span>
              </div>

              <div>
                <p className="text-xs text-faint">Model Configuration</p>
                <p className="font-mono text-xs text-ink">{createdAgent.primaryModel || createdAgent.model}</p>

                <p className="mt-3 text-xs text-faint">Assigned Skills</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(createdAgent.skills || []).map((s) => (
                    <span key={s} className="rounded bg-raised-2 px-1.5 py-0.5 text-[11px] text-mute">
                      #{s}
                    </span>
                  ))}
                </div>

                <p className="mt-3 text-xs text-faint">Memory File Initialized</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
                  <FileText size={12} />
                  <code className="font-mono text-[11px] text-mute">data/memory/agents/{createdAgent.id}.md</code>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-3">
              <Button
                variant="primary"
                onClick={() => onOpenBotChat(createdAgent.id)}
                className="gap-2"
              >
                Start Chat with @{createdAgent.handle}
                <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
