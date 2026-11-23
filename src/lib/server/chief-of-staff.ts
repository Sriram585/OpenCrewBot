// Module A: Intelligent Chief of Staff & Mid-Run Interruption Engine
// Decomposes complex user goals into modular parallel DAG tasks with an executive Consolidation task,
// and supports mid-run interruption and adaptive re-planning.
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import type { Bot, Run, Task } from "@/lib/shared/types";
import {
  createRun,
  createTask,
  getRun,
  getTask,
  listBots,
  listTasksByRun,
  updateRun,
  updateTask,
} from "./db";
import { executionEngine } from "./execution-engine";
import { memoryService } from "./memory";
import { recordCollaborationMessage } from "./collaboration";
import { isMock } from "./config";

export interface DecomposeOptions {
  roomId?: string;
  projectId?: string;
  client?: Client;
}

export interface PlanResult {
  run: Run;
  tasks: Task[];
}

export class ChiefOfStaffService {
  /**
   * Decomposes a high-level goal into a structured DAG with parallel tasks
   * and a final Consolidation task assigned to the Chief of Staff.
   * Persists all tasks to SQLite BEFORE execution starts.
   */
  async planGoal(goal: string, options?: DecomposeOptions): Promise<PlanResult> {
    const c = options?.client;
    const runId = `run-${randomUUID()}`;
    const cleanGoal = goal.trim();

    // 1. Load available bots
    const availableBots = await listBots(c);
    const botMap = new Map(availableBots.map((b) => [b.id, b]));

    // Find Chief of Staff or fallback lead
    const chiefOfStaff =
      availableBots.find((b) => b.id === "agent-chief-of-staff" || b.name.toLowerCase().includes("chief")) ||
      availableBots[0] ||
      ({ id: "agent-chief-of-staff", name: "Chief of Staff" } as Bot);

    // 2. Fetch room and user context from MemoryService
    let contextHeader = "";
    if (options?.roomId) {
      const roomMemory = memoryService.readFile("room", options.roomId);
      if (roomMemory) contextHeader += `\nRoom Context:\n${roomMemory.slice(0, 300)}`;
    }
    const userPrefs = memoryService.readFile("user");
    if (userPrefs) contextHeader += `\nUser Preferences:\n${userPrefs.slice(0, 200)}`;

    // 3. Create run record in SQLite (status = PENDING)
    const run: Run = {
      id: runId,
      roomId: options?.roomId || null,
      goal: cleanGoal,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };
    await createRun(run, c);

    // 4. Decompose goal into parallel tasks + final consolidation
    const plannedTasks = this.generateDagTasks(runId, cleanGoal, availableBots, chiefOfStaff.id);

    // 5. Persist tasks to SQLite BEFORE execution starts
    const createdTasks: Task[] = [];
    for (const taskInput of plannedTasks) {
      await createTask(taskInput, c);
      const created = await getTask(taskInput.id, c);
      if (created) createdTasks.push(created);
    }

    // 6. Record delegation collaboration message if in a room
    if (options?.roomId) {
      await recordCollaborationMessage({
        roomId: options.roomId,
        runId,
        senderAgentId: chiefOfStaff.id,
        messageType: "DELEGATE",
        content: `Chief of Staff decomposed goal "${cleanGoal}" into ${plannedTasks.length} DAG tasks.`,
        metadata: { taskCount: plannedTasks.length, runId },
        client: c,
      });
    }

    return { run, tasks: createdTasks };
  }

