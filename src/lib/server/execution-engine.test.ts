// Tests for Module D: Autonomous Task Execution Engine
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Client } from "@libsql/client";
import { openClient } from "@/db/client";
import { ExecutionEngine } from "./execution-engine";
import {
  createRun,
  createTask,
  getRun,
  getTask,
  listTasksByRun,
  getRunDetails,
} from "@/db";

describe("Module D: Autonomous Task Execution Engine (execution-engine.ts)", () => {
  let client: Client;
  let engine: ExecutionEngine;

  beforeEach(async () => {
    client = await openClient(":memory:");
    engine = new ExecutionEngine();
  });

  afterEach(() => {
    engine.setTaskWorker(null);
    try {
      client.close();
    } catch {
      // ignore
    }
  });

  describe("DAG Execution Engine Tests (Requirements a-d)", () => {
    // a) Parallel execution: two independent tasks run concurrently and a downstream dependent task waits until both finish
    it("(a) runs independent tasks in parallel with overlapping execution and executes downstream task only after dependencies complete", async () => {
      const runId = "run-parallel-dag";
      await createRun({ id: runId, goal: "Analyze market and generate strategy", status: "PENDING" }, client);

      // Task 1: Market Research (independent)
      await createTask(
        {
          id: "task-1",
          runId,
          title: "Market Research",
          dependencies: [],
          status: "PENDING",
        },
        client,
      );

      // Task 2: Competitor Benchmarking (independent)
      await createTask(
        {
          id: "task-2",
          runId,
          title: "Competitor Benchmarking",
          dependencies: [],
          status: "PENDING",
        },
        client,
      );

      // Task 3: Strategy Synthesis (depends on task-1 and task-2)
      await createTask(
        {
          id: "task-3",
          runId,
          title: "Strategy Synthesis",
          dependencies: ["task-1", "task-2"],
          status: "PENDING",
        },
        client,
      );

      // Worker simulating async work
      engine.setTaskWorker(async (task) => {
        if (task.id === "task-1" || task.id === "task-2") {
          // Delay by 40ms to simulate parallel concurrent work
          await new Promise((r) => setTimeout(r, 40));
          return { output: `Result for ${task.title}` };
        }
        if (task.id === "task-3") {
          await new Promise((r) => setTimeout(r, 20));
          return { output: "Synthesized executive strategy" };
        }
        return { output: "Done" };
      });

      const completedRun = await engine.executeRun(runId, client);
      expect(completedRun.status).toBe("COMPLETED");

      const tasks = await listTasksByRun(runId, client);
      expect(tasks).toHaveLength(3);

      const t1 = tasks.find((t) => t.id === "task-1")!;
      const t2 = tasks.find((t) => t.id === "task-2")!;
      const t3 = tasks.find((t) => t.id === "task-3")!;

      expect(t1.status).toBe("COMPLETED");
      expect(t2.status).toBe("COMPLETED");
      expect(t3.status).toBe("COMPLETED");

      const t1Start = new Date(t1.startedAt!).getTime();
      const t1End = new Date(t1.completedAt!).getTime();
      const t2Start = new Date(t2.startedAt!).getTime();
      const t2End = new Date(t2.completedAt!).getTime();
      const t3Start = new Date(t3.startedAt!).getTime();

      // Verify task-1 and task-2 started concurrently (within 20ms of each other)
      expect(Math.abs(t1Start - t2Start)).toBeLessThanOrEqual(25);

      // Verify concurrent overlapping execution window:
      // max(t1Start, t2Start) < min(t1End, t2End)
      const overlapStart = Math.max(t1Start, t2Start);
      const overlapEnd = Math.min(t1End, t2End);
      expect(overlapStart).toBeLessThan(overlapEnd);

      // Verify task-3 started AFTER both task-1 and task-2 completed
      expect(t3Start).toBeGreaterThanOrEqual(t1End - 2); // allowance for timer resolution
      expect(t3Start).toBeGreaterThanOrEqual(t2End - 2);
    });

    // b) Failure recovery: a task that fails on attempt 1 automatically retries and succeeds on attempt 2
    it("(b) automatically retries a failed task and records retries = 1 upon subsequent success", async () => {
      const runId = "run-retry-test";
      await createRun({ id: runId, goal: "Test automated recovery", status: "PENDING" }, client);

      await createTask(
        {
          id: "task-flaky",
          runId,
          title: "Flaky Network Fetch",
          dependencies: [],
          status: "PENDING",
          maxRetries: 3,
        },
        client,
      );

      let attempts = 0;
      engine.setTaskWorker(async (task) => {
        attempts++;
        if (attempts === 1) {
          throw new Error("HTTP 503 Service Unavailable");
        }
        return { output: "Recovered and fetched successfully on attempt 2" };
      });

      const completedRun = await engine.executeRun(runId, client);
      expect(completedRun.status).toBe("COMPLETED");

      const task = await getTask("task-flaky", client);
      expect(task).not.toBeNull();
      expect(task?.status).toBe("COMPLETED");
      expect(task?.retries).toBe(1);
      expect(task?.output).toContain("Recovered and fetched successfully on attempt 2");
    });

    // c) Timeout & cancellation: a slow task triggers timeout failure; cancelling a run marks pending tasks CANCELLED
    it("(c) enforces per-task timeout and cancels active/pending tasks when run is cancelled", async () => {
      const runId = "run-timeout-cancel";
      await createRun({ id: runId, goal: "Test timeout and cancellation", status: "PENDING" }, client);

      // 1. Timeout Test
      await createTask(
        {
          id: "task-slow",
          runId,
          title: "Extremely Slow Task",
          dependencies: [],
          timeoutMs: 30, // 30ms timeout
          maxRetries: 1, // Only 1 attempt allowed
          status: "PENDING",
        },
        client,
      );

      engine.setTaskWorker(async () => {
        // Deliberately sleep 100ms, exceeding 30ms timeout
        await new Promise((r) => setTimeout(r, 100));
        return { output: "Too late" };
      });

      const timedOutRun = await engine.executeRun(runId, client);
      expect(timedOutRun.status).toBe("FAILED");
      expect(timedOutRun.error).toContain("timed out after 30ms");

      const slowTask = await getTask("task-slow", client);
      expect(slowTask?.status).toBe("FAILED");
      expect(slowTask?.error).toContain("timed out after 30ms");

      // 2. Cancellation Test
      const runId2 = "run-to-cancel";
      await createRun({ id: runId2, goal: "Run to cancel", status: "RUNNING" }, client);
      await createTask({ id: "task-p1", runId: runId2, title: "Pending 1", status: "PENDING" }, client);
      await createTask({ id: "task-p2", runId: runId2, title: "Pending 2", status: "PENDING" }, client);

      const cancelledRun = await engine.cancelRun(runId2, client);
      expect(cancelledRun.status).toBe("CANCELLED");

      const p1 = await getTask("task-p1", client);
      const p2 = await getTask("task-p2", client);
      expect(p1?.status).toBe("CANCELLED");
      expect(p2?.status).toBe("CANCELLED");
    });

    // d) Approval pause/resume: a task pauses in WAITING_APPROVAL and resumes cleanly when approved
    it("(d) pauses in WAITING_APPROVAL when tool requires approval and resumes cleanly when approved", async () => {
      const runId = "run-approval-pause";
      await createRun({ id: runId, goal: "Production deploy workflow", status: "PENDING" }, client);

      await createTask(
        {
          id: "task-deploy",
          runId,
          title: "Deploy to Production",
          dependencies: [],
          status: "PENDING",
        },
        client,
      );

      // Worker encounters an external write requiring approval
      engine.setTaskWorker(async () => {
        return {
          waitingApproval: {
            approvalId: "appr-prod-999",
            preview: '{"action":"deploy","env":"prod"}',
          },
        };
      });

      // Run execution must pause cleanly in WAITING_APPROVAL without failing!
      const pausedRun = await engine.executeRun(runId, client);
      expect(pausedRun.status).toBe("WAITING_APPROVAL");

      const pausedTask = await getTask("task-deploy", client);
      expect(pausedTask?.status).toBe("WAITING_APPROVAL");
      expect(pausedTask?.approvalId).toBe("appr-prod-999");

      // Now human operator approves the action
      engine.setTaskWorker(async () => ({ output: "Production release live at v2.1" }));

      const resumedRun = await engine.resumeTaskAfterApproval(
        "task-deploy",
        true,
        "Production release live at v2.1",
        client,
      );

      expect(resumedRun.status).toBe("COMPLETED");

      const completedTask = await getTask("task-deploy", client);
      expect(completedTask?.status).toBe("COMPLETED");
      expect(completedTask?.output).toContain("Production release live at v2.1");
    });
  });

  describe("Crash Recovery & Incomplete Runs", () => {
    it("reloads and recovers RUNNING/PENDING runs on startup", async () => {
      const runId = "run-crashed";
      await createRun({ id: runId, goal: "Incomplete goal from crash", status: "RUNNING" }, client);
      await createTask(
        {
          id: "task-crashed-1",
          runId,
          title: "Interrupted task",
          status: "RUNNING", // was in-flight when process died
        },
        client,
      );

      engine.setTaskWorker(async (task) => ({ output: `Recovered ${task.title}` }));

      const recoveredCount = await engine.recoverIncompleteRuns(client);
      expect(recoveredCount).toBe(1);

      // Allow background resume to complete
      await new Promise((r) => setTimeout(r, 50));

      const run = await getRun(runId, client);
      expect(run?.status).toBe("COMPLETED");
    });
  });
});
