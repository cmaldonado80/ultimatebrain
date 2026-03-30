# Security Policy

This document describes the current security posture of Solarc Brain, known limitations, and our planned roadmap.

## Authentication

Solarc Brain uses **JWT-based authentication** with cookie sessions. Tokens are issued at login and stored as HTTP-only cookies. Session validation is currently based on cookie presence.

### Development Bypass -- SKIP_AUTH

The `SKIP_AUTH` environment variable disables authentication checks to simplify local development.

> **WARNING:** `SKIP_AUTH` must **never** be enabled in production. Doing so removes all access control and exposes every API endpoint without authentication.

## Session Validation

Session validation currently checks for the **presence** of the session cookie rather than performing full token verification on every request. This is a known limitation and is being addressed in the security roadmap below.

## API Key Handling

API keys managed by the platform are **encrypted at rest** using the `KeyVault` module. The encryption key is derived from the `VAULT_SECRET` environment variable.

- `VAULT_SECRET` must be set in all deployed environments.
- Rotate `VAULT_SECRET` periodically and re-encrypt stored keys when doing so.
- Never commit `VAULT_SECRET` or any raw API keys to version control.

## Sensitive Data

- `brainEntities.databaseUrl` currently stores connection strings. This field is being **migrated to encrypted storage** via KeyVault.
- All secrets and credentials should be provided through environment variables, never hard-coded.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

**Email:** security@solarc.dev

Please include:

- A description of the vulnerability.
- Steps to reproduce.
- The potential impact.

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation plan within 7 days.

## Security Roadmap

The following improvements are planned:

1. **Real auth integration** -- replace cookie-presence checks with a full identity provider (e.g., OAuth 2.0 / OIDC).
2. **Workspace membership enforcement** -- verify that the authenticated user has access to the requested workspace on every API call.
3. **Rate limiting** -- add per-user and per-IP rate limits to all public-facing endpoints.
4. **Input sanitization** -- audit and harden all user-facing inputs against injection attacks (SQL, XSS, command injection).
5. **Session token verification** -- validate JWT signature and expiry on every request, not just cookie presence.