  /**
   * Deterministic & intelligent DAG task generation based on goal semantics and available agent capabilities.
   */
  private generateDagTasks(
    runId: string,
    goal: string,
    availableBots: Bot[],
    chiefOfStaffId: string,
  ): Array<{
    id: string;
    runId: string;
    title: string;
    description: string;
    assignedAgentId: string;
    dependencies: string[];
    status: "PENDING";
  }> {
    const lower = goal.toLowerCase();
    const tasks: Array<{
      id: string;
      runId: string;
      title: string;
      description: string;
      assignedAgentId: string;
      dependencies: string[];
      status: "PENDING";
    }> = [];

    // Helper to find bot by role keyword
    const findBot = (keyword: string, fallbackId: string) => {
      const found = availableBots.find(
        (b) =>
          b.name.toLowerCase().includes(keyword) ||
          (b.role && b.role.toLowerCase().includes(keyword)) ||
          (b.skills && b.skills.some((s) => s.toLowerCase().includes(keyword))),
      );
      return found ? found.id : fallbackId;
    };

    const marketResearcherId = findBot("market", "agent-market-researcher");
    const competitorAnalystId = findBot("competitor", "agent-competitor-analyst");
    const marketingStrategistId = findBot("marketing", "agent-marketing-strategist");
    const contentCreatorId = findBot("content", "agent-content-creator");
    const dataAnalystId = findBot("data", "agent-data-analyst");
    const seniorReviewerId = findBot("code", "agent-senior-code-reviewer");
    const automationOpsId = findBot("automation", "agent-automation-ops");

    // Check dynamic bots (e.g. SEO specialist)
    const dynamicBot = availableBots.find((b) => b.isDynamic);

    // Parallel Task 1: Market or domain intelligence
    const task1Id = `task-${runId}-1`;
    tasks.push({
      id: task1Id,
      runId,
      title: "Market Landscape & Trends Discovery",
      description: `Investigate market dynamics, industry benchmarks, and user demand for: "${goal}".`,
      assignedAgentId: dynamicBot && dynamicBot.tools.webSearch ? dynamicBot.id : marketResearcherId,
      dependencies: [],
      status: "PENDING",
    });

    // Parallel Task 2: Competitive intelligence
    const task2Id = `task-${runId}-2`;
    tasks.push({
      id: task2Id,
      runId,
      title: "Competitive Positioning & SWOT Analysis",
      description: `Evaluate key competitors, differentiation opportunities, and feature gaps for: "${goal}".`,
      assignedAgentId: competitorAnalystId,
      dependencies: [],
      status: "PENDING",
    });

    // Optional Parallel Task 3: Quantitative or Technical analysis
    const leafTaskIds = [task1Id, task2Id];
    if (lower.includes("code") || lower.includes("tech") || lower.includes("security") || lower.includes("architecture")) {
      const task3Id = `task-${runId}-3`;
      tasks.push({
        id: task3Id,
        runId,
        title: "Technical Architecture & Code Review",
        description: `Perform architecture assessment, code analysis, and security verification for: "${goal}".`,
        assignedAgentId: seniorReviewerId,
        dependencies: [],
        status: "PENDING",
      });
      leafTaskIds.push(task3Id);
    } else if (lower.includes("data") || lower.includes("metric") || lower.includes("roi") || lower.includes("analytics")) {
      const task3Id = `task-${runId}-3`;
      tasks.push({
        id: task3Id,
        runId,
        title: "Quantitative Metrics & Economics Modeling",
        description: `Compute metrics, financial projections, or data validation for: "${goal}".`,
        assignedAgentId: dataAnalystId,
        dependencies: [],
        status: "PENDING",
      });
      leafTaskIds.push(task3Id);
    } else if (lower.includes("launch") || lower.includes("campaign") || lower.includes("copy") || lower.includes("content")) {
      const task3Id = `task-${runId}-3`;
      tasks.push({
        id: task3Id,
        runId,
        title: "Go-to-Market Strategy & Copywriting",
        description: `Formulate acquisition channels, messaging hooks, and launch copy for: "${goal}".`,
        assignedAgentId: contentCreatorId,
        dependencies: [],
        status: "PENDING",
      });
      leafTaskIds.push(task3Id);
    }

    // Final Task: Consolidation (Depends on ALL leaf tasks)
    const consolidationId = `task-${runId}-consolidation`;
    tasks.push({
      id: consolidationId,
      runId,
      title: "Executive Consolidation & Strategic Synthesis",
      description: `Synthesize findings from all prerequisite tasks (${leafTaskIds.join(", ")}) into an actionable executive business deliverable.`,
      assignedAgentId: chiefOfStaffId,
      dependencies: leafTaskIds,
      status: "PENDING",
    });

    return tasks;
  }

