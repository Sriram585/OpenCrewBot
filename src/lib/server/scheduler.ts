// Module I: Scheduled AI Workflows & Cron Orchestration
// Manages recurring cron jobs, manual workflow execution, pause/resume, and execution history.
// Attaches singleton to globalThis to prevent duplicate cron jobs across Next.js dev reloads.
import cron, { type ScheduledTask } from "node-cron";
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import type { ScheduledWorkflow, WorkflowRunRecord, WorkflowStatus } from "@/lib/shared/types";
import {
  createScheduledWorkflow,
  createWorkflowRun,
  getScheduledWorkflow,
  listScheduledWorkflows,
  listWorkflowRuns,
  updateScheduledWorkflow,
  updateWorkflowRun,
} from "./db";
import { chiefOfStaffService } from "./chief-of-staff";

interface SchedulerState {
  tasks: Map<string, ScheduledTask>;
  initialized: boolean;
}

const g = globalThis as unknown as { __opencrewbotScheduler?: SchedulerState };
const state: SchedulerState = (g.__opencrewbotScheduler ??= {
  tasks: new Map(),
  initialized: false,
});

export class WorkflowScheduler {
  private customExecutor?: (workflow: ScheduledWorkflow, client?: Client) => Promise<string>;

  /** Allows tests to mock execution without full agent orchestrator runs */
  setCustomExecutor(executor?: (workflow: ScheduledWorkflow, client?: Client) => Promise<string>): void {
    this.customExecutor = executor;
  }

  async createWorkflow(
    input: {
      id?: string;
      name: string;
      description?: string;
      roomId?: string;
      goalPrompt: string;
      cronExpression: string;
      status?: WorkflowStatus;
    },
    client?: Client,
  ): Promise<ScheduledWorkflow> {
    if (!input.name?.trim()) throw new Error("Workflow name is required.");
    if (!input.goalPrompt?.trim()) throw new Error("Workflow goal prompt is required.");
    if (!cron.validate(input.cronExpression)) {
      throw new Error(`Invalid cron expression: "${input.cronExpression}".`);
    }

    const id = input.id || `wf-${randomUUID().slice(0, 8)}`;
    const workflow: ScheduledWorkflow = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      roomId: input.roomId || null,
      goalPrompt: input.goalPrompt.trim(),
      cronExpression: input.cronExpression.trim(),
      status: input.status || "ACTIVE",
      createdAt: new Date().toISOString(),
    };

    await createScheduledWorkflow(workflow, client);

    if (workflow.status === "ACTIVE") {
      this.registerCronJob(workflow, client);
    }

    return (await getScheduledWorkflow(id, client))!;
  }

  async listWorkflows(
    filter?: { status?: WorkflowStatus; roomId?: string },
    client?: Client,
  ): Promise<ScheduledWorkflow[]> {
    return listScheduledWorkflows(filter, client);
  }

  async getWorkflow(id: string, client?: Client): Promise<ScheduledWorkflow | null> {
    return getScheduledWorkflow(id, client);
  }

  async toggleWorkflow(id: string, client?: Client): Promise<ScheduledWorkflow> {
    const wf = await getScheduledWorkflow(id, client);
    if (!wf) throw new Error(`Workflow ${id} not found.`);

    const newStatus: WorkflowStatus = wf.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    await updateScheduledWorkflow(id, { status: newStatus }, client);

    if (newStatus === "PAUSED") {
      const activeTask = state.tasks.get(id);
      if (activeTask) {
        activeTask.stop();
        state.tasks.delete(id);
      }
    } else {
      this.registerCronJob({ ...wf, status: "ACTIVE" }, client);
    }

    return (await getScheduledWorkflow(id, client))!;
  }

  async runWorkflow(
    id: string,
    triggerType: "SCHEDULED" | "MANUAL" = "MANUAL",
    client?: Client,
  ): Promise<{ runId: string; status: string; output?: string; error?: string }> {
    const wf = await getScheduledWorkflow(id, client);
    if (!wf) throw new Error(`Workflow ${id} not found.`);

    const runId = `wfrun-${randomUUID().slice(0, 8)}`;
    const startedAt = new Date().toISOString();

    await createWorkflowRun(
      {
        id: runId,
        workflowId: wf.id,
        triggerType,
        status: "RUNNING",
        startedAt,
      },
      client,
    );

    try {
      let output = "";
      if (this.customExecutor) {
        output = await this.customExecutor(wf, client);
      } else {
        const orchestration = await chiefOfStaffService.orchestrateGoal(wf.goalPrompt, {
          roomId: wf.roomId || undefined,
          client,
        });
        output = orchestration.run.finalOutput || `Orchestrated run ${orchestration.run.id} finished with status ${orchestration.run.status}`;
      }

      const completedAt = new Date().toISOString();
      await updateWorkflowRun(
        runId,
        {
          status: "COMPLETED",
          completedAt,
        },
        client,
      );

      await updateScheduledWorkflow(
        wf.id,
        {
          lastRunAt: completedAt,
          lastStatus: "COMPLETED",
          lastError: null,
        },
        client,
      );

      return { runId, status: "COMPLETED", output };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const completedAt = new Date().toISOString();

      await updateWorkflowRun(
        runId,
        {
          status: "FAILED",
          completedAt,
          error: errorMsg,
        },
        client,
      );

      await updateScheduledWorkflow(
        wf.id,
        {
          lastRunAt: completedAt,
          lastStatus: "FAILED",
          lastError: errorMsg,
        },
        client,
      );

      return { runId, status: "FAILED", error: errorMsg };
    }
  }

  async listHistory(workflowId: string, limit = 50, client?: Client): Promise<WorkflowRunRecord[]> {
    return listWorkflowRuns(workflowId, limit, client);
  }

  private registerCronJob(wf: ScheduledWorkflow, client?: Client): void {
    // Clean up existing job if present
    const existing = state.tasks.get(wf.id);
    if (existing) {
      existing.stop();
      state.tasks.delete(wf.id);
    }

    try {
      const task = cron.schedule(wf.cronExpression, () => {
        void this.runWorkflow(wf.id, "SCHEDULED", client).catch((err) => {
          console.error(`Scheduled workflow ${wf.id} execution failed:`, err);
        });
      });
      state.tasks.set(wf.id, task);
    } catch (err) {
      console.error(`Failed to register cron for workflow ${wf.id}:`, err);
    }
  }

  /**
   * Initializes all active scheduled workflows on server startup.
   */
  async initScheduler(client?: Client): Promise<number> {
    if (state.initialized) return state.tasks.size;
    state.initialized = true;

    try {
      const activeWorkflows = await listScheduledWorkflows({ status: "ACTIVE" }, client);
      for (const wf of activeWorkflows) {
        this.registerCronJob(wf, client);
      }
      return state.tasks.size;
    } catch {
      return 0;
    }
  }

  /** Clears all running cron tasks (used in tests) */
  stopAll(): void {
    for (const task of state.tasks.values()) {
      task.stop();
    }
    state.tasks.clear();
    state.initialized = false;
  }
}

// Global scheduler singleton
export const workflowScheduler = new WorkflowScheduler();
