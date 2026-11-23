"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Shield, Clock, RefreshCw, Eye, Ban } from "lucide-react";

interface ApprovalRequest {
  id: string;
  runId: string | null;
  taskId: string | null;
  agentId: string;
  toolName: string;
  argumentsSanitizedJson: string;
  riskLevel: "read_safe" | "external_write" | "sensitive";
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  decisionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface AuditLog {
  id: string;
  agentId: string;
  toolName: string;
  riskLevel: "read_safe" | "external_write" | "sensitive";
  approvalStatus: string;
  argumentsSanitizedJson: string;
  resultSummary: string | null;
  error: string | null;
  timestamp: string;
}

export function ApprovalCentreView() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "history" | "audit">("pending");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/approvals?limit=100");
      if (!res.ok) throw new Error("Failed to load approvals");
      const data = await res.json();
      setRequests(data.requests || []);
      setAuditLogs(data.recentAuditLogs || []);
    } catch (err: unknown) {
      console.error(err);
      setMessage({ text: err instanceof Error ? err.message : "Error loading data", error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 8000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  const handleApprove = async (id: string) => {
    try {
      setActionInProgress(id);
      const res = await fetch(`/api/approvals/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolvedBy: "Human Supervisor",
          note: decisionNotes[id] || "Approved via Approval Centre",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Approval failed");
      }
      setMessage({ text: `Request ${id} approved successfully.` });
      await fetchApprovals();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Approval action failed", error: true });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (id: string) => {
    try {
      setActionInProgress(id);
      const res = await fetch(`/api/approvals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolvedBy: "Human Supervisor",
          note: decisionNotes[id] || "Rejected by supervisor",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Rejection failed");
      }
      setMessage({ text: `Request ${id} rejected.` });
      await fetchApprovals();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Reject action failed", error: true });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      setActionInProgress(id);
      const res = await fetch(`/api/approvals/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolvedBy: "Human Supervisor",
          note: "Cancelled by supervisor",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Cancel failed");
      }
      setMessage({ text: `Request ${id} cancelled.` });
      await fetchApprovals();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Cancel action failed", error: true });
    } finally {
      setActionInProgress(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "PENDING");
  const historyRequests = requests.filter((r) => {
    if (statusFilter === "ALL") return r.status !== "PENDING";
    return r.status === statusFilter;
  });

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "sensitive":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-950/60 text-red-400 border border-red-800">Sensitive</span>;
      case "external_write":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-950/60 text-amber-400 border border-amber-800">External Write</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800">Read Safe</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">Pending Approval</span>;
      case "APPROVED":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Approved</span>;
      case "REJECTED":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30">Rejected</span>;
      case "CANCELLED":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-700/50 text-zinc-400 border border-zinc-600">Cancelled</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300">{status}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950 text-zinc-100 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Shield className="w-7 h-7 text-amber-400" />
            <h1 className="text-2xl font-bold tracking-tight">Human Approval & Governance Centre</h1>
            {pendingRequests.length > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500 text-zinc-950 animate-pulse">
                {pendingRequests.length} Waiting
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            PermissionGuard governance: verify sanitized action payloads, approve external writes, inspect live audit trails.
          </p>
        </div>

        <button
          onClick={fetchApprovals}
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
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "pending"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              : "text-zinc-400 hover:bg-zinc-900"
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Pending Approvals ({pendingRequests.length})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "history"
              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
              : "text-zinc-400 hover:bg-zinc-900"
          }`}
        >
          <Clock className="w-4 h-4 text-blue-400" />
          Decision History ({requests.length - pendingRequests.length})
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "audit"
              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
              : "text-zinc-400 hover:bg-zinc-900"
          }`}
        >
          <Shield className="w-4 h-4 text-purple-400" />
          Audit Log ({auditLogs.length})
        </button>
      </div>

      {/* Content */}
      <div className="mt-6 flex-1">
        {/* Pending Approvals Tab */}
        {activeTab === "pending" && (
          <div>
            {pendingRequests.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-80" />
                <h3 className="text-base font-semibold text-zinc-300">All Clear — No Pending Approvals</h3>
                <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">
                  When an agent operating under <code className="text-zinc-400">ASK_FIRST</code> or <code className="text-zinc-400">CONTROLLED_ACCESS</code> requests an external write or sensitive tool call, it will pause and appear here for human authorization.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-5 rounded-xl border border-amber-500/30 bg-zinc-900/60 shadow-lg space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold text-amber-300">{req.toolName}</span>
                        {getRiskBadge(req.riskLevel)}
                        {getStatusBadge(req.status)}
                      </div>
                      <div className="text-xs text-zinc-500 flex items-center gap-2 font-mono">
                        <span>Agent: <strong className="text-zinc-300">{req.agentId}</strong></span>
                        <span>•</span>
                        <span>{new Date(req.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    {req.runId && (
                      <div className="text-xs text-zinc-400 flex items-center gap-2">
                        <span className="font-semibold text-zinc-300">Task Context:</span>
                        <code className="text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded font-mono">
                          Run: {req.runId.slice(0, 16)}... | Task: {req.taskId || "N/A"}
                        </code>
                      </div>
                    )}

                    {/* Sanitized Payload Preview */}
                    <div>
                      <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                        <span>Sanitized Action Payload (Secrets Redacted):</span>
                        <span className="text-[11px] text-zinc-500 normal-case">Credential Guard Active</span>
                      </div>
                      <pre className="p-3 bg-zinc-950 rounded-lg text-xs font-mono text-emerald-300 border border-zinc-800/80 overflow-x-auto max-h-48 whitespace-pre-wrap">
                        {(() => {
                          try {
                            const parsed = JSON.parse(req.argumentsSanitizedJson);
                            return JSON.stringify(parsed, null, 2);
                          } catch {
                            return req.argumentsSanitizedJson;
                          }
                        })()}
                      </pre>
                    </div>

                    {/* Decision Note & Actions */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                      <input
                        type="text"
                        placeholder="Optional decision note (e.g., 'Approved for staging run')"
                        value={decisionNotes[req.id] || ""}
                        onChange={(e) => setDecisionNotes({ ...decisionNotes, [req.id]: e.target.value })}
                        className="flex-1 px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                      />

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleApprove(req.id)}
                          disabled={actionInProgress === req.id}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve & Execute
                        </button>
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={actionInProgress === req.id}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                        <button
                          onClick={() => handleCancel(req.id)}
                          disabled={actionInProgress === req.id}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
                          title="Cancel request"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Decision History Tab */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2">
              <span className="text-xs text-zinc-400">Filter status:</span>
              {["ALL", "APPROVED", "REJECTED", "CANCELLED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    statusFilter === st
                      ? "bg-zinc-800 text-white border border-zinc-700"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {historyRequests.length === 0 ? (
              <div className="p-8 text-center border border-zinc-800/80 rounded-xl bg-zinc-900/30 text-zinc-500 text-sm">
                No past approval decisions matching this filter.
              </div>
            ) : (
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase font-mono">
                    <tr>
                      <th className="p-3">Tool</th>
                      <th className="p-3">Agent</th>
                      <th className="p-3">Risk Level</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Resolved By / Note</th>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {historyRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-zinc-800/30">
                        <td className="p-3 font-semibold text-zinc-200">{req.toolName}</td>
                        <td className="p-3 text-zinc-400">{req.agentId}</td>
                        <td className="p-3">{getRiskBadge(req.riskLevel)}</td>
                        <td className="p-3">{getStatusBadge(req.status)}</td>
                        <td className="p-3 text-zinc-300 max-w-xs truncate">
                          <span className="text-zinc-400">{req.resolvedBy || "System"}:</span>{" "}
                          {req.decisionNote || "—"}
                        </td>
                        <td className="p-3 text-zinc-500">
                          {req.resolvedAt ? new Date(req.resolvedAt).toLocaleString() : new Date(req.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setSelectedRequest(req)}
                            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                            title="View sanitized payload"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 text-xs text-zinc-400">
              Complete PermissionGuard audit log recorded to SQLite <code className="text-zinc-300">audit_logs</code> table. Every tool invocation, whether pre-approved or human-authorized, is permanently logged.
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-8 text-center border border-zinc-800/80 rounded-xl bg-zinc-900/30 text-zinc-500 text-sm">
                No audit log entries recorded yet.
              </div>
            ) : (
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase font-mono">
                    <tr>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Agent</th>
                      <th className="p-3">Tool</th>
                      <th className="p-3">Risk Level</th>
                      <th className="p-3">Approval</th>
                      <th className="p-3">Result / Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-800/30">
                        <td className="p-3 text-zinc-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3 font-semibold text-zinc-300">{log.agentId}</td>
                        <td className="p-3 text-blue-400">{log.toolName}</td>
                        <td className="p-3">{getRiskBadge(log.riskLevel)}</td>
                        <td className="p-3">
                          <span className="px-1.5 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {log.approvalStatus}
                          </span>
                        </td>
                        <td className="p-3 max-w-sm truncate text-zinc-400">
                          {log.error ? (
                            <span className="text-red-400 font-semibold">{log.error}</span>
                          ) : (
                            log.resultSummary || "Completed"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payload Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-semibold text-zinc-200">
                Request Details: <span className="font-mono text-amber-400">{selectedRequest.toolName}</span>
              </h3>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-zinc-500 hover:text-zinc-300 text-sm"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-zinc-400 font-mono">
                <div>Agent: <span className="text-zinc-200">{selectedRequest.agentId}</span></div>
                <div>Status: <span className="text-zinc-200">{selectedRequest.status}</span></div>
                <div>Risk: <span className="text-zinc-200">{selectedRequest.riskLevel}</span></div>
                <div>Resolved By: <span className="text-zinc-200">{selectedRequest.resolvedBy || "N/A"}</span></div>
              </div>
              <div>
                <span className="text-zinc-400 font-semibold block mb-1">Sanitized Arguments:</span>
                <pre className="p-3 bg-zinc-950 rounded-lg font-mono text-emerald-400 border border-zinc-800 overflow-x-auto max-h-60 whitespace-pre-wrap">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedRequest.argumentsSanitizedJson), null, 2);
                    } catch {
                      return selectedRequest.argumentsSanitizedJson;
                    }
                  })()}
                </pre>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-zinc-800">
              <button
                onClick={() => setSelectedRequest(null)}
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
