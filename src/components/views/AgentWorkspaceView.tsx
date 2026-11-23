"use client";

import { useApp } from "../OpenCrewBotApp";
import { BotAvatar, Button } from "../ui";
import { MessageSquare, Plus, Shield, Cpu, Sparkles } from "lucide-react";
import type { Bot } from "@/lib/shared/types";

interface AgentWorkspaceViewProps {
  onOpenCreateAgent: () => void;
  onOpenBotChat: (botId: string) => void;
}

export function AgentWorkspaceView({ onOpenCreateAgent, onOpenBotChat }: AgentWorkspaceViewProps) {
  const { state } = useApp();
  const bots = state.bots || [];

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-app p-6 md:p-8">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Agent Workspace</h1>
          <p className="mt-1 text-sm text-mute">
            Explore and coordinate all {bots.length} specialized and dynamic autonomous agents.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={onOpenCreateAgent} className="gap-2">
            <Plus size={16} />
            Create Agent
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {bots.map((bot) => (
          <AgentCard key={bot.id} bot={bot} onChat={() => onOpenBotChat(bot.id)} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ bot, onChat }: { bot: Bot; onChat: () => void }) {
  const permissionLevel = bot.permissionLevel || (bot.approval === "full" ? "FULL_ACCESS" : "ASK_FIRST");
  const role = bot.role || bot.title || "Agent";
  const skills = bot.skills || [];

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-line bg-raised p-5 shadow-sm transition-all hover:border-line-strong hover:shadow-md">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <BotAvatar bot={bot} size={48} />
            <div>
              <h2 className="text-base font-semibold text-ink">{bot.name}</h2>
              <p className="text-xs font-medium text-accent">@{bot.handle}</p>
            </div>
          </div>
          {bot.isDynamic && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
              <Sparkles size={11} />
              Dynamic
            </span>
          )}
        </div>

        <div className="mt-3.5">
          <span className="inline-block rounded-md bg-raised-2 px-2.5 py-1 text-xs font-medium text-ink">
            {role}
          </span>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-mute">
            {bot.description || bot.instructions.slice(0, 100)}
          </p>
        </div>

        <div className="mt-4 space-y-2 border-t border-line/60 pt-3 text-[12px]">
          <div className="flex items-center justify-between text-mute">
            <span className="flex items-center gap-1.5 text-faint">
              <Shield size={13} />
              Permission:
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                permissionLevel === "FULL_ACCESS"
                  ? "bg-ok/15 text-ok"
                  : permissionLevel === "CONTROLLED_ACCESS"
                    ? "bg-sky-500/15 text-sky-400"
                    : "bg-warn/15 text-warn"
              }`}
            >
              {permissionLevel}
            </span>
          </div>

          <div className="flex items-center justify-between text-mute">
            <span className="flex items-center gap-1.5 text-faint">
              <Cpu size={13} />
              Model:
            </span>
            <span className="truncate font-mono text-[11px] text-ink" title={bot.model}>
              {bot.primaryModel || bot.model.split("/").pop()}
            </span>
          </div>
        </div>

        {skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {skills.slice(0, 3).map((skill) => (
              <span
                key={skill}
                className="rounded-md bg-raised-2 px-2 py-0.5 text-[10.5px] text-mute"
              >
                #{skill}
              </span>
            ))}
            {skills.length > 3 && (
              <span className="px-1 text-[10.5px] text-faint">+{skills.length - 3}</span>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-line/60 pt-3">
        <Button variant="secondary" size="sm" onClick={onChat} className="w-full justify-center gap-2">
          <MessageSquare size={14} />
          Start Chat
        </Button>
      </div>
    </div>
  );
}
