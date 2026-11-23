# OpenCrewBot Feature Audit

**Date:** 2026-11-23  
**Audit Scope:** Full repository inspection of OpenCrewBot (`Studio1-OSS/OpenCrewBot`) codebase without modifying application logic.

---

## 1. Features Already Implemented

### 1.1 Bot Management & Custom Personas
- **Full Bot CRUD:** Complete create, read, update, and delete lifecycle for autonomous bots.
- **Customizable Bot Attributes:** Name, custom handle (unique slug for `@mentions`), role title, description, color, emoji avatar, custom system prompt instructions (up to 8,000 characters), pinned status, and approval policy.
- **Per-Bot Model Assignment:** Each bot can be assigned an individual open-source model from Nebius Token Factory or static catalog.
- **Per-Bot Tool Configuration:** Independent toggles for Web Search, Memory, Code Mode, Cloud Browser, and Ask User questions.
- **Per-Bot Connection Mapping:** Connect individual bots to specific external MCP servers or Composio apps.
- **Unread & Typing Status:** Tracking of unread message counts per conversation and real-time typing/running status.

### 1.2 Multi-Agent Group Rooms & Routing
- **Group Rooms:** Chat rooms containing multiple member bots with custom topic, emoji, and lead bot assignment.
- **Explicit Mention Routing:** `@botname` directs replies to that specific bot; `@everyone` or `@all` triggers responses from all room members sequentially.
- **Autonomous Bot-to-Bot Hand-offs:** Bots can `@mention` teammates within their response text; the room runner queues and executes hand-offs up to a maximum depth of 2 hops (`MAX_HANDOFF_DEPTH = 2`).
- **Context Catch-up:** Member bots automatically receive the slice of conversation since they last spoke (up to 30 recent lines) formatted with author prefixes.
- **Routing Modes:** Supported room responder modes: `auto` (Jev routing with fallback to lead), `lead` (room leader answers), and `everyone` (all member bots reply).

### 1.3 Memory System
- **Per-Bot Markdown Memory Files:** Dedicated durable storage file at `data/workspaces/<botId>/MEMORY.md`.
- **System Prompt Hydration:** First 200 lines / 16 KB of `MEMORY.md` automatically injected into the bot's system prompt on each turn.
- **Automated Memory Tools:**
  - `memory_add`: Appends single-line durable facts, preferences, or decisions with timestamp and optional section headings.
  - `memory_edit`: Targeted exact-match string replacement/removal in `MEMORY.md`.
- **Secret Redaction:** Regex-based sanitization that strips API keys (`sk-`, `ghp-`, `tvly-`, AWS `AKIA`, private keys, passwords) before persisting memory.
- **In-App Memory Editor:** Real-time editable textarea in the Inspector panel with live synchronization via SSE `memory-changed` events.

### 1.4 Real-Time Streaming & Event Bus
- **Single SSE Stream:** `/api/events` provides server-sent events for all active clients, delivering message snapshots, incremental text deltas, reasoning deltas, typing states, and roster updates.
- **In-Process Pub/Sub:** In-memory broadcast bus (`bus.ts`) distributing events across active SSE connections.
- **Turn Folding:** Mastra `AgentControllerEvent` stream folded into a unified `ChatMessage` entity, handling text deltas, reasoning blocks, and tool statuses.
- **Execution Controls:** Stop conversation button immediately aborts active sessions and cancels queued turns via generation/epoch tracking.

### 1.5 Tool Integrations & Execution
- **Web Search & Extraction:** Tavily-powered web search (`web_search`), page reader (`read_page`), and site crawl (`crawl_site`) with sources extracted and rendered in chat bubbles.
- **Code Mode:** Multi-tool TypeScript execution in an isolated WebAssembly QuickJS sandbox (`@mastra/quickjs`), allowing agents to perform multi-step computation and parallel tool calls in one round-trip.
- **Human-in-the-Loop Approvals:**
  - `ask` vs. `full` permission tiers.
  - Interactive approval cards for destructive actions (Allow once / Deny).
