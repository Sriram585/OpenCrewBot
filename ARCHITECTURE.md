# OpenCrewBot System Architecture

This document details the architectural design, component interactions, data flows, and execution lifecycle of **OpenCrewBot**.

---

## 1. High-Level System Overview

OpenCrewBot is architected around a layered architecture decoupling user interface presentation from core agent orchestration, execution governance, storage, and multi-model intelligence.

```mermaid
flowchart TD
    subgraph UI ["Presentation Layer (Next.js 16.4.0)"]
        UI_Dash["12 Business Interfaces"]
        UI_Feed["Room Collaboration Feed"]
        UI_SSE["Server-Sent Events Client (/api/events)"]
    end

    subgraph Core ["Orchestration & Coordination Engine"]
        COS["Intelligent Chief of Staff"]
        DAG["Autonomous DAG Execution Engine"]
        PG["Central PermissionGuard Middleware"]
        MR["Multi-Provider Model Router"]
        SCH["Cron Workflow Scheduler"]
    end

    subgraph MemoryLayer ["Durable Scoped Memory Layer"]
        MEM_Agent["agents/ (<agentId>.md)"]
        MEM_Room["rooms/ (<roomId>.md)"]
        MEM_Project["projects/ (<projectId>.md)"]
        MEM_User["user/ (preferences.md)"]
        MEM_Decisions["decisions/ & tasks/"]
    end

    subgraph StorageLayer ["Persistence & External Layer"]
        DB["SQLite Database (data/opencrewbot.db)"]
        EXT_GH["GitHub REST API"]
        EXT_SLACK["Slack Webhooks & Bot API"]
        EXT_MCP["Remote MCP Servers"]
        LLM_Cloud["Cloud LLMs (Nebius, OpenAI, Gemini, Groq)"]
        LLM_Local["Local Offline LLM (Ollama)"]
    end

    UI_Dash -->|REST API| Core
    UI_SSE <---|SSE Stream| Core

    COS -->|Decomposes Goal to DAG| DAG
    DAG -->|Gated Tool Execution| PG
    DAG -->|Task Completion| COS
    SCH -->|Trigger Scheduled Goal| COS

    PG -->|Reads Scoped Context| MemoryLayer
    PG -->|Sanitized Audit Log| DB
    PG -->|Authorized Writes| EXT_GH
    PG -->|Authorized Writes| EXT_SLACK
    PG -->|Authorized Writes| EXT_MCP

    DAG -->|Model Routing & Fallbacks| MR
    MR -->|API Calls| LLM_Cloud
    MR -->|Fallback / Offline| LLM_Local
```

---

## 2. Chief of Staff Orchestration & Autonomous DAG Execution

The Intelligent Chief of Staff transforms high-level goals into parallel directed acyclic graphs (DAGs), ensuring independent tasks run concurrently, inter-task dependencies are strictly enforced, and a final executive consolidation deliverable is generated.

```mermaid
sequenceDiagram
    autonumber
    actor User as Human Operator / API
    participant CoS as Chief of Staff
    participant Memory as MemoryService (Disk)
    participant Engine as ExecutionEngine
    participant Guard as PermissionGuard
    participant Agent as Specialized Agents

    User->>CoS: orchestrateGoal("High-level business goal")
    CoS->>Memory: Read Room & User preferences
    Memory-->>CoS: Context & formatting preferences
    CoS->>CoS: Decompose into DAG (Leaf tasks + Consolidation)
    CoS->>Engine: Persist Run & Tasks to SQLite (status: PENDING)
    
    rect rgb(20, 25, 40)
        Note over Engine,Agent: Concurrent Execution Phase
        par Parallel Leaf Task 1
            Engine->>Agent: Execute Task 1 (Market Landscape)
            Agent->>Guard: Execute Read Tools
            Guard-->>Agent: Auto-allowed (read_safe)
            Agent-->>Engine: Task 1 Output
        and Parallel Leaf Task 2
            Engine->>Agent: Execute Task 2 (Competitive Positioning)
            Agent->>Guard: Execute Read Tools
            Guard-->>Agent: Auto-allowed (read_safe)
            Agent-->>Engine: Task 2 Output
        end
    end

    Note over Engine,CoS: Dependency Resolution Phase
    Engine->>CoS: All leaf dependencies COMPLETED
    Engine->>CoS: Execute Consolidation Task
    CoS->>CoS: Synthesize leaf outputs into Executive Deliverable
    CoS-->>Engine: Final Deliverable Written
    Engine-->>User: Run COMPLETED (Deliverable available)
```

