# Email: invitations and password reset

The API sends two kinds of email:

- **Invitation**: an owner invites someone to the organization from «Miembros». The link opens
  `/accept-invite` in the admin, where the person sets a name and password. The link is single-use and
  valid for 7 days.
- **Password reset**: «¿Olvidaste tu contraseña?» on the login page. The link opens `/reset-password`, is
  single-use and valid for 1 hour. Setting a new password burns every other open link and revokes every
  session of that user.

Links carry the token in the URL fragment (`#token=...`), so it is never sent to a server or written to
access logs. The admin page reads it and removes it from the address bar. The database stores only the
sha256 hash of each token.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SMTP_URL` | empty | `smtp://` or `smtps://user:password@host:port`. Empty: emails are written to the API log (development only) |
| `MAIL_FROM` | `Synapse <no-reply@synapse.local>` | Sender |
| `ADMIN_PUBLIC_URL` | `http://localhost:3001` | Base of the links. Required in production when `SMTP_URL` is set |

In production without `SMTP_URL`, inviting and requesting a reset answer **503** `SERVICE_UNAVAILABLE`, so no
link is created that nobody can receive.

## Local testing with Mailpit

Mailpit (MIT) catches every email locally. Nothing leaves the machine.

```bash
docker compose up -d mailpit
```

- SMTP: `smtp://localhost:1025`. Put `SMTP_URL=smtp://localhost:1025` in `.env`.
- Inbox UI and API: <http://localhost:8025>.

Tests that use it, skipped when the variable is unset:

```bash
cd apps/api && MAILPIT_SMTP_URL=smtp://localhost:1025 npx vitest run test/mailpit.test.ts
```

```bash
pnpm build && cd tests && E2E_SMTP_URL=smtp://localhost:1025 npx playwright test flow-f-invitations
```

## Production

Use any SMTP provider. Set the three variables in `.env.production` (see `.env.production.example`) and
restart the API. The VM deployed on 2026-11-17 has no SMTP configured, so invitations and resets answer 503
there until it is set.