- **Interactive Question Cards:** `ask_user` tool allows bots to pause execution, present multiple-choice option buttons to the user, and resume upon user selection.
- **External App Connections (Composio):** OAuth integration for 1,000+ third-party tools (Slack, GitHub, Gmail, Google Calendar, Notion, Linear, Jira, Google Drive) with tool schema search and execution.
- **Remote MCP Servers:** Connect custom remote Model Context Protocol (MCP) servers via HTTP with Bearer token authentication and custom headers; built-in connection testing.
- **Cloud Browser (Browserbase):** CDP-driven cloud browser sessions with embedded live view iframe and user takeover support.

### 1.6 Storage & Persistence
- **Local Embedded Database:** LibSQL / SQLite database (`data/opencrewbot.db`) storing `bots`, `rooms`, `messages`, `settings`, and `conversations`.
- **Mastra Thread Store:** Dedicated LibSQL store (`data/mastra.db`) managing low-level agent thread history and session checkpoints.
- **Workspace Directory:** Automatic creation and directory isolation under `data/workspaces/`.

### 1.7 Security & Host Guard
- **Localhost Guard Proxy:** Next.js proxy middleware in `src/proxy.ts` checking `host`, `sec-fetch-site`, and `origin` headers to prevent DNS rebinding and cross-origin attacks without requiring external auth.

---

## 2. Features Partially Implemented

| Feature | Current State | Missing / Incomplete Logic |
| :--- | :--- | :--- |
| **Jev Autonomous Routing** | Implemented in `src/lib/server/jev.ts` via TypeSafe System One API. | If `TYPESAFE_API_KEY` is not provided, or if latency exceeds 2500ms, or if choice confidence is below 0.55, it silently defaults to the room's lead bot. Automatic per-message model routing (picking cheap vs. heavy model per task) is marked as "coming soon" in UI (`ModelPicker.tsx`). |
| **MCP Protocol Support** | Supports remote HTTP MCP servers (`@mastra/mcp`). | Does not support local stdio-based MCP servers (spawning local subprocesses). Only HTTP/HTTPS endpoints are accepted. |
| **Cloud Browser Fallback** | Driven via remote Browserbase API. | No local headless browser fallback (e.g. local Chromium or Puppeteer) if `BROWSERBASE_API_KEY` is absent. Browser tool simply cannot be activated without third-party credentials. |
| **Composio Account Isolation** | Shared single-user account model. | All bots and sessions share a single global `composio.userId` stored in settings (`opencrewbot-<uuid>`), lacking per-user or per-bot credential boundaries. |
| **Code Mode Tool Scope** | Runs in QuickJS sandbox. | Only built-in tools passed into the sandbox can be called; dynamically registered MCP tools or Composio tools are not bridged into Code Mode. |

---

## 3. Features That Are Simulated or Mocked

| Feature / Component | Mock Implementation Details |
| :--- | :--- |
| **Mock Language Model** | `src/lib/server/mock-model.ts` uses Mastra's `MastraLanguageModelV2Mock`. Active whenever `NEBIUS_API_KEY` is missing. Pattern-matches user text for keywords (`remember`, `search`, `ask me`, `open http...`) to trigger simulated responses, question cards, and actual tool runs without an LLM key. |
| **Static Model Catalog** | When `NEBIUS_API_KEY` is unset or Nebius API is unreachable, `src/lib/server/models.ts` falls back to a hardcoded array of 18 static model profiles (`STATIC`). |
| **Demo Screenshots & Assets** | `docs/screenshots/` (hero.png, room.png, memory.png, approval.png) display staged conversation examples for documentation. |
| **Seed Data** | `src/lib/server/service.ts` seeds three initial mock bots (Scout, Quill, Atlas) and one room (Studio) on first boot marked by `data/.seeded`. |

---

## 4. Existing Architectural Limitations

