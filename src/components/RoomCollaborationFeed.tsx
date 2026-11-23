"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, AlertOctagon, RefreshCw, Send, ShieldAlert, ArrowRight, CornerDownRight } from "lucide-react";

interface CollaborationMessage {
  id: string;
  roomId: string;
  runId: string | null;
  fromAgentId: string;
  toAgentId: string | null;
  messageType: "DELEGATE" | "QUESTION" | "SHARE" | "CHALLENGE" | "VERIFY" | "RESULT" | "INTERRUPT";
  content: string;
  payloadJson: string | null;
  turnNumber: number;
  createdAt: string;
}

export function RoomCollaborationFeed({
  roomId,
  onClose,
}: {
  roomId: string;
  onClose?: () => void;
}) {
  const [messages, setMessages] = useState<CollaborationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [interruptRunId, setInterruptRunId] = useState("");
  const [interruptInstruction, setInterruptInstruction] = useState("");
  const [interrupting, setInterrupting] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const fetchFeed = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/rooms/${roomId}/collaboration?limit=50`);
      if (!res.ok) throw new Error("Failed to load collaboration feed");
      const data = await res.json();
      const list = data.messages || [];
      setMessages(list);

      // Auto-populate latest runId if available and not set
      if (!interruptRunId && list.length > 0) {
        const lastWithRun = list.find((m: CollaborationMessage) => m.runId);
        if (lastWithRun?.runId) {
          setInterruptRunId(lastWithRun.runId);
        }
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [roomId, interruptRunId]);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 6000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  const handleInterrupt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interruptRunId.trim() || !interruptInstruction.trim()) return;

    try {
      setInterrupting(true);
      const res = await fetch(`/api/rooms/${roomId}/interrupt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: interruptRunId.trim(),
          instruction: interruptInstruction.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to interrupt run");
      }

      setAlertMsg({ text: "Run interrupted! Chief of Staff is dynamically re-planning the DAG." });
      setInterruptInstruction("");
      await fetchFeed();
    } catch (err: unknown) {
      setAlertMsg({ text: err instanceof Error ? err.message : "Interruption failed", error: true });
    } finally {
      setInterrupting(false);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "DELEGATE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">DELEGATE</span>;
      case "QUESTION":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">QUESTION</span>;
      case "CHALLENGE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">CHALLENGE</span>;
      case "VERIFY":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">VERIFY</span>;
      case "RESULT":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">RESULT</span>;
      case "INTERRUPT":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">INTERRUPT</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">{type}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800 text-zinc-100 w-full max-w-md">
      {/* Panel Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Collaboration Feed</h2>
          <span className="text-[11px] font-mono text-zinc-500">({messages.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchFeed}
            disabled={loading}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            title="Refresh feed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {alertMsg && (
        <div
          className={`p-2.5 mx-3 mt-3 rounded text-xs flex items-center justify-between ${
            alertMsg.error
              ? "bg-red-950/60 border border-red-800 text-red-300"
              : "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
          }`}
        >
          <span>{alertMsg.text}</span>
          <button onClick={() => setAlertMsg(null)} className="text-[10px] hover:underline">
            ✕
          </button>
        </div>
      )}

      {/* Interrupt & Re-Plan Form */}
      <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/30 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 uppercase tracking-wider">
          <AlertOctagon className="w-3.5 h-3.5" />
          Interrupt & Mid-Run Re-plan
        </div>
        <form onSubmit={handleInterrupt} className="space-y-2">
          <input
            type="text"
            placeholder="Active Run ID (e.g. run-abc-123)"
            value={interruptRunId}
            onChange={(e) => setInterruptRunId(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-mono rounded bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-red-500/50"
            required
          />
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Directive: e.g. 'Focus only on European competitors'"
              value={interruptInstruction}
              onChange={(e) => setInterruptInstruction(e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-red-500/50"
              required
            />
            <button
              type="submit"
              disabled={interrupting}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50 shrink-0 flex items-center gap-1"
            >
              <Send className="w-3 h-3" />
              {interrupting ? "..." : "Interrupt"}
            </button>
          </div>
        </form>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-zinc-800 rounded-lg text-zinc-500 text-xs">
            No inter-agent collaboration messages logged for this room yet. When agents debate, delegate, or verify tasks, their structured collaboration messages appear here.
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/50 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {getTypeBadge(msg.messageType)}
                  <span className="font-semibold text-zinc-300 font-mono text-[11px] truncate max-w-[100px]">
                    {msg.fromAgentId}
                  </span>
                  {msg.toAgentId && (
                    <>
                      <ArrowRight className="w-3 h-3 text-zinc-500" />
                      <span className="font-semibold text-zinc-400 font-mono text-[11px] truncate max-w-[100px]">
                        {msg.toAgentId}
                      </span>
                    </>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </span>
              </div>

              <p className="text-zinc-200 leading-relaxed font-sans">{msg.content}</p>

              {msg.payloadJson && (
                <div className="p-2 bg-zinc-950 rounded border border-zinc-800 text-[10px] font-mono text-zinc-400 overflow-x-auto max-h-24">
                  {msg.payloadJson}
                </div>
              )}

              {msg.runId && (
                <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                  <CornerDownRight className="w-2.5 h-2.5" />
                  Run: {msg.runId.slice(0, 16)}...
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
