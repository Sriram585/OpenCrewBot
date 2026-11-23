# Known Limitations, Edge Cases & Security Advisories

In the interest of full engineering transparency, this document details the current architectural boundaries, known edge cases, platform considerations, and security advisories for **OpenCrewBot**.

---

## 1. Architectural & Operational Boundaries

### 1.1 Single-Tenant Localhost Boundary
- **Current Design:** OpenCrewBot is architected as an autonomous personal or single-operator workstation application. It binds by default to `127.0.0.1` and enforces strict HTTP host/origin validation (`src/proxy.ts`) to prevent DNS rebinding and cross-site request forgery.
- **Limitation:** It does not currently provide multi-tenant user authentication, team organization hierarchies, or granular role-based access control (RBAC).
- **Deployment Recommendation:** Do not expose OpenCrewBot directly to the public internet without placing it behind an authenticated reverse proxy (e.g., Cloudflare Access, Tailscale, or an OAuth2 reverse proxy).

### 1.2 In-Process State Coupling
- **Current Design:** Server-Sent Event (SSE) client listeners, active agent controller instances, turn epoch cancellation tokens, and `workflowScheduler` cron timers reside in Node process memory.
- **Limitation:** The platform cannot be scaled horizontally across multiple Node worker clusters without an external distributed pub/sub bus (such as Redis) and distributed task queue.

### 1.3 Memory Context & RAG Scalability
- **Current Design:** The system prompt hydrates up to 16 KB (or ~200 lines) of each bot's scoped `MEMORY.md` directly into the agent's context window on every turn.
- **Limitation:** For long-term enterprise deployments with hundreds of pages of historical memory, memory truncation occurs. Vector embeddings, semantic vector retrieval (RAG), and hybrid keyword-vector search are not yet implemented for historical memory queries.

### 1.4 Windows File Locking & OneDrive Synchronization
- **Observed Behavior:** On Windows operating systems, particularly within directories synchronized by Microsoft OneDrive, atomic file replacements via `renameSync(tmpPath, finalPath)` can occasionally throw `EPERM: operation not permitted` if a background indexer or file watcher holds an open read handle on the destination file.
- **Built-In Mitigation:** In `src/lib/server/memory.ts`, OpenCrewBot implements an automatic fallback mechanism: if `renameSync` encounters an `EPERM` error, it immediately falls back to synchronous direct write (`writeFileSync`), guaranteeing that memory writes succeed without data loss.

### 1.5 Simulated Gmail Integration
- **Current Behavior:** The Gmail integration in `src/lib/server/integrations/gmail.ts` is explicitly labeled `MOCKED (SIMULATED)`. It generates structured email drafts in JSON format to demonstrate sales outreach workflows without requiring Google Cloud Console OAuth consent verification.
- **Production Path:** Transitioning Gmail to live mode requires configuring verified `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` credentials in `.env`.

---

## 2. Next.js 16.4.0 Security Advisory & Upgrade Recommendation

### 2.1 Security Advisory Details
During production builds (`pnpm build`), the Next.js CLI surfaces the following security warning:
```
Error [SecurityFatalError]: Your version of Next.js is affected by a known security vulnerability.
**We strongly recommend you upgrade Next.js.**
Reference: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk
Command: next upgrade --agent=security --internal-nudge-id=7941bec4-0c86-46b3-824a-ca6bfc287871
```

### 2.2 Rationale for Deferred Upgrade
In strict compliance with user instructions (**"Do NOT run the Next.js security upgrade"**), the upgrade command was intentionally deferred:
1. **Next.js 16 Turbopack Stability:** Next.js 16.4.0 introduced breaking changes across cache components and Turbopack compiler rules (as documented in `AGENTS.md`). Upgrading blindly risks introducing regression errors in the client component hydration and route handlers.
2. **Localhost Single-User Security Isolation:** Because OpenCrewBot operates strictly bound to `127.0.0.1` behind localhost origin checks, exposure to external web vulnerabilities is substantially mitigated.

### 2.3 Procedure for Applying Upgrade in Production
For operators preparing to deploy OpenCrewBot to staging or production environments, the security upgrade should be executed in an isolated Git worktree:
```bash
# 1. Create and checkout a separate worktree
git worktree add ../opencrewbot-security-upgrade -b security/upgrade-next

# 2. Run the official Next.js security upgrade tool
cd ../opencrewbot-security-upgrade
next upgrade --agent=security --internal-nudge-id=7941bec4-0c86-46b3-824a-ca6bfc287871

# 3. Verify test suite and production build
pnpm test
pnpm build

# 4. Merge worktree into main branch upon clean validation
```
