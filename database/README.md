# Verified email and SecondSelf access

## Provider and hosting decision

Supabase Auth supplies real email OTP registration/login and immutable `auth.users.id`.
Postgres functions enforce SecondSelf grants at the Data API boundary. This works with
TanStack Start's Cloudflare Workers target using the browser SDK and HTTPS; no Node-only
auth server, Worker database binding, service key, or hosting-specific auth plugin is needed.
Email OTP avoids redirect/session cookies and works across mobile email clients. Phone
verification is intentionally unavailable until an SMS provider is configured. The public
E.164 number is never an authorization input.

## Manual setup before an approved deployment

1. Create/select a dedicated Supabase project. As database administrator, apply
   `database/schema.sql` once in a transaction. This is the initial migration; do not rerun
   over an existing installation. Keep `secondself` OUT of Data API exposed schemas; expose
   `public` only. The schema enables RLS and denies direct table access even if accidentally
   exposed. Public RPC wrappers run as invoker and call narrowly granted private functions.
2. Enable Email Auth, new-user registration and **Confirm email**. Disable anonymous,
   phone and other providers for this release. Configure production SMTP, sender identity,
   OTP expiry/rate limits and abuse controls. Set the Magic Link email template to display
   `{{ .Token }}` as a one-time code (rather than requiring a magic-link redirect). Keep
   production Site URL and allowed redirects restricted to approved application origins.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in hosting build
   environment settings. Both are public configuration, not credentials. No service-role
   or secret key belongs in this app. Rebuild only after deployment approval. Without these
   values the landing page stays public and sign-in is disabled with an explanation.
4. First Claes registers using his own verified email. An administrator independently checks
   the account identity and copies its UUID from Auth users. In an administrator SQL session,
   execute the following with that UUID substituted (never a phone/email match):

   ```sql
   begin;
   insert into secondself.owner(user_id)
   select id from auth.users where id = '<verified-owner-uuid>'::uuid
     and email_confirmed_at is not null and not coalesce(is_anonymous, false);
   insert into secondself.audit(actor, subject, event)
   select user_id, user_id, 'owner_bootstrapped_by_admin' from secondself.owner;
   commit;
   ```

   Verify exactly one owner exists. No public bootstrap endpoint exists. Owner replacement
   is a separate audited administrator operation. Protect the dashboard/admin account with MFA.
5. Verify an actual email arrives, an incorrect/expired code fails, and a correct code signs
   in with Level 1. Save a message, sign out, sign in again, and confirm it persists. Use a
   second verified account to confirm isolation. Request Level 2; it remains pending.
6. A signed-in owner can explicitly approve a pending request using the authenticated SDK:
   `client.rpc('secondself_approve', { subject: '<user-uuid>', approved_level: 2 })`.
   Revoke with `client.rpc('secondself_revoke', { subject: '<user-uuid>' })`.
   An admin approval UI is out of scope. Never perform these with the publishable key alone
   or a service key in browser tools. Approval records actor/time and an audit event.

## Security assumptions and limits

- The Supabase gateway validates JWTs. Database functions independently check the current
  Auth user, verified email, ban state, live `auth.sessions` row and its time limit, plus
  the current Second Claes grant on every call. User metadata, claimed roles, phone numbers
  and client UI state confer no rights. Revocation takes effect on the next database call,
  including with an already-issued token; signing in cannot resurrect a revoked grant.
- Privileged SQL implementations use a fixed empty search path and fully qualified names.
  Security-definer access is necessary to read private grant/Auth tables; direct table and
  helper-function access is denied. Only the explicit RPC implementations are executable
  by authenticated clients. Anonymous execution is revoked on every public wrapper.
- Credentials/sessions stay in memory, with automatic refresh only while the page is open.
  Reloading requires email sign-in again. No cookie authentication is introduced; the existing
  TanStack CSRF middleware is unchanged. Prevent XSS; bearer tokens are accessible to browser JS.
- This PR stores the user's own messages and shows public capabilities. It does not generate
  Second Claes replies, expose private memories/contacts, or implement MCP/negotiation.
  Messages are limited to 4,000 characters and the latest 100 are returned. Configure
  provider-side rate limits/quotas and a retention policy before public availability.
- Database admins remain trusted. Restrict administrative credentials and record operational
  changes. The audit table is append-only for app users; database administrators can manage it.
- Supabase Auth's session schema is an external dependency. The local SQL tests represent
  the documented `auth.users`, `auth.sessions`, `auth.uid()` and `auth.jwt()` contract, not
  the actual mail gateway/JWT verifier. The SMTP/mobile sign-in smoke test and Supabase
  security advisors must be run against the configured staging project before deployment.

## Verification

`bun run test` executes the production schema in PGlite (real Postgres with roles,
permissions, triggers and functions). It covers anonymous/unverified rejection,
verified Level 1, Level 2 denial/self-approval, owner impersonation, cross-user data,
live session and verification checks, owner approval audit and revocation. UI tests
cover missing configuration and email OTP error/success states. Quality also runs
frozen install, typecheck, lint and the production build. No live project is changed
by these tests.

Docs consulted: [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[sessions](https://supabase.com/docs/guides/auth/sessions). Changelog checked 2026-10-17;
the upcoming TLS cipher removal does not affect modern browser HTTPS clients.
