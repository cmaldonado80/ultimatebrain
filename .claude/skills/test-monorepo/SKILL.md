---
name: test-monorepo
description: Run the full test suite across the monorepo and report results
allowed-tools: Bash(pnpm *)
---

Run the UltimateBrain test suite:

1. Run `pnpm test` from the project root
2. Parse output for per-package results (web, brain-sdk, worker, etc.)
3. Report total pass/fail count
4. If any failures: show the failing test names and file paths
5. Run `pnpm typecheck` to verify type safety across all 18 packages
6. Report summary: tests passed, typecheck status, any regressions
