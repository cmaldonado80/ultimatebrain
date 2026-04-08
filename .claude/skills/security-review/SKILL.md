---
name: security-review
description: Security audit of pending changes — check for injection, auth bypass, info leaks
allowed-tools: Bash(git diff*), Grep, Read
---

Security review the current git diff for UltimateBrain:

1. Run `git diff --cached` (staged) or `git diff` (unstaged) to see changes
2. Check for these OWASP issues:
   - SQL injection: raw SQL with string concatenation (should use parameterized queries)
   - Auth bypass: API routes missing `authenticateEntity()` or `protectedProcedure`
   - Info leaks: `err.message` returned to clients (should use generic messages)
   - XSS: user input rendered without sanitization
   - SSRF: `fetch()` with user-controlled URLs without validation
   - Path traversal: file operations with user-controlled paths without sanitization
3. Check for secrets: API keys, tokens, passwords in code (not .env)
4. Check for `console.log` in production code (should use logger)
5. Check for `.catch(() => {})` silent error swallowing
6. Report: SAFE or ISSUES FOUND with specific file:line references
