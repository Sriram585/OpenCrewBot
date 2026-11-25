---
name: Code Review
triggers:
  - code
  - review
  - typescript
  - refactor
  - pull request
  - security audit
  - architecture
required_tools:
  - codeMode
  - memory
output_format: code_review_report
---

# Code Review Skill

## Methodology
1. **Architectural Analysis**: Inspect separation of concerns, modularity, and adherence to design patterns.
2. **Correctness & Edge Cases**: Verify boundary conditions, null safety, error handling, and concurrency locks.
3. **Security Inspection**: Scan for injection, unredacted secrets, SSRF, memory leaks, and input validation flaws.
4. **Actionable Suggestions**: Provide exact code diffs and concrete refactoring suggestions with rationale.

## Output Format
- Review Summary & Verdict (Approve, Request Changes)
- Security & Robustness Findings
- Performance & Maintainability Opportunities
- Concrete Line-by-Line Code Recommendations
