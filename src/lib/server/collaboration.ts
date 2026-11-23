// Module C: Multi-Agent Collaboration Rooms & Loop Prevention
// Manages collaboration rooms, structured message exchanges (DELEGATE, CHALLENGE, VERIFY, etc.),
// shared room memory persistence, and strict loop prevention guardrails.
import type { Client } from "@libsql/client";
import type { CollaborationMessageType, Room, RoomCollaborationMessage } from "@/lib/shared/types";
import {
  createCollaborationMessage,
  listCollaborationMessages,
  getRoom,
  listRooms,
  saveRoom,
} from "./db";
import { memoryService } from "./memory";
import { publish } from "./bus";

export const PRE_SEEDED_ROOMS: Room[] = [
  {
    id: "room-executive-strategy",
    name: "Executive Strategy",
    topic: "Strategic vision, market dynamics, competitive positioning, and data-driven decisions.",
    emoji: "🏛️",
    memberIds: [
      "agent-chief-of-staff",
      "agent-market-researcher",
      "agent-competitor-analyst",
      "agent-data-analyst",
    ],
    leadId: "agent-chief-of-staff",
    responder: "auto",
    pinned: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "room-marketing-studio",
    name: "Marketing Studio",
    topic: "Go-to-market strategies, campaign planning, narrative copywriting, and trend discovery.",
    emoji: "🎬",
    memberIds: [
      "agent-chief-of-staff",
      "agent-marketing-strategist",
      "agent-content-creator",
      "agent-market-researcher",
    ],
    leadId: "agent-chief-of-staff",
    responder: "auto",
    pinned: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "room-engineering-war-room",
    name: "Engineering War Room",
    topic: "Architecture reviews, security auditing, and end-to-end browser & workflow automation.",
    emoji: "🛡️",
    memberIds: [
      "agent-chief-of-staff",
      "agent-senior-code-reviewer",
      "agent-automation-ops",
    ],
    leadId: "agent-chief-of-staff",
    responder: "auto",
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "room-business-analytics",
    name: "Business Analytics",
    topic: "Financial forecasting, unit economics, market size modeling, and quantitative benchmarking.",
    emoji: "📊",
    memberIds: [
      "agent-chief-of-staff",
      "agent-data-analyst",
      "agent-competitor-analyst",
    ],
    leadId: "agent-chief-of-staff",
    responder: "auto",
    pinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

export async function seedCollaborationRooms(client?: Client): Promise<Room[]> {
  const existing = await listRooms(client);
  const existingIds = new Set(existing.map((r) => r.id));
  const seeded: Room[] = [];

  for (const room of PRE_SEEDED_ROOMS) {
    if (!existingIds.has(room.id)) {
      await saveRoom(room, client);
      // Initialize shared room memory with provenance
      memoryService.appendEntry("room", room.id, {
        content: `Collaboration Room "${room.name}" created with focus: ${room.topic}`,
        source: "system",
        reason: "Initial collaboration room initialization",
      });
      seeded.push(room);
    }
  }

  if (seeded.length > 0) {
    publish({ type: "rooms-changed" });
  }

  return seeded;
}

export interface CollaborationExchangeOptions {
  roomId: string;
  runId?: string | null;
  senderAgentId: string;
  recipientAgentId?: string | null;
  messageType: CollaborationMessageType;
  content: string;
  metadata?: Record<string, unknown> | null;
  persistToRoomMemory?: boolean;
  client?: Client;
}

/**
 * Records a structured collaboration message (DELEGATE, QUESTION, SHARE, CHALLENGE, VERIFY, RESULT, INTERRUPT)
 * and updates shared room memory with provenance.
 */
export async function recordCollaborationMessage(
  options: CollaborationExchangeOptions,
): Promise<void> {
  await createCollaborationMessage(
    {
      roomId: options.roomId,
      runId: options.runId ?? null,
      senderAgentId: options.senderAgentId,
      recipientAgentId: options.recipientAgentId ?? null,
      messageType: options.messageType,
      content: options.content,
      metadata: options.metadata ?? null,
    },
    options.client,
  );

  // If flagged or if high-impact message type, persist to shared room memory
  const shouldPersist =
    options.persistToRoomMemory !== false &&
    ["DELEGATE", "SHARE", "CHALLENGE", "VERIFY", "RESULT", "INTERRUPT"].includes(options.messageType);

  if (shouldPersist) {
    memoryService.appendEntry("room", options.roomId, {
      content: `[${options.messageType}] ${options.senderAgentId}${options.recipientAgentId ? ` -> ${options.recipientAgentId}` : ""}: ${options.content.slice(0, 300)}`,
      source: options.senderAgentId,
      reason: `Collaboration message in run ${options.runId || "general"}`,
    });
  }
}

export interface LoopGuardState {
  turnCount: number;
  delegationDepth: number;
  maxTurns?: number;
  maxDelegationDepth?: number;
}

export interface LoopGuardCheckResult {
  shouldHalt: boolean;
  reason?: string;
  note?: string;
}

export const DEFAULT_MAX_TURNS = 12;
export const DEFAULT_MAX_DELEGATION_DEPTH = 3;

/**
 * Enforces hard loop prevention guardrails:
 * - maxTurns (default: 12)
 * - maxDelegationDepth (default: 3)
 */
export function checkLoopGuard(state: LoopGuardState): LoopGuardCheckResult {
  const maxTurns = state.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxDepth = state.maxDelegationDepth ?? DEFAULT_MAX_DELEGATION_DEPTH;

  if (state.delegationDepth > maxDepth) {
    return {
      shouldHalt: true,
      reason: `LOOP_GUARD_TRIGGERED: Maximum delegation depth of ${maxDepth} exceeded (current depth: ${state.delegationDepth}).`,
      note: "Halted delegation depth loop to synthesize best available output.",
    };
  }

  if (state.turnCount >= maxTurns) {
    return {
      shouldHalt: true,
      reason: `LOOP_GUARD_TRIGGERED: Maximum turn count of ${maxTurns} reached (turns executed: ${state.turnCount}).`,
      note: "Halted turn loop to prevent infinite agent deliberation.",
    };
  }

  return { shouldHalt: false };
}
