# Read-only inspection: auth and environment for PR #4

Nothing was changed. These are the findings from read-only checks, plus what is still unconfirmed.

## Confirmed

- **Backend:** Lovable Cloud is running and not paused. Preview and the published app use the same instance.
- **Build environment:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PROJECT_ID` are set with non-empty values. Server-side `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PROJECT_ID` are set too. The publishable key is in the opaque `sb_publishable_...` format, not a JWT.
- **Database:** the `secondself` schema exists and has 5 tables. `public` has 2 tables.
- **Email domain:** none configured. Auth emails use the default Lovable sender and the default templates.
- **Custom auth email templates:** none in the repo, so there is no auth email webhook route and no template files.

## Not confirmed (no read access from here)

- **Email sign-in on or off:** I have no tool that reads this setting. It is off by default on new Cloud projects. The only tool that changes it turns it on, so I did not call it.
- **OTP code in the email (`{{ .Token }}`):** not confirmed, and probably not set up. With no custom templates, the default Magic link / Confirm signup emails send a link, not a 6-digit code. To put the code in the email you need custom auth templates that render the token.
- **OTP length and expiry, auto-confirm, sign-up enabled, HIBP:** I can't read these. You can check them under More -> Users -> Auth settings -> Email.

## What I can and cannot manage

| Setting | Who can change it |
|---|---|
| Turn on email sign-in | Me (enable email auth tool) |
| Sign-up on/off, auto-confirm, HIBP, require current password, auth email rate limit | Me (configure auth tool), but each call writes all of these at once, so I need their current values first |
| Social providers (Google, Lovable, etc.) | Me |
| Custom auth email templates that show the OTP code | Me, through the auth template scaffold. It needs an email domain and adds files, which would land on `main` |
| Email domain setup | You, through the setup dialog |
| OTP length (4-8) and expiry | You only: Auth settings -> Email -> One-time codes |
| Minimum password length, secure email change | You only |
| VITE_* values | Generated automatically. Do not edit them |

## Suggested next steps (only after you approve)

1. You check the Email and One-time codes settings in Auth settings and share the values.
2. If PR #4 depends on a code in the email: set up an email domain, then scaffold the auth templates on a separate PR branch, not in Lovable, so `main` stays unchanged.
3. Turn on email sign-in only when you approve. It is a hosted setting, so it changes no files on `main`, but it is live for both preview and production right away.
