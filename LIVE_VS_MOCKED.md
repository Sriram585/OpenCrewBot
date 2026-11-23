# Live vs. Mocked Feature Verification Matrix

In strict compliance with **AGENT_RULES.md** ("Never hard-code demo responses or fake live integrations; clearly label every simulated output as MOCKED"), this document provides an honest, transparent breakdown of every component, integration, model client, and tool in OpenCrewBot.

---

## 1. Summary Status Matrix

| Component / Subsystem | Operational Status | Live Network / Execution Details | Mock / Fallback Behavior |
| :--- | :--- | :--- | :--- |
| **Multi-Provider Model Router** | **LIVE** *(Multi-Provider)* | Real API calls to Nebius, OpenAI, Gemini, Groq, or local Ollama endpoints when keys are present. | When no API keys are provided in `.env`, falls back to deterministic mock model. All responses and tool results are explicitly prefixed with `[MOCKED]`. |
| **Autonomous DAG Execution Engine** | **LIVE** | 100% real runtime DAG scheduling via `Promise.allSettled()`, concurrency limits, retry counters, and crash recovery. | None. Fully autonomous production engine. |
| **Chief of Staff Orchestrator** | **LIVE** | Real goal decomposition into DAGs, leaf task dependency mapping, and dynamic mid-run interruption & re-planning. | Uses deterministic multi-step planning algorithms in Mock Mode. |
| **Scoped Markdown Memory** | **LIVE** | Real file I/O operations directly to disk (`data/memory/`). Every turn performs live reads (`readFileSync`) with zero stale cache. | None. Real disk operations with automatic secret redaction. |
| **PermissionGuard Governance** | **LIVE** | Real middleware wrapping all tool executions, inserting SQLite approval requests, and recording immutable audit logs. | None. Real authorization lifecycle with one-time callbacks. |
| **GitHub REST Integration** | **LIVE** | Real HTTPS calls to GitHub REST API (`https://api.github.com`). Read operations work publicly; write operations (`createIssue`) are gated by `PermissionGuard`. | If `GITHUB_TOKEN` is unset, read operations still query public repos; rate limit failures fall back gracefully. |
| **Slack Webhook Integration** | **LIVE** | Real HTTPS POST calls to configured `SLACK_WEBHOOK_URL` / Bot Token. All posts are gated by `PermissionGuard`. | If `SLACK_WEBHOOK_URL` is omitted in `.env`, marked as `UNCONFIGURED` in Integrations Hub. |
| **Model Context Protocol (MCP)** | **LIVE** | Real HTTP MCP client connecting to remote servers, fetching schemas, and calling tools. | If no MCP server is registered in settings, reported as `UNCONFIGURED`. |
| **Scheduled AI Workflows** | **LIVE** | Real `node-cron` scheduling singleton dispatching runs on cron ticks with SQLite `workflow_runs` logging. | None. Real timer-based scheduler with manual on-demand execution. |
| **CSV Business Analytics (`analyze_csv`)** | **LIVE** | Real deterministic TypeScript calculation engine computing exact arithmetic sums, means, medians, segment revenue, and drop-offs. | None. Pure mathematics with zero hallucination. |
| **Live Web Fetcher (`web_fetch_research`)** | **LIVE** | Real HTTP client fetching live web pages with HTML cleanup and title extraction. | Enforces strict timeout; reports explicit errors if unreachable. |
| **Gmail Draft Integration** | **MOCKED (SIMULATED)** | Explicitly labeled as simulated/mocked in Integrations Hub and code comments. Generates structured draft previews. | Simulated draft creation to demonstrate email workflows without requiring OAuth app verification. |
| **Cloud Browser (Browserbase)** | **LIVE / CONDITIONAL** | Real CDP connection driving remote Chromium browser sessions via Browserbase when `BROWSERBASE_API_KEY` is provided. | If `BROWSERBASE_API_KEY` is absent, reported as unconfigured; browser sessions cannot be spawned without credentials. |

---

## 2. In-Depth Operational Behavior

### 2.1 Multi-Model Intelligence & Mock Mode
- **Live Providers:**
  When configured with valid `.env` keys, completion requests query:
  - `nebius`: Meta-Llama-3.3-70B-Instruct, DeepSeek-V3, Qwen-2.5-Coder.
  - `openai`: GPT-4o, GPT-4o-mini.
  - `gemini`: Gemini 2.5 Flash, Gemini 2.5 Pro.
  - `groq`: Llama-3.3-70B-Versatile.
  - `ollama`: Offline local HTTP endpoint (`http://127.0.0.1:11434/v1`).
- **Mock Mode Behavior:**
  When `NEBIUS_API_KEY` and third-party keys are absent:
  - Automatically activates Mastra's mock language model.
  - **Mandatory Prefixing:** Every mock output begins with `[MOCKED] ` so evaluators and operators are never misled into confusing simulated LLM responses with live inference.
  - **Simulated Tool Outputs:** Tool calls processed under mock mode append `[MOCKED Tool Result]` to all generated results.

### 2.2 Scoped Persistent Memory
- **Disk Storage:**
  All memories exist as durable `.md` files in `data/memory/` across 5 scopes:
  1. `agents/<agentId>.md`
  2. `rooms/<roomId>.md`
  3. `projects/<projectId>.md`
  4. `user/preferences.md`
  5. `decisions/log.md` and `tasks/history.md`
- **Zero Stale Cache:**
  No in-memory cache is used for memory content. If an evaluator edits any `.md` file directly on disk while the server is running, the very next agent turn reads the exact newly written disk content.

### 2.3 PermissionGuard & Human-in-the-Loop Governance
- **Strict Enforcement:**
  Under `ASK_FIRST` or `CONTROLLED_ACCESS`, any mutating external call (e.g., `github_create_issue`, `slack_post_message`) halts immediately.
- **Sanitized Action Previews:**
  Credentials (tokens, passwords, authorization headers) are automatically stripped using regex secret redaction before being saved to SQLite table `approval_requests`.
- **Zero Execution on Rejection:**
  When a supervisor rejects an approval request, the pending callback is deleted from memory, ensuring the external tool executes **exactly zero times**.

### 2.4 Integrations Hub Status Indicators
In the Next.js frontend **Integrations Hub** view (`IntegrationsView.tsx`), each integration displays an explicit, color-coded badge:
- **`LIVE` (Emerald):** Service is fully configured with valid environment credentials and ready for real network traffic.
- **`MOCKED (SIMULATED)` (Amber):** Service runs simulated mocks (e.g. Gmail) to demonstrate workflow capabilities without external credentials.
- **`UNCONFIGURED` (Zinc/Gray):** Service lacks required `.env` credentials (e.g. missing `SLACK_WEBHOOK_URL` or `GITHUB_TOKEN`).
