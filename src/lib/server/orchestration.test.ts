// Tests for Module A (Intelligent Chief of Staff) & Module C (Multi-Agent Collaboration)
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Client } from "@libsql/client";
import { openClient } from "@/db/client";
import { ChiefOfStaffService } from "./chief-of-staff";
import {
  PRE_SEEDED_ROOMS,
  seedCollaborationRooms,
  recordCollaborationMessage,
  checkLoopGuard,
  DEFAULT_MAX_TURNS,
  DEFAULT_MAX_DELEGATION_DEPTH,
} from "./collaboration";
import { seedSpecializedAgents } from "./agent-factory";
import { executionEngine } from "./execution-engine";
import {
  getRun,
  getTask,
  listCollaborationMessages,
  listRooms,
  listTasksByRun,
  updateTask,
} from "@/db";
import { memoryService } from "./memory";

describe("Module A & Module C: Orchestration & Collaboration (orchestration.test.ts)", () => {
  let client: Client;
  let chiefOfStaff: ChiefOfStaffService;

  beforeEach(async () => {
    client = await openClient(":memory:");
    chiefOfStaff = new ChiefOfStaffService();
    // Seed 8 specialized agents and 4 collaboration rooms
    await seedSpecializedAgents(client);
    await seedCollaborationRooms(client);
  });

  afterEach(() => {
    executionEngine.setTaskWorker(null);
    try {
      client.close();
    } catch {
      // ignore
    }
  });

  describe("Pre-Seeded Collaboration Rooms", () => {
    it("seeds 4 specialized collaboration rooms with correct leads and members", async () => {
      const rooms = await listRooms(client);
      expect(rooms.length).toBeGreaterThanOrEqual(4);

      const roomNames = [
        "Executive Strategy",
        "Marketing Studio",
        "Engineering War Room",
        "Business Analytics",
      ];

      for (const name of roomNames) {
        const found = rooms.find((r) => r.name === name);
        expect(found).toBeDefined();
        expect(found?.leadId).toBe("agent-chief-of-staff");
        expect(found?.memberIds).toContain("agent-chief-of-staff");
        expect(found?.memberIds.length).toBeGreaterThanOrEqual(3);

        // Verify shared room memory file was initialized
        const mem = memoryService.readFile("room", found!.id);
        expect(mem).toContain(name);
      }
    });
  });

  describe("Intelligent Chief of Staff & Collaboration (Requirements a-d)", () => {
    // a) Complex goal decomposition produces a multi-task DAG with parallel tasks + a final Consolidation task depending on leaf tasks
    it("(a) decomposes complex goals into parallel independent tasks with an executive Consolidation task depending on leaf tasks", async () => {
      const goal = "Develop a comprehensive Q3 go-to-market strategy with competitive benchmarking and pricing metrics";

      const plan = await chiefOfStaff.planGoal(goal, {
        roomId: "room-executive-strategy",
        client,
      });

      expect(plan.run.id).toBeTruthy();
      expect(plan.tasks.length).toBeGreaterThanOrEqual(3);

      // Verify tasks are persisted in SQLite BEFORE execution
      const persistedTasks = await listTasksByRun(plan.run.id, client);
      expect(persistedTasks).toHaveLength(plan.tasks.length);

      // Find the final consolidation task
      const consolidationTask = plan.tasks.find((t) =>
        t.title.toLowerCase().includes("consolidation") || t.title.toLowerCase().includes("synthesis"),
      );
      expect(consolidationTask).toBeDefined();
      expect(consolidationTask?.assignedAgentId).toBe("agent-chief-of-staff");

      // Verify independent leaf tasks have dependencies: []
      const independentTasks = plan.tasks.filter((t) => t.id !== consolidationTask?.id);
      expect(independentTasks.length).toBeGreaterThanOrEqual(2);
      for (const t of independentTasks) {
        expect(t.dependencies).toEqual([]);
      }

      // Verify consolidation task depends on all preceding leaf tasks
      expect(consolidationTask?.dependencies).toHaveLength(independentTasks.length);
      for (const t of independentTasks) {
        expect(consolidationTask?.dependencies).toContain(t.id);
      }
    });

    // b) Collaboration messages (DELEGATE, CHALLENGE, VERIFY, RESULT) are persisted and shared room memory is updated
    it("(b) persists structured collaboration messages (DELEGATE, CHALLENGE, VERIFY, RESULT) and updates shared room memory", async () => {
      const roomId = "room-executive-strategy";
      const runId = "run-collab-test";

      // 1. DELEGATE
      await recordCollaborationMessage({
        roomId,
        runId,
        senderAgentId: "agent-chief-of-staff",
        recipientAgentId: "agent-competitor-analyst",
        messageType: "DELEGATE",
        content: "Please assess Competitor X pricing vulnerability.",
        client,
      });

      // 2. CHALLENGE
      await recordCollaborationMessage({
        roomId,
        runId,
        senderAgentId: "agent-competitor-analyst",
        recipientAgentId: "agent-data-analyst",
        messageType: "CHALLENGE",
        content: "Competitor X churn numbers appear underestimated in initial report.",
        client,
      });

      // 3. VERIFY
      await recordCollaborationMessage({
        roomId,
        runId,
        senderAgentId: "agent-data-analyst",
        recipientAgentId: "agent-market-researcher",
        messageType: "VERIFY",
        content: "Verified third-party churn data from secondary industry benchmark.",
        client,
      });

      // 4. RESULT
      await recordCollaborationMessage({
        roomId,
        runId,
        senderAgentId: "agent-chief-of-staff",
        messageType: "RESULT",
        content: "Consolidated strategy finalized with validated churn metrics.",
        client,
      });

      // Verify messages are recorded in SQLite
      const messages = await listCollaborationMessages(roomId, { runId }, client);
      expect(messages).toHaveLength(4);
      expect(messages.map((m) => m.messageType)).toEqual([
        "DELEGATE",
        "CHALLENGE",
        "VERIFY",
        "RESULT",
      ]);

      // Verify shared room memory was updated with provenance
      const roomMemory = memoryService.readFile("room", roomId);
      expect(roomMemory).toContain("[DELEGATE]");
      expect(roomMemory).toContain("[CHALLENGE]");
      expect(roomMemory).toContain("[VERIFY]");
      expect(roomMemory).toContain("[RESULT]");
      expect(roomMemory).toContain("Competitor X");
    });

    // c) Loop prevention stops delegation cleanly when maxDelegationDepth or maxTurns is exceeded
    it("(c) halts delegation cleanly when maxDelegationDepth or maxTurns is exceeded", () => {
      // 1. Within limits -> should not halt
      const okState = checkLoopGuard({ turnCount: 3, delegationDepth: 1 });
      expect(okState.shouldHalt).toBe(false);

      // 2. maxDelegationDepth exceeded -> should halt
      const depthHalt = checkLoopGuard({
        turnCount: 5,
        delegationDepth: DEFAULT_MAX_DELEGATION_DEPTH + 1,
      });
      expect(depthHalt.shouldHalt).toBe(true);
      expect(depthHalt.reason).toContain("LOOP_GUARD_TRIGGERED");
      expect(depthHalt.reason).toContain("Maximum delegation depth");

      // 3. maxTurns exceeded -> should halt
      const turnsHalt = checkLoopGuard({
        turnCount: DEFAULT_MAX_TURNS,
        delegationDepth: 1,
      });
      expect(turnsHalt.shouldHalt).toBe(true);
      expect(turnsHalt.reason).toContain("LOOP_GUARD_TRIGGERED");
      expect(turnsHalt.reason).toContain("Maximum turn count");
    });

    // d) Mid-run interruption cancels pending tasks, preserves completed outputs, saves the new directive to room memory, and produces an adapted final deliverable
    it("(d) mid-run interruption cancels pending tasks, preserves completed outputs, saves directive to room memory, and produces an adapted deliverable", async () => {
      const roomId = "room-marketing-studio";
      const goal = "Draft brand launch positioning and marketing campaign";

      const plan = await chiefOfStaff.planGoal(goal, { roomId, client });
      const runId = plan.run.id;

      // Simulate execution where Task 1 completed, but Task 2 and Consolidation are still pending
      const [task1, task2, consolidation] = plan.tasks;

      await updateTask(
        task1.id,
        {
          status: "COMPLETED",
          output: "Market research identified strong demand in enterprise B2B segment.",
          completedAt: new Date().toISOString(),
        },
        client,
      );

      // Mid-run interruption: user provides a critical pivot
      const newDirective = "Pivot focus entirely toward developer-first open-source tooling";

      executionEngine.setTaskWorker(async (task) => ({
        output: `Adapted output for ${task.title}: aligned with developer-first open-source strategy.`,
      }));

      const adaptedRun = await chiefOfStaff.interruptAndReplan(
        roomId,
        runId,
        newDirective,
        client,
      );

      expect(adaptedRun.status).toBe("COMPLETED");

      // Verify previous pending task was cancelled
      const t2After = await getTask(task2.id, client);
      expect(t2After?.status).toBe("CANCELLED");
      expect(t2After?.error).toContain("user interruption");

      // Verify task 1 output was preserved intact
      const t1After = await getTask(task1.id, client);
      expect(t1After?.status).toBe("COMPLETED");
      expect(t1After?.output).toContain("enterprise B2B segment");

      // Verify room memory records the mid-run directive
      const roomMemory = memoryService.readFile("room", roomId);
      expect(roomMemory).toContain("MID-RUN INTERRUPT");
      expect(roomMemory).toContain("developer-first open-source tooling");

      // Verify collaboration table recorded INTERRUPT
      const messages = await listCollaborationMessages(roomId, { runId }, client);
      const interruptMsg = messages.find((m) => m.messageType === "INTERRUPT");
      expect(interruptMsg).toBeDefined();
      expect(interruptMsg?.content).toContain("developer-first open-source tooling");
    });
  });
});