1. **Single-Tenant Localhost Architecture:**
   - Designed exclusively for a single local user. No user accounts, sessions, or role-based access control.
   - Relies on 127.0.0.1 binding and header checks; exposing to a public network directly exposes database and bot actions.
2. **In-Process State Coupling:**
   - Active agent controllers, turn queues (`chains`), SSE listeners, and Browserbase sessions are stored in Node global variables (`globalThis.__opencrewbotRuntime`).
   - The application cannot be scaled horizontally across multiple Node worker processes or serverless functions.
3. **Unstructured Database Schema:**
   - SQLite tables store entities as JSON blobs (`id TEXT PRIMARY KEY, data TEXT NOT NULL`).
   - Querying requires client-side JSON parsing and in-memory sorting/filtering, limiting scalability with large message histories.
4. **Prompt & History Limits:**
   - `MEMORY.md` is hard-truncated to 200 lines or 16 KB.
   - Room catch-up history is capped at 30 messages. No vector embeddings, RAG, or semantic search is implemented for past chat context.
5. **Disabled Mastra Subagent & Task Framework:**
   - Mastra's built-in subagent tools (`subagent`, `submit_plan`, `task_write`, `task_update`, `task_complete`, `task_check`) are explicitly disabled in `AgentController` configuration. Bot delegation currently only happens through room `@mentions`.

---

## 5. Exact File Paths

### Agents & Runtime Harness
- **Agent Controller & Turn Execution:** `src/lib/server/runtime.ts`
- **System Prompt Builder:** `src/lib/server/prompt.ts`
- **Bot & Room Business Logic / Seeding:** `src/lib/server/service.ts`
- **Server Event Bus (SSE):** `src/lib/server/bus.ts`

### Routing & Multi-Agent Coordination
- **Room Multi-Agent Orchestration & Hand-offs:** `src/lib/server/rooms.ts`
- **Jev (TypeSafe) Decision Model Routing:** `src/lib/server/jev.ts`

### Memory
- **File-based Memory & Secret Redaction:** `src/lib/server/memory-files.ts`
- **Memory API Endpoints:** `src/app/api/bots/[id]/memory/route.ts`
- **Memory Editor Component:** `src/components/BotForms.tsx` (`MemoryEditor`)

### Tools & Integrations
- **Core Toolset & Code Mode:** `src/lib/server/tools.ts`
- **Connectors Aggregator (Composio + MCP):** `src/lib/server/connectors.ts`
- **Composio App Client:** `src/lib/server/composio.ts`
- **MCP Client & Server Manager:** `src/lib/server/mcp-servers.ts`
- **Browserbase Cloud Browser Manager:** `src/lib/server/browserbase.ts`

### Model Clients & Selection
- **Nebius Token Factory Client & Catalog:** `src/lib/server/models.ts`
- **Scripted Mock Model:** `src/lib/server/mock-model.ts`
- **Model Picker Modal Component:** `src/components/ModelPicker.tsx`

### UI Views & Components
- **Application Page Entry:** `src/app/page.tsx`
- **Root Layout:** `src/app/layout.tsx`
- **Application State & Container:** `src/components/OpenCrewBotApp.tsx`
- **Client Reducer & State:** `src/lib/client/store.ts`
- **Client API Client:** `src/lib/client/api.ts`
- **Sidebar (Bots, Rooms, Unreads):** `src/components/Sidebar.tsx`
- **Chat View & Composer:** `src/components/ChatView.tsx`
- **Message Rendering & Cards:** `src/components/Message.tsx`
- **Inspector Pane (Details, Memory, Browser):** `src/components/Inspector.tsx`
- **Bot Creation & Edit Drawers:** `src/components/BotForms.tsx`
- **Room Creation & Edit Drawers:** `src/components/RoomForms.tsx`
- **Connections Modal (Composio / MCP):** `src/components/ConnectionsPanel.tsx`
- **Settings Modal:** `src/components/SettingsPanel.tsx`
- **Shared Primitives:** `src/components/ui.tsx`