  /**
   * Mid-Run Interruption & Adaptive Re-planning:
   * 1. Cancels remaining PENDING tasks while preserving COMPLETED outputs.
   * 2. Appends new instruction to room memory and logs an INTERRUPT collaboration message.
   * 3. Re-plans adaptive tasks incorporating new instruction + completed outputs.
   * 4. Executes adapted tasks to completion.
   */
  async interruptAndReplan(
    roomId: string,
    runId: string,
    newInstruction: string,
    client?: Client,
  ): Promise<Run> {
    const c = client;
    const run = await getRun(runId, c);
    if (!run) throw new Error(`Run ${runId} not found`);

    // 1. Fetch current tasks and preserve completed outputs
    const currentTasks = await listTasksByRun(runId, c);
    const completedTasks = currentTasks.filter((t) => t.status === "COMPLETED");
    const completedSummary = completedTasks
      .map((t) => `[${t.title}]: ${t.output || "Completed"}`)
      .join("\n");

    // Cancel remaining PENDING tasks
    for (const t of currentTasks) {
      if (t.status === "PENDING") {
        await updateTask(
          t.id,
          {
            status: "CANCELLED",
            error: "Cancelled due to mid-run user interruption and re-planning",
          },
          c,
        );
      }
    }

    // 2. Append newInstruction to shared room memory with provenance
    memoryService.appendEntry("room", roomId, {
      content: `MID-RUN INTERRUPT: User provided new directive: "${newInstruction.trim()}"`,
      source: "user",
      reason: `Mid-run directive injection for run ${runId}`,
    });

    // Log INTERRUPT message in collaboration table
    await recordCollaborationMessage({
      roomId,
      runId,
      senderAgentId: "user",
      messageType: "INTERRUPT",
      content: `Mid-run directive received: "${newInstruction.trim()}". Re-planning execution.`,
      metadata: { newInstruction, previousCompletedTasks: completedTasks.length },
      client: c,
    });

    // 3. Create adapted continuation tasks
    const adaptedTaskId = `task-${runId}-adapted-${Date.now().toString(36)}`;
    await createTask(
      {
        id: adaptedTaskId,
        runId,
        title: "Adapted Directive Execution",
        description: `Execute new directive: "${newInstruction}". Build upon prior findings: ${completedSummary.slice(0, 300)}`,
        assignedAgentId: "agent-chief-of-staff",
        dependencies: completedTasks.map((t) => t.id),
        status: "PENDING",
      },
      c,
    );

    const adaptedConsolidationId = `task-${runId}-adapted-consolidation-${Date.now().toString(36)}`;
    await createTask(
      {
        id: adaptedConsolidationId,
        runId,
        title: "Adapted Executive Synthesis",
        description: `Deliver final synthesized business deliverable incorporating the new directive "${newInstruction}" and all prior outputs.`,
        assignedAgentId: "agent-chief-of-staff",
        dependencies: [adaptedTaskId],
        status: "PENDING",
      },
      c,
    );

    // Update run goal and state
    await updateRun(
      runId,
      {
        status: "PENDING",
        goal: `${run.goal} (Adapted with: ${newInstruction})`,
      },
      c,
    );

    // 4. Re-execute DAG via ExecutionEngine
    return executionEngine.executeRun(runId, c);
  }

  /**
   * Plans and immediately initiates autonomous execution for a high-level goal.
   */
  async orchestrateGoal(
    goal: string,
    options?: DecomposeOptions & { executeAsync?: boolean },
  ): Promise<PlanResult> {
    const plan = await this.planGoal(goal, options);

    if (options?.executeAsync) {
      void executionEngine.executeRun(plan.run.id, options.client).catch((err) => {
        console.error(`Orchestration execution error for run ${plan.run.id}:`, err);
      });
      return plan;
    }

    const completedRun = await executionEngine.executeRun(plan.run.id, options?.client);
    const updatedTasks = await listTasksByRun(plan.run.id, options?.client);
    return { run: completedRun, tasks: updatedTasks };
  }
}

// Global Chief of Staff singleton
export const chiefOfStaffService = new ChiefOfStaffService();
