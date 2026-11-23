// Runnable script & verification runner to execute all MeetUniversity Phase 8 demonstrations
// and generate timestamped verification evidence reports in docs/test-evidence/
import { runAllDemos } from "../src/lib/server/evidence-generator";
import { openClient } from "../src/db/client";
import { seedSpecializedAgents } from "../src/lib/server/agent-factory";
import { seedCollaborationRooms } from "../src/lib/server/collaboration";
import { describe, it, expect } from "vitest";

export async function generateAllEvidence() {
  console.log("=== OpenCrewBot MeetUniversity Evidence Generator ===");
  const client = await openClient(":memory:");
  await seedSpecializedAgents(client);
  await seedCollaborationRooms(client);

  const results = await runAllDemos(client);

  console.log("\n================ EVIDENCE SUMMARY ================");
  for (const r of results) {
    console.log(`[${r.passed ? "PASS" : "FAIL"}] ${r.name}`);
    console.log(`       Markdown: ${r.files.markdown}`);
    console.log(`       JSON:     ${r.files.json}`);
    console.log(`       Summary:  ${r.summary}\n`);
  }

  const allPassed = results.every((r) => r.passed);
  if (!allPassed) {
    throw new Error("One or more demonstrations failed!");
  }

  console.log("All demonstrations completed successfully! Artifacts written to docs/test-evidence/.");
  return results;
}

// When run via vitest:
describe("Evidence Generator Script", () => {
  it("executes all 7 demonstrations + final eval readiness and saves artifacts", async () => {
    const results = await generateAllEvidence();
    expect(results.length).toBe(8);
    expect(results.every((r) => r.passed)).toBe(true);
  }, 45000);
});