---

## 3. Mid-Run Interruption & Adaptive Re-Planning

When user directives change during active execution, OpenCrewBot avoids starting over. The Chief of Staff immediately cancels pending tasks while preserving completed outputs and re-plans continuation tasks.

```mermaid
flowchart TD
    Start["User triggers POST /api/rooms/[id]/interrupt with new directive"] --> Step1["Fetch active run and list tasks from SQLite"]
    Step1 --> Step2["Filter tasks by status"]
    
    Step2 -->|COMPLETED| Keep["Preserve completed task outputs"]
    Step2 -->|PENDING| Cancel["Mark status: CANCELLED (Reason: Mid-run user interruption)"]
    
    Keep --> Step3["Append directive to Room Memory with provenance tag"]
    Cancel --> Step3
    
    Step3 --> Step4["Log INTERRUPT message in room_collaboration_messages"]
    Step4 --> Step5["Create Adapted Directive Execution task"]
    Step5 --> Step6["Create Adapted Executive Synthesis task depending on new task"]
    Step6 --> Step7["Update Run status to PENDING and trigger ExecutionEngine"]
    Step7 --> Done["Adaptive run executes to completion"]
```

---

## 4. Scoped Persistent Memory Architecture

All agent memory is persisted as human-readable Markdown files on disk across five distinct scopes. OpenCrewBot strictly avoids stale in-memory caching: every agent turn executes a direct disk read (`readFileSync`), guaranteeing that manual evaluator edits take effect immediately.

```mermaid
flowchart LR
    subgraph Scopes ["data/memory/ Hierarchy"]
        A["agents/<agentId>.md"]
        B["rooms/<roomId>.md"]
        C["projects/<projectId>.md"]
        D["user/preferences.md"]
        E["decisions/log.md & tasks/history.md"]
    end

    subgraph Service ["MemoryService Core"]
        Read["Live Disk Read (readFileSync)"]
        Append["Provenance Append (appendFileSync)"]
        Redact["Secret Redaction Engine (Regex)"]
    end

    subgraph Consumer ["Consumers"]
        PromptHydration["System Prompt Hydration (Up to 16KB)"]
        Evaluator["Manual Evaluator Disk Edits"]
        UIMgr["Memory Manager UI View"]
    end

    Evaluator -->|Direct Disk Edit| Scopes
    Scopes -->|Zero Stale Cache| Read
    Read --> PromptHydration
    Read --> UIMgr

    UIMgr -->|Append Entry| Redact
    Consumer -->|Agent Tool Write| Redact
    Redact --> Append
    Append -->|Atomic Write / Synchronous Fallback| Scopes
```

### Standardized Provenance Format:
Every entry written through `MemoryService` adheres to the strict provenance syntax:
```markdown
- [2026-11-23T16:30:00.000Z] | Source: agent-chief-of-staff | Reason: Competitive pricing update | Content: Competitor X announced 20% price reduction across enterprise tiers.
```

---

## 5. Central PermissionGuard & Human-in-the-Loop Governance

To eliminate unauthorized external writes or data loss, all tool invocations must route through the central `PermissionGuard` middleware before reaching external networks or systems.

