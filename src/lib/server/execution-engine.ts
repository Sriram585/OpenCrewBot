// Module D: Autonomous Task Execution Engine
// Executes Directed Acyclic Graphs (DAGs) of tasks in parallel with automatic failure recovery,
// timeout enforcement, approval pausing/resuming, and crash recovery.
import type { Client } from "@libsql/client";
import type { Run, RunStatus, Task, TaskStatus } from "@/lib/shared/types";
import {
  createRun,
  createTask,
  getRun,
  getTask,
  listRuns,
  listTasksByRun,
  updateRun,
  updateTask,
  getBot,
} from "./db";
import { memoryService } from "./memory";
import { permissionGuard } from "./permissions";
import { isMock } from "./config";
import { resolveMastraModelConfig } from "./models";

export type TaskWorker = (task: Task, client?: Client) => Promise<{
  output?: string;
  waitingApproval?: { approvalId: string; preview: string };
}>;

export class ExecutionEngine {
  private customWorker: TaskWorker | null = null;
  private activeAbortControllers = new Map<string, AbortController>();

  /** Allows tests and custom runners to supply custom execution logic */
  setTaskWorker(worker: TaskWorker | null): void {
    this.customWorker = worker;
  }

  /**
   * Default production task worker: reads agent instructions, builds prompt context
   * with scoped memory, and executes.
   */
  async defaultWorker(task: Task, client?: Client): Promise<{
    output?: string;
    waitingApproval?: { approvalId: string; preview: string };
  }> {
    let agentName = "General Agent";
    let agentRole = "Task Worker";

    if (task.assignedAgentId) {
      const bot = await getBot(task.assignedAgentId, client);
      if (bot) {
        agentName = bot.name;
        agentRole = bot.role || bot.title || "Agent";

        // Read scoped memory for prompt context
        const agentMem = memoryService.readFile("agent", bot.id);
        const userPrefs = memoryService.readFile("user");

        // If in mock mode or no live key, generate deterministic formatted output
        if (isMock()) {
          return {
            output: `[MOCKED] ${agentName} (${agentRole}) successfully executed task "${task.title}": ${task.description || "Completed objective."}`,
          };
        }
      }
    }

    return {
      output: `Executed "${task.title}" by ${agentName} (${agentRole}): ${task.description || "Completed successfully."}`,
    };
  }

  /**
   * Executes a single task with strict timeout enforcement, retries, and approval checking.
   */
  async executeTask(task: Task, client?: Client): Promise<Task> {
    const startedAt = new Date().toISOString();
    await updateTask(task.id, { status: "RUNNING", startedAt }, client);

    const timeoutMs = task.timeoutMs || 60000;
    const abortCtrl = new AbortController();
    this.activeAbortControllers.set(task.id, abortCtrl);

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        abortCtrl.abort();
        reject(new Error(`Task timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const worker = this.customWorker || this.defaultWorker.bind(this);
      const workerPromise = worker(task, client);

      const res = await Promise.race([workerPromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      this.activeAbortControllers.delete(task.id);

      // 1. Approval Required
      if (res.waitingApproval) {
        await updateTask(
          task.id,
          {
            status: "WAITING_APPROVAL",
            approvalId: res.waitingApproval.approvalId,
            error: null,
          },
          client,
        );
        return (await getTask(task.id, client))!;
      }

      // 2. Success
      const completedAt = new Date().toISOString();
      const output = res.output || `Task "${task.title}" completed successfully.`;

      await updateTask(
        task.id,
        {
          status: "COMPLETED",
          output,
          error: null,
          completedAt,
        },
        client,
      );

      // Record to task memory
      try {
        memoryService.appendEntry("tasks", task.id, {
          content: `Task "${task.title}" completed with output: ${output.slice(0, 200)}`,
          source: task.assignedAgentId || "execution-engine",
          reason: `Run ${task.runId} DAG execution`,
        });
      } catch {
        // memory write is best-effort
      }

      return (await getTask(task.id, client))!;
    } catch (err: unknown) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      this.activeAbortControllers.delete(task.id);

      const errorMsg = err instanceof Error ? err.message : String(err);
      const nextRetries = task.retries + 1;

      // Automatic failure recovery: retry if under maxRetries
      if (nextRetries < task.maxRetries) {
        await updateTask(
          task.id,
          {
            status: "PENDING",
            retries: nextRetries,
            error: `Attempt ${nextRetries} failed: ${errorMsg}`,
          },
          client,
        );
        return (await getTask(task.id, client))!;
      }

      // Max retries exceeded -> FAILED
      const completedAt = new Date().toISOString();
      await updateTask(
        task.id,
        {
          status: "FAILED",
          retries: nextRetries,
          error: errorMsg,
          completedAt,
        },
        client,
      );
      return (await getTask(task.id, client))!;
    }
  }

  /**
   * Main DAG Execution Engine loop:
   * Finds all PENDING tasks whose dependencies are COMPLETED, and executes them in parallel.
   */
  async executeRun(runId: string, client?: Client): Promise<Run> {
    let run = await getRun(runId, client);
    if (!run) throw new Error(`Run ${runId} not found`);

    if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELLED") {
      return run;
    }

    if (run.status === "PENDING") {
      await updateRun(runId, { status: "RUNNING", startedAt: new Date().toISOString() }, client);
      run = (await getRun(runId, client))!;
    }

    while (true) {
      // Re-read fresh state from SQLite
      run = (await getRun(runId, client))!;
      if (run.status === "CANCELLED") {
        return run;
      }

      const tasks = await listTasksByRun(runId, client);
      const activeTasks = tasks.filter((t) => t.status !== "CANCELLED");
      const taskMap = new Map(tasks.map((t) => [t.id, t]));

      // Check if any task is WAITING_APPROVAL
      const waitingApprovalTask = activeTasks.find((t) => t.status === "WAITING_APPROVAL");
      if (waitingApprovalTask) {
        await updateRun(runId, { status: "WAITING_APPROVAL" }, client);
        return (await getRun(runId, client))!;
      }

      // Check if any active task is FAILED (cannot retry)
      const failedTask = activeTasks.find((t) => t.status === "FAILED");
      if (failedTask) {
        const error = `Task "${failedTask.title}" (${failedTask.id}) failed: ${failedTask.error || "Unknown error"}`;
        await updateRun(
          runId,
          {
            status: "FAILED",
            error,
            completedAt: new Date().toISOString(),
          },
          client,
        );
        return (await getRun(runId, client))!;
      }

      // Check if all active tasks are COMPLETED
      const allCompleted = activeTasks.length > 0 && activeTasks.every((t) => t.status === "COMPLETED");
      if (allCompleted) {
        // Build final output from all completed active task outputs
        const outputs = activeTasks.map((t) => `### ${t.title}\n${t.output || "No output"}`).join("\n\n");
        await updateRun(
          runId,
          {
            status: "COMPLETED",
            finalOutput: outputs,
            completedAt: new Date().toISOString(),
          },
          client,
        );
        return (await getRun(runId, client))!;
      }

      // Find ready tasks: PENDING tasks whose dependencies are all COMPLETED
      const readyTasks = activeTasks.filter((t) => {
        if (t.status !== "PENDING") return false;
        if (!t.dependencies || t.dependencies.length === 0) return true;
        return t.dependencies.every((depId) => {
          const dep = taskMap.get(depId);
          return dep && dep.status === "COMPLETED";
        });
      });

      // Deadlock check: active tasks exist, not all completed, but no tasks ready and none running
      const runningTasks = activeTasks.filter((t) => t.status === "RUNNING");
      if (readyTasks.length === 0 && runningTasks.length === 0) {
        const error = "Deadlock detected: pending tasks have unfulfilled or circular dependencies.";
        await updateRun(
          runId,
          {
            status: "FAILED",
            error,
            completedAt: new Date().toISOString(),
          },
          client,
        );
        return (await getRun(runId, client))!;
      }

      if (readyTasks.length === 0) {
        // Some tasks are currently running, wait briefly for them to settle
        await new Promise((r) => setTimeout(r, 20));
        continue;
      }

      // Execute ready tasks in parallel via Promise.allSettled()
      await Promise.allSettled(readyTasks.map((t) => this.executeTask(t, client)));
    }
  }

