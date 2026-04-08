---
name: deploy-check
description: Pre-deployment verification — tests, typecheck, lint, git status
allowed-tools: Bash(pnpm *), Bash(git *)
---

Run pre-deployment verification for UltimateBrain:

1. Check git status — any uncommitted changes?
2. Run `pnpm typecheck` — all 18 packages must pass
3. Run `pnpm test` — all 989+ tests must pass
4. Run `pnpm lint` — no errors (warnings acceptable)
5. Check for any `console.log` in services (should use logger)
6. Check for any `.catch(() => {})` silent catches in services
7. Verify no `.env` or secrets in staged files
8. Report: READY TO DEPLOY or BLOCKED with reasons
