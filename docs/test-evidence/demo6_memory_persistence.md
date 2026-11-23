# Demonstration 6: Scoped Markdown Memory Persistence & Zero-Cache Verification

**Timestamp:** `2026-11-23T11:15:06.112Z`  
**File Path on Disk:** `data/memory/agents/agent-chief-of-staff.md`

---

## 1. Step 1: Initial Preference Injected
Appended provenance-tagged memory entry:
```markdown
Executive directive: ALWAYS emphasize INR financial projections with bold formatting.
```

---

## 2. Step 2: Simulated Restart & Instant Recall
Created a completely new `MemoryService` instance (0 shared RAM cache):
- Recall Success: **YES**
- Content Snippet:
```markdown
n: Live disk test | Content: Updated preference: Numbered lists required for all operational milestones.
- [2026-11-23T11:15:06.113Z] | Source: user | Reason: MeetUniversity executive format requirement | Content: Executive directive: ALWAYS emphasize INR financial projections with bold formatting.

```

---

## 3. Step 3: Evaluator Live Disk Edit Verification
Manually appended direct disk content:
```markdown
- [2026-11-23T11:15:06.134Z] | Source: evaluator-manual | Reason: Live disk test | Content: Updated preference: Numbered lists required for all operational milestones.
```

Next turn live disk read verification:
- **Zero-Stale-Cache Result:** **PASSED** (New content immediately visible on the very next agent turn without server restart)
- Full Updated File Snippet:
```markdown
red for all operational milestones.
- [2026-11-23T11:15:06.113Z] | Source: user | Reason: MeetUniversity executive format requirement | Content: Executive directive: ALWAYS emphasize INR financial projections with bold formatting.

- [2026-11-23T11:15:06.134Z] | Source: evaluator-manual | Reason: Live disk test | Content: Updated preference: Numbered lists required for all operational milestones.

```
