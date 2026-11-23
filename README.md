<div align="center">

<img src="docs/logo.svg" alt="OpenCrewBot mascot" width="96" height="96">

# OpenCrewBot

### Autonomous Multi-Agent Enterprise Operations & Chief of Staff Platform

**An open-source multi-agent collaboration platform with autonomous DAG task execution, intelligent Chief of Staff orchestration, scoped Markdown memory, multi-model intelligence, human approval governance, and 12 business operational interfaces.**

Built with [Next.js](https://nextjs.org), [Mastra](https://mastra.ai), [LibSQL/SQLite](https://github.com/tursodatabase/libsql-client-ts), and [Nebius Token Factory](https://tokenfactory.nebius.com).

![Next.js 16](https://img.shields.io/badge/Next.js-16.4.0-000000?logo=nextdotjs&logoColor=white)
![Mastra](https://img.shields.io/badge/harness-Mastra-6d28d9)
![Vitest](https://img.shields.io/badge/tests-73%20passed-22c55e?logo=vitest&logoColor=white)
![SQLite](https://img.shields.io/badge/storage-LibSQL%20%2F%20SQLite-003B57?logo=sqlite&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Built by Studio1 team](https://img.shields.io/badge/built%20by-Studio1%20team-ff6b1a)](https://studio1hq.com)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Key Features & Implemented Modules](#key-features--implemented-modules)
- [The 12 Business Interfaces](#the-12-business-interfaces)
- [Prerequisites](#prerequisites)
- [Getting Started & Installation](#getting-started--installation)
- [Environment Configuration (`.env`)](#environment-configuration-env)
- [Verification & Automated Test Suite](#verification--automated-test-suite)
- [System Architecture](#system-architecture)
- [Tested Environments](#tested-environments)
- [Troubleshooting](#troubleshooting)
- [Documentation Index](#documentation-index)
- [MIT License & Attribution](#mit-license--attribution)

---

## Overview

OpenCrewBot transforms multi-agent AI into an enterprise-grade operational workforce. Rather than isolated chatbots, OpenCrewBot orchestrates a team of specialized autonomous agents led by an **Intelligent Chief of Staff** that decomposes complex, ambiguous business goals into modular directed acyclic graphs (DAGs), executes independent subtasks in parallel, coordinates inter-agent challenge and verification in collaborative rooms, and synthesizes final executive deliverables.

Every agent operates with **scoped persistent Markdown memory** on disk with live reads (zero stale cache), strict **PermissionGuard** human-in-the-loop governance with automatic credential sanitization, **multi-model routing** across cloud and local Ollama endpoints with automatic fallbacks, and real integrations with GitHub, Slack, and MCP tools.

---

## Key Features & Implemented Modules

### 1. Intelligent Chief of Staff & Autonomous DAG Engine (Modules A & D)
- **Goal Decomposition:** Breaks high-level business goals into a structured DAG of parallel tasks with explicit dependencies, timeouts, retries, and an automatic final `Consolidation` deliverable task.
- **Parallel Execution:** Concurrent execution of independent tasks via `Promise.allSettled()` with crash recovery (`recoverIncompleteRuns`) and pause/resume on human approval.
- **Mid-Run Interruption & Adaptive Re-planning:** Inject new user directives mid-flight via `POST /api/rooms/[id]/interrupt`. Automatically cancels unexecuted tasks while preserving completed outputs, adaptively replans the DAG, and executes to completion.

### 2. Multi-Agent Collaboration & Specialized Team (Modules B & C)
- **8 Pre-Seeded Specialized Agents:** Chief of Staff, Market Researcher, Competitor Analyst, Marketing Strategist, Content Creator, Data Analyst, Senior Code Reviewer, and Automation Ops.
- **Dynamic Natural-Language Agent Factory:** Synthesizes new specialized agent profiles, tools, system prompts, permission levels, and initialized scoped memory from a single prompt via `POST /api/agents/create-from-prompt`.
- **4 Pre-Seeded Cross-Functional Rooms:** Executive Strategy Room, Marketing Studio, Engineering War Room, and Business Analytics Room.
- **Structured Inter-Agent Messaging:** Type-safe collaboration messages (`DELEGATE`, `QUESTION`, `SHARE`, `CHALLENGE`, `VERIFY`, `RESULT`, `INTERRUPT`) with loop guards (max 12 turns, max delegation depth 3).

### 3. Persistent Scoped Markdown Memory (Module E)
- **5 Scopes on Disk:** Agent memory (`agents/`), Room memory (`rooms/`), Project memory (`projects/`), User preferences (`user/`), and Decision logs (`decisions/`, `tasks/`).
- **Standardized Provenance Format:** `- [<ISO_TIMESTAMP>] | Source: <user|agentId|taskId> | Reason: <why remembered> | Content: <fact>`.
- **Zero Stale Cache (Live Disk Reads):** Directly reads from disk on every turn; manual file edits by evaluators or operators are immediately recognized on the very next agent turn.
- **Automated Secret Redaction:** Regex-based sanitization that redacts API keys, bearer tokens, private keys, and passwords before any file write.

### 4. Human Governance & Autonomy (Module G)
- **3 Explicit Permission Levels:**
  - `ASK_FIRST`: Every external, write, or sensitive action requires human supervisor authorization.
  - `CONTROLLED_ACCESS`: Pre-approved read-safe tools execute autonomously within rate limits (e.g. 10 calls/run); external writes require approval.
  - `FULL_ACCESS`: Autonomous execution with complete immutable audit logging.
- **Central PermissionGuard Middleware:** Wraps all tool executions. Intercepts external writes, stores sanitized payloads (passwords/tokens redacted), registers one-time callbacks, and logs every invocation to SQLite `audit_logs`.

### 5. Multi-Model Intelligence & Token Economics (Module J)
- **Multi-Provider Model Router:** Supports Nebius Token Factory, OpenAI, Google Gemini, Groq, and local offline Ollama endpoints (`http://127.0.0.1:11434/v1`).
- **Per-Agent Routing & Fallbacks:** Configure primary and fallback models per agent; automatic retry on 429 rate limits, 5xx server errors, or network disconnects.
- **Task-Based Routing:** Fast/cost-effective models for execution/routine tasks; strong reasoning models for planning and consolidation.
- **Mock Mode:** When no API keys are provided, seamlessly runs in offline mock mode with explicit `[MOCKED]` prefixes on all outputs and tool invocations.

### 6. Reusable Skills, Deterministic Tools & Integrations (Modules F, H & I)
- **8 Markdown Skills in `data/skills/`:** Market Research, Competitor Analysis, Financial Modelling, Presentation Creation, Email Drafting, Code Review, Data Analysis, and Lead Generation.
- **Deterministic Business Tools:** `analyze_csv` (exact arithmetic statistics, revenue group-by aggregations, conversion drop-off calculations, and SVG-ready chart JSON) and `web_fetch_research` (real live HTML fetcher and sanitizer).
- **Working Live Integrations:** GitHub REST API (repo inspection, issue creation with approval guard), Slack webhooks/bot messaging, Model Context Protocol (MCP) servers, and clearly labeled simulated Gmail.
- **Scheduled AI Workflows:** Automated recurring multi-agent executions on standard cron expressions via `workflowScheduler`.

---

## The 12 Business Interfaces

OpenCrewBot features 12 fully functional interfaces in a single unified Next.js application, accessible via the sidebar navigation:

| # | Interface | Component | Description & Backend API Binding |
| :- | :--- | :--- | :--- |
| **1** | **Agent Workspace** | `AgentWorkspaceView.tsx` | Complete roster of 8 seeded + dynamic agents with roles, model config, skills, and permission badges. |
| **2** | **Individual Conversations** | `ChatView.tsx` | 1-on-1 direct messaging (`dm:<botId>`) with streaming output, tool call inspection, and browser live view. |
| **3** | **Multi-Agent Rooms** | `ChatView.tsx` + `RoomCollaborationFeed.tsx` | Group chat (`room:<roomId>`) with real-time Collaboration Feed (`GET /api/rooms/[id]/collaboration`) and **Interrupt & Re-plan** input (`POST /api/rooms/[id]/interrupt`). |
| **4** | **Dynamic Agent Creation** | `DynamicAgentCreateView.tsx` | Natural language agent synthesizer (`POST /api/agents/create-from-prompt`) displaying spec and memory path. |
| **5** | **Memory Manager** | `MemoryManagerView.tsx` | Browse 5 memory scopes (`GET /api/memory`), view raw Markdown (`GET /api/memory/file`), edit & save (`PUT /api/memory/file`), and append provenance entries (`POST /api/memory/append`). |
| **6** | **Skills & Tools Manager** | `SkillsManagerView.tsx` | Catalog of 8 Markdown skills (`GET /api/skills`), in-app playbook editor (`PUT /api/skills/[id]`), and tools catalog. |
| **7** | **Task Execution Dashboard** | `TaskDashboardView.tsx` | Launch goals via Chief of Staff (`POST /api/orchestrate`), monitor live DAG tasks (`GET /api/runs/[id]`), cancel runs (`POST /api/runs/[id]/cancel`), and render SVG/CSS Bar & Funnel charts. |
| **8** | **Approval Centre** | `ApprovalCentreView.tsx` | Pending authorizations queue (`GET /api/approvals`), sanitized payload previews, Approve/Reject/Cancel actions, and live SQLite Audit Log table. |
| **9** | **Integration Manager** | `IntegrationsView.tsx` | Integration hub (`GET /api/integrations`) with explicit `LIVE`, `MOCKED`, and `UNCONFIGURED` colored badges and setup guides. |
| **10** | **Model Configuration** | `ModelConfigView.tsx` | Per-agent provider/primary model/fallback editor (`GET/POST /api/models/config`) and real-time token/cost tracking metrics (`GET /api/models/usage`). |
| **11** | **Scheduled Workflows** | `ScheduledWorkflowsView.tsx` | Cron workflow manager (`GET/POST /api/workflows`), **Run Now** (`POST /api/workflows/[id]/run`), **Pause/Resume** (`POST /api/workflows/[id]/toggle`), and execution history. |
| **12** | **Execution History** | `ExecutionHistoryView.tsx` | Audit log of past runs (`GET /api/runs`), task breakdown drawers, error traces, and **Download Deliverable (.md)** export. |

---

## Prerequisites

- **Node.js:** `>= 20.0.0` (Tested extensively on Node.js `v26.13.0` and `v22.13.0`)
- **Package Manager:** `pnpm >= 9.0.0` (Recommended: `pnpm 11.21.0`)
- **Git**

---

## Getting Started & Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Studio1-OSS/OpenCrewBot.git
   cd OpenCrewBot
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   *(All keys are optional. Without keys, OpenCrewBot operates seamlessly in offline Mock Mode).*

4. **Run development server:**
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Build and run for production:**
   ```bash
   pnpm build
   pnpm start
   ```

---

## Environment Configuration (`.env`)

All secrets and configuration are kept in `.env` and read securely by the server:

```ini
# Multi-Model Provider API Keys (All optional - mock mode active if omitted)
NEBIUS_API_KEY=your_nebius_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# Local Offline Ollama Endpoint
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1

# Integrations
GITHUB_TOKEN=ghp_your_github_personal_access_token
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_BOT_TOKEN=xoxb-...

# Research & Browser Tools
TAVILY_API_KEY=tvly-your_tavily_key
BROWSERBASE_API_KEY=your_browserbase_key
BROWSERBASE_PROJECT_ID=your_browserbase_project_id

# Storage Directory
OPENCREWBOT_DATA_DIR=./data
```

---

## Verification & Automated Test Suite

OpenCrewBot includes a comprehensive automated test suite covering all modules, services, database operations, and end-to-end business demonstrations.

### Run All Unit & E2E Tests:
```bash
pnpm test
```
*Executes all 73 tests across 10 test files:*
- `src/lib/server/memory.test.ts` (Scoped memory, provenance, secret redaction, live disk reads)
- `src/lib/server/permissions.test.ts` (PermissionGuard, risk classification, approval requests, rejection)
- `src/db/index.test.ts` (Database schema, CRUD, version migrations)
- `src/lib/server/agent-factory.test.ts` (Specialized agents, dynamic agent prompt synthesis)
- `src/lib/server/execution-engine.test.ts` (DAG execution, parallel branches, timeouts, retries, crash recovery)
- `src/lib/server/orchestration.test.ts` (Chief of Staff planning, consolidation, mid-run interruption, collaboration)
- `src/lib/server/capabilities.test.ts` (CSV analytics, web fetcher, skills loader, scheduled routines)
- `src/lib/server/models.test.ts` (Multi-provider routing, fallbacks, token cost tracking, mock prefixes)
- `src/lib/server/demos-e2e.test.ts` (Phase 8 MeetUniversity demonstrations 1 through 7 + evaluation readiness)
- `scripts/generate_evidence.ts` (Master demonstration evidence runner)

### Generate Phase 8 Evidence Artifacts:
```bash
pnpm run evidence
```
Executes all demonstrations through the live backend engines and saves timestamped Markdown and JSON artifacts to `docs/test-evidence/`.

### TypeScript Typecheck:
```bash
pnpm exec tsc --noEmit
```

---

## System Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full architectural specifications and detailed Mermaid sequence diagrams.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Next.js 16.4.0 Frontend                               │
│  (12 Business Interfaces: Workspaces, DAG Task Dashboard, Approvals, Memory)   │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ HTTP / REST & Server-Sent Events (/api/events)
┌──────────────────────────────────────▼──────────────────────────────────────────┐
│                             OpenCrewBot Core Engine                             │
│                                                                                 │
│   ┌────────────────────────┐  DAG Execution   ┌─────────────────────────────┐   │
│   │ Intelligent Chief of   ├─────────────────►│   Autonomous DAG Execution  │   │
│   │ Staff (Decomposition,  │                  │   Engine (Parallel Branches,│   │
│   │ Mid-Run Interruption)  │◄─────────────────┤   Retries, Crash Recovery)  │   │
│   └───────────┬────────────┘  Completed Tasks └──────────────┬──────────────┘   │
│               │                                              │                  │
│               ▼                                              ▼                  │
│   ┌────────────────────────┐                  ┌─────────────────────────────┐   │
│   │ Persistent Scoped      │                  │ Central PermissionGuard     │   │
│   │ Memory Service (Disk)  │                  │ Middleware (ASK_FIRST,      │   │
│   └────────────────────────┘                  │ Sanitization, Audit Logs)   │   │
│                                               └──────────────┬──────────────┘   │
│                                                              │                  │
│                                               ┌──────────────▼──────────────┐   │
│                                               │ Multi-Provider Model Router │   │
│                                               │ (Nebius, Ollama, OpenAI)    │   │
│                                               └─────────────────────────────┘   │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────────┐
│                   Storage & External Integration Layer                          │
│   SQLite (data/opencrewbot.db)  │  Scoped Markdown Files (data/memory/)         │
│   GitHub REST API               │  Slack Webhook                              │
│   Model Context Protocol (MCP)  │  Deterministic CSV Analytics                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Tested Environments

- **Operating System:** Windows 11 (build tested on Windows PowerShell and Command Prompt)
- **Node.js Version:** `v26.13.0` (LTS Node 22/24 compatible)
- **Package Manager:** `pnpm 11.21.0`
- **Database Engine:** LibSQL / SQLite embedded (`@libsql/client v0.18.0`)
- **Web Framework:** Next.js `16.4.0` (Turbopack compiler)

---

## Troubleshooting

- **Windows File Locking / EPERM on Memory Edits:**
  If another process or OneDrive lock holds an open read handle on a `.md` file, the memory system automatically falls back from atomic rename to direct synchronous overwrite to ensure writes succeed without data loss.
- **Port In Use (3000):**
  Run `pnpm dev -p 3001` or free port 3000 using PowerShell:
  ```powershell
  Get-Process -Name "node" | Stop-Process -Force
  ```
- **Offline / Local Ollama Usage:**
  Ensure Ollama is running (`ollama serve`). Configure `OLLAMA_BASE_URL=http://127.0.0.1:11434/v1` in `.env`.

---

## Documentation Index

- [ARCHITECTURE.md](./ARCHITECTURE.md): Complete system architecture, execution models, and Mermaid diagrams.
- [LIVE_VS_MOCKED.md](./LIVE_VS_MOCKED.md): Transparent classification of live capabilities vs. simulated fallback modes.
- [COSTS_AND_DEPENDENCIES.md](./COSTS_AND_DEPENDENCIES.md): Token economics, API cost projections, and open-source license audits.
- [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md): Documented edge cases, scalability boundaries, and security advisories.
- [docs/test-evidence/](./docs/test-evidence/): Timestamped evidence reports and JSON dumps for all 7 MeetUniversity demonstrations + evaluation readiness.

---

## MIT License & Attribution

OpenCrewBot is open-source software licensed under the **MIT License**.

Original foundation created by **Studio1HQ** ([Studio1-OSS/OpenCrewBot](https://github.com/Studio1-OSS/OpenCrewBot)).  
Copyright (c) 2026 Studio1HQ. See [LICENSE](./LICENSE) for details.
