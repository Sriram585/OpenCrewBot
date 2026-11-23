"use client";

import { useEffect, useState } from "react";
import { useApp } from "../OpenCrewBotApp";
import { Button } from "../ui";
import { FileText, Save, Plus, Clock, HardDrive, RefreshCw } from "lucide-react";
import type { MemoryFileInfo, MemoryScope } from "@/lib/server/memory";

const SCOPES: Array<MemoryScope | "all"> = ["all", "agent", "room", "project", "user", "decisions", "tasks"];

export function MemoryManagerView() {
  const { toast } = useApp();
  const [selectedScope, setSelectedScope] = useState<MemoryScope | "all">("all");
  const [files, setFiles] = useState<MemoryFileInfo[]>([]);
  const [activeFile, setActiveFile] = useState<MemoryFileInfo | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Append entry form state
  const [newContent, setNewContent] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newSource, setNewSource] = useState("user");
  const [appending, setAppending] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memory");
      const data = (await res.json()) as { files: MemoryFileInfo[] };
      setFiles(data.files || []);
      if (!activeFile && data.files?.length > 0) {
        loadFile(data.files[0]);
      }
    } catch {
      toast("Failed to load memory files.");
    } finally {
      setLoading(false);
    }
  };

  const loadFile = async (file: MemoryFileInfo) => {
    setActiveFile(file);
    try {
      const res = await fetch(`/api/memory/file?scope=${file.scope}&id=${file.id}`);
      const data = (await res.json()) as { content: string };
      setFileContent(data.content || "");
    } catch {
      toast(`Failed to load ${file.path}`);
    }
  };

  const saveFile = async () => {
    if (!activeFile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/memory/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: activeFile.scope,
          id: activeFile.id,
          content: fileContent,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast(`Saved ${activeFile.path} with automatic secret redaction.`);
      void fetchFiles();
    } catch {
      toast("Error saving memory file.");
    } finally {
      setSaving(false);
    }
  };

  const handleAppendEntry = async () => {
    if (!activeFile || !newContent.trim()) return;
    setAppending(true);
    try {
      const res = await fetch("/api/memory/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: activeFile.scope,
          id: activeFile.id,
          content: newContent.trim(),
          reason: newReason.trim() || undefined,
          source: newSource.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Append failed");
      setNewContent("");
      setNewReason("");
      toast("Appended provenance-tagged memory entry.");
      void loadFile(activeFile);
    } catch {
      toast("Failed to append memory entry.");
    } finally {
      setAppending(false);
    }
  };

  useEffect(() => {
    void fetchFiles();
  }, []);

  const filteredFiles = files.filter((f) => selectedScope === "all" || f.scope === selectedScope);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-app">
      {/* Top Header */}
      <div className="border-b border-line px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">Scoped Memory Manager</h1>
            <p className="text-xs text-mute">
              Persistent human-readable Markdown storage with zero stale RAM caching and mandatory provenance tracking.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchFiles} className="gap-1.5 text-xs">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Sync Disk
          </Button>
        </div>

        {/* Scope Filter Tabs */}
        <div className="mt-3 flex gap-1 overflow-x-auto">
          {SCOPES.map((scope) => (
            <button
              key={scope}
              onClick={() => setSelectedScope(scope)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                selectedScope === scope
                  ? "bg-accent text-accent-ink font-semibold"
                  : "bg-raised text-mute hover:bg-hover hover:text-ink"
              }`}
            >
              {scope}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left File List */}
        <div className="w-72 shrink-0 border-r border-line bg-raised overflow-y-auto p-3">
          <p className="px-2 py-1 text-[11px] font-semibold text-faint uppercase tracking-wider">
            Memory Files ({filteredFiles.length})
          </p>
          <div className="mt-1 space-y-1">
            {filteredFiles.map((file) => {
              const isActive = activeFile?.path === file.path;
              return (
                <button
                  key={file.path}
                  onClick={() => loadFile(file)}
                  className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors ${
                    isActive ? "bg-active text-ink border border-line-strong" : "hover:bg-hover text-mute"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-ink truncate">{file.id}.md</span>
                    <span className="rounded bg-raised-2 px-1.5 py-0.5 text-[9.5px] font-medium uppercase text-faint">
                      {file.scope}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10.5px] text-faint">
                    <span className="flex items-center gap-1">
                      <HardDrive size={10} />
                      {file.size} B
                    </span>
                    <span className="flex items-center gap-1 truncate">
                      <Clock size={10} />
                      {new Date(file.lastModified).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Editor & Append Area */}
        <div className="flex flex-1 flex-col overflow-hidden bg-app">
          {activeFile ? (
            <div className="flex h-full flex-col overflow-y-auto p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-accent" />
                  <span className="font-mono text-sm font-semibold text-ink">{activeFile.path}</span>
                </div>
                <Button variant="primary" size="sm" onClick={saveFile} disabled={saving} className="gap-1.5 text-xs">
                  <Save size={13} />
                  {saving ? "Saving..." : "Save to Disk"}
                </Button>
              </div>

              {/* Raw Markdown Editor */}
              <div className="mt-3 flex-1">
                <textarea
                  rows={14}
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="w-full rounded-xl border border-line bg-raised-2 p-3 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Append Provenance Entry Form */}
              <div className="mt-4 rounded-xl border border-line bg-raised p-4">
                <h3 className="text-xs font-semibold text-ink">Append Provenance Entry</h3>
                <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <input
                    type="text"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Content / Fact (e.g. Target CAC is $45)"
                    className="sm:col-span-2 rounded-lg border border-line bg-raised-2 px-3 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    placeholder="Reason (e.g. Q3 Budget Decision)"
                    className="rounded-lg border border-line bg-raised-2 px-3 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-[11px] text-faint">
                    Auto-formats: <code className="text-mute">- [TIMESTAMP] | Source: user | Reason: ... | Content: ...</code>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={appending || !newContent.trim()}
                    onClick={handleAppendEntry}
                    className="gap-1.5 text-xs"
                  >
                    <Plus size={13} />
                    {appending ? "Appending..." : "Append Entry"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-mute text-sm">
              Select a memory file on the left to inspect and edit.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
