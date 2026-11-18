# Security

Review date: 2026-11-15. A read-only review of the API, both Next apps, the seed and the upload flow found
no critical or high findings. The medium and low findings below were fixed or accepted. Every fix has an
automated test, and the full suites passed after the fixes (see [TESTING.md](TESTING.md)).

## Controls in place

- **Authentication:** bcrypt password hashes. The session is an HS256 JWT in an httpOnly, SameSite=Lax cookie
  (Secure in production) with an 8-hour lifetime. Unknown email and wrong password give the same 401 and cost
  the same time.
- **Authorization:** every admin route runs `requireAuth(action)`. The guard reads the user's current role in
  the session's organization from the database on each request, so role changes and removals apply at once.
- **Tenant isolation:** every admin query is scoped to the session's organization. Cross-organization access
  is tested (IDOR).
- **Input:** every body, query and path parameter is validated with Zod on the server. JSON bodies are
  limited to 1 MB.
- **Uploads:** signed, single-use upload URLs, size limits, magic-byte checks and an extension allow-list.
  DWG, IFC, FBX and OBJ are rejected. Raw uploads are never served.
- **Email links (invitations, password reset):** 32-byte random tokens, stored only as sha256, sent in the URL
  fragment so they never reach server logs, single-use through an atomic update, 7 days or 1 hour. A reset
  request answers 202 for any email and does not wait for SMTP. A reset burns the user's other links and
  revokes their sessions. These endpoints share the login rate limit (10/min/IP). See [EMAIL.md](EMAIL.md).
- **Leads:** honeypot, consent, a rate limit per IP and a hashed IP (no raw IP stored).
- **Rate limits per IP:** global 300/min, login 10/min, leads 5/min.
- **CSRF:** SameSite=Lax cookies plus an Origin check. Writes (`POST`, `PUT`, `PATCH`, `DELETE`) that send an
  Origin outside `CORS_ORIGINS` get 403.
- **CORS:** allow-list from `CORS_ORIGINS`, with credentials.
- **Headers:**
  - API: `nosniff`, `no-referrer`, `X-Frame-Options: DENY` and a deny-all CSP. SVG media is sandboxed.
  - Showroom and admin: CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`,
    `Referrer-Policy` and `Permissions-Policy`. The headers are defined once in
    `config/security-headers.mjs`.
- **Errors:** generic messages with a request id. No stack traces in responses.
- **Logs:** the upload token is redacted from logged URLs.
- **Production:** the Swagger UI (`/docs`) is not registered. The demo seed refuses to run with
  `NODE_ENV=production`.
- **Secrets:** only in environment variables. `.env` is gitignored. Seed passwords are for local use only.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Medium | The session JWT was trusted until expiry, so role changes and removed members still worked. | Fixed: the role is read from the database on each request. Tests: `apps/api/test/security.test.ts`. |
| 2 | Medium | The Next apps sent no security headers (CSP, frame-ancestors, nosniff). | Fixed: shared headers. Checked on every showroom page and the admin login, with no CSP violations in the browser console. |
| 3 | Medium | The seed wipes the database, has a default password and had no production guard. | Fixed: it refuses `NODE_ENV=production`. |
| 4 | Low | CSRF relied on SameSite=Lax only. | Fixed: Origin check on writes. Tested. |
| 5 | Low | Upload tokens in the query string were written to the logs. | Fixed: redacted in the request log serializer. |
| 6 | Low | Login is rate-limited per IP only, not per account. | Accepted. Roadmap: add a limit per account. |
| 7 | Low | There is no storage quota per organization. | Accepted. Upload size limits apply. Roadmap. |
| 8 | Low | Some admin list endpoints are not paginated. | Accepted. These lists are bounded per development (units, scenes, hotspots). Leads are paginated. |
| 9 | Low | Swagger was served in production. | Fixed: registered only outside production. Tested. |
| 10 | Low | The public manifest includes `organizationId`. | Accepted. It is an opaque UUID and grants no access on its own. |

## Known limits

- Logout clears the cookie but does not revoke the token. A stolen cookie stays valid until it expires
  (8 hours at most) unless the membership is removed or the role is changed.
- The CSP allows `'unsafe-inline'` scripts because Next injects inline bootstrap scripts. Nonce-based CSP is
  on the roadmap.
- No dependency audit, DAST scan or penetration test against a deployed target has been run. The app is
  deployed locally only.