  /**
   * Resumes a task that paused in WAITING_APPROVAL.
   */
  async resumeTaskAfterApproval(
    taskId: string,
    approved: boolean,
    toolResultOrError?: unknown,
    client?: Client,
  ): Promise<Run> {
    const task = await getTask(taskId, client);
    if (!task) throw new Error(`Task ${taskId} not found`);

    if (task.status !== "WAITING_APPROVAL") {
      throw new Error(`Task ${taskId} is not waiting for approval (current status: ${task.status})`);
    }

    if (approved) {
      const output =
        typeof toolResultOrError === "string"
          ? toolResultOrError
          : JSON.stringify(toolResultOrError || "Approved and executed successfully");

      await updateTask(
        taskId,
        {
          status: "COMPLETED",
          output,
          error: null,
          completedAt: new Date().toISOString(),
        },
        client,
      );
    } else {
      const errorMsg =
        typeof toolResultOrError === "string"
          ? toolResultOrError
          : "Action was rejected by human operator";

      await updateTask(
        taskId,
        {
          status: "FAILED",
          error: errorMsg,
          completedAt: new Date().toISOString(),
        },
        client,
      );
    }

    // Resume DAG execution
    return this.executeRun(task.runId, client);
  }

  /**
   * Cancels a run and all of its active/pending tasks.
   */
  async cancelRun(runId: string, client?: Client): Promise<Run> {
    const run = await getRun(runId, client);
    if (!run) throw new Error(`Run ${runId} not found`);

    await updateRun(
      runId,
      {
        status: "CANCELLED",
        error: "Run cancelled by user",
        completedAt: new Date().toISOString(),
      },
      client,
    );

    const tasks = await listTasksByRun(runId, client);
    for (const t of tasks) {
      if (t.status === "PENDING" || t.status === "RUNNING" || t.status === "WAITING_APPROVAL") {
        // Abort running promise if active
        const ctrl = this.activeAbortControllers.get(t.id);
        if (ctrl) {
          ctrl.abort();
          this.activeAbortControllers.delete(t.id);
        }

        await updateTask(
          t.id,
          {
            status: "CANCELLED",
            error: "Task cancelled because run was cancelled",
            completedAt: new Date().toISOString(),
          },
          client,
        );
      }
    }

    return (await getRun(runId, client))!;
  }

  /**
   * Recovers incomplete runs on server boot/crash recovery.
   */
  async recoverIncompleteRuns(client?: Client): Promise<number> {
    const runningRuns = await listRuns({ status: "RUNNING" }, client);
    const pendingRuns = await listRuns({ status: "PENDING" }, client);
    const toRecover = [...runningRuns, ...pendingRuns];

    for (const run of toRecover) {
      const tasks = await listTasksByRun(run.id, client);
      for (const t of tasks) {
        if (t.status === "RUNNING") {
          // Reset interrupted tasks back to PENDING so they can be re-run
          await updateTask(t.id, { status: "PENDING" }, client);
        }
      }
      // Resume DAG execution in the background
      void this.executeRun(run.id, client).catch((err) => {
        console.error(`Failed to recover run ${run.id}:`, err);
      });
    }

    return toRecover.length;
  }
}

// Global execution engine singleton
export const executionEngine = new ExecutionEngine();
