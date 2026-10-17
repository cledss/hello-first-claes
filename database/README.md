# Verified email and SecondSelf access

## Provider and hosting decision

Supabase Auth supplies real email magic-link registration/login and immutable `auth.users.id`.
Postgres functions enforce SecondSelf grants at the Data API boundary. This works with
TanStack Start's Cloudflare Workers target using the browser SDK and HTTPS; no Node-only
auth server, Worker database binding, service key, or hosting-specific auth plugin is needed.
Email magic links use the default Lovable email template and return to the application origin. The browser SDK processes the callback; no session cookies are required. Phone
verification is intentionally unavailable until an SMS provider is configured. The public
E.164 number is never an authorization input.

## Manual setup before an approved deployment

1. Use the existing Lovable Cloud Supabase project. The initial `database/schema.sql` migration
   was applied to the Lovable database on 2026-10-17 and verified to have five RLS-enabled
   tables, seven authenticated-only public RPCs and the verification trigger. Do not rerun
   the initial migration over that installation. Keep `secondself` OUT of Data API exposed schemas; expose
   `public` only. The schema enables RLS and denies direct table access even if accidentally
   exposed. Public RPC wrappers run as invoker and call narrowly granted private functions.
2. Email Auth has been enabled in Lovable Cloud. Keep new-user registration and **Confirm email**
   enabled; disable anonymous, phone and other providers unless deliberately required. The
   default Magic Link email template sends a clickable link; no custom OTP template is needed.
   Allowlist the approved preview/production origins for Auth redirects, and set the Site URL
   correctly before a live test. Configure provider-side email rate limits, abuse controls,
   sender reputation and SMTP as needed before public rollout.
3. Lovable Cloud already supplies `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
   in its managed build environment. Both are public configuration, not credentials; do not
   add a service-role or secret key to the browser. Rebuild only after deployment approval.
   Without these values the landing page stays public and sign-in is disabled.
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
5. Verify an actual magic-link email arrives, expired/invalid links fail, and a valid link
   returns to the approved app origin with Level 1. Save a message, sign out, sign in again,
   and confirm it persists. Use a
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
- This PR stores the user's own messages and shows public capabilities. The conversation feature adds AI replies only after the separate reply migration and
  server credentials are configured. It does not expose private memories/contacts or
  implement MCP/negotiation.
  Messages are limited to 4,000 characters and the latest 100 are returned. Configure
  provider-side rate limits/quotas and a retention policy before public availability.
- Database admins remain trusted. Restrict administrative credentials and record operational
  changes. The audit table is append-only for app users; database administrators can manage it.
- Supabase Auth's session schema is an external dependency. The local SQL tests represent
  the documented `auth.users`, `auth.sessions`, `auth.uid()` and `auth.jwt()` contract, not
  the actual mail gateway/JWT verifier. The live-email/mobile magic-link smoke test and Supabase
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

## Second Claes reply deployment (new feature, not yet activated)

1. Review and apply `database/migrations/20261017_second_claes_replies.sql` using
   Lovable's database administrator tooling. It creates private assistant reply storage,
   an authenticated conversation reader and message sender, and a service-role-only
   reply writer. **Applied to Lovable Cloud on 2026-10-17 after owner approval.**
2. Use Lovable Cloud's managed server-only `LOVABLE_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in the
   hosting runtime, plus `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or their
   existing `VITE_` equivalents). Never use `VITE_` for the two secret keys.
   Confirm the TanStack Start server runtime can read these at request time.
3. Configure API spending caps, request monitoring and a retention policy. The new
   message endpoint enforces verified Level 1 at the database, allows at most five
   new messages per user per minute, and sends at most twenty recent turns to the model.
   It uses Lovable AI `google/gemini-2.5-flash` and a 25-second upstream timeout.
4. Before marking the release verified, test with two verified accounts: replies arrive, each user sees
   only their own conversation, Level 0 and revoked sessions are rejected, failed
   upstream requests never claim success, and API credentials are absent from
   client assets. Check runtime compatibility and provider billing before publishing.
5. If the AI request fails after the user message is saved, the message remains
   in history without an assistant reply. This is intentional for auditability;
   automatic retries are not enabled to avoid duplicate messages or charges.

Lovable AI calls consume workspace AI credits; the API returns a clear error on 402 or 429.

## Voicemail-first Second Claes

Apply `database/migrations/20261017_voicemail_queue.sql` after the reply migration.
The public-facing Level 1 experience is a digital answering machine, **not a general AI chat**.
Each successful message is stored in the durable PostgreSQL queue and gets a fixed,
non-generative Swedish receipt in the same transaction. The owner-only inbox displays
pending messages with the sender's verified email and lets First Claes mark them handled.
No email forwarding, notifications or automated personal response is implied.

Limits are enforced atomically in PostgreSQL: **3 messages / 10 minutes per account**,
**20 / 24 hours per account**, **10 pending per account**, and **200 pending globally**.
All limits are inclusive of concurrent submissions via a transaction-scoped advisory lock.
Rejected messages do not enter the queue and do not receive a success receipt.
Legacy message-sending RPCs are revoked to prevent bypass. The owner inbox requires a
row in `secondself.owner` for First Claes; if no owner is provisioned, messages remain
queued safely but cannot yet be marked handled through the UI. Provision owner access
only after independent identity verification; never infer it from a name or email.