```mermaid
sequenceDiagram
    autonumber
    participant Agent as Autonomous Agent
    participant Guard as PermissionGuard Middleware
    participant Sanitizer as Secret Sanitizer
    participant DB as SQLite (approval_requests)
    participant UI as Approval Centre UI
    actor Supervisor as Human Supervisor
    participant Tool as Target External Tool (e.g. GitHub/Slack)

    Agent->>Guard: executeTool(toolName, args, permissionLevel)
    Guard->>Guard: classifyToolRisk(toolName)
    
    alt Risk is read_safe and within limits
        Guard->>Tool: Execute read tool directly
        Tool-->>Guard: Result
        Guard->>DB: Log AUTO_ALLOWED to audit_logs
        Guard-->>Agent: Result returned
    else Risk is external_write or sensitive under ASK_FIRST
        Guard->>Sanitizer: Sanitize action preview (strip secrets)
        Sanitizer-->>Guard: Cleaned arguments JSON
        Guard->>DB: Insert PENDING record into approval_requests
        Guard->>Guard: Register one-time execution callback in memory
        Guard-->>Agent: WAITING_APPROVAL (Execution paused)
        
        UI->>DB: Poll pending approvals
        DB-->>UI: Display sanitized request
        
        alt Supervisor Approves
            Supervisor->>UI: Click "Approve & Execute"
            UI->>Guard: approve(approvalId, decisionNote)
            Guard->>DB: Update status: APPROVED
            Guard->>Tool: Execute registered callback
            Tool-->>Guard: Write successful
            Guard->>DB: Log APPROVED to audit_logs
        else Supervisor Rejects
            Supervisor->>UI: Click "Reject"
            UI->>Guard: reject(approvalId, decisionNote)
            Guard->>DB: Update status: REJECTED
            Guard->>Guard: Discard callback from memory
            Guard->>DB: Log REJECTED to audit_logs
            Note over Tool: Tool executed ZERO times
        end
    end
```

---

## 6. Multi-Model Intelligence & Fallback Strategy

OpenCrewBot decouples agents from specific model providers. Providers, models, and fallback pairs are stored in SQLite and can be reconfigured dynamically at runtime without restarting the application.

```mermaid
flowchart TD
    Req["Agent Generates Completion Request"] --> CheckConfig["Query SQLite (agent_model_configs)"]
    
    CheckConfig --> Found{"Agent Config Found?"}
    Found -->|Yes| Primary["Target Primary Provider & Model"]
    Found -->|No| TaskRouting["Default Task-Based Routing (planning -> strong, execution -> fast)"]
    
    TaskRouting --> Primary
    
    Primary --> ExecCloud["Call Cloud API (Nebius / OpenAI / Gemini / Groq)"]
    
    ExecCloud --> Result{"HTTP Status / Network"}
    Result -->|200 OK| Success["Record token usage & cost to model_usage_logs"]
    Result -->|429 Rate Limit / 5xx Error / Network Timeout| Fallback["Trigger Configured Fallback Model"]
    
    Fallback --> ExecOllama["Call Local Offline Ollama (OLLAMA_BASE_URL)"]
    ExecOllama --> SuccessFallback["Record usage with fallback_used = 1"]
```

---

## 7. Scheduled AI Workflows Lifecycle

The `WorkflowScheduler` singleton manages recurring autonomous agent executions using standard cron expressions backed by SQLite persistence.

```mermaid
flowchart TD
    subgraph Setup ["Configuration"]
        Create["POST /api/workflows"]
        Store["Insert scheduled_workflows record (ACTIVE)"]
        Register["Schedule node-cron job in memory"]
    end

    subgraph Trigger ["Execution Triggers"]
        CronTick["Cron Expression Trigger (Scheduled)"]
        ManualRun["POST /api/workflows/[id]/run (Manual)"]
    end

    subgraph Engine ["Autonomous Execution"]
        Dispatch["WorkflowScheduler.runWorkflow(id, triggerType)"]
        RunEngine["Chief of Staff orchestrateGoal(goalPrompt, roomId)"]
        SaveHistory["Insert workflow_runs record (COMPLETED / FAILED)"]
        UpdateNext["Compute and update nextRunAt timestamp"]
    end

    Create --> Store
    Store --> Register
    Register --> CronTick
    
    CronTick --> Dispatch
    ManualRun --> Dispatch
    
    Dispatch --> RunEngine
    RunEngine --> SaveHistory
    SaveHistory --> UpdateNext
```
