# Inspection: server secrets and runtime for the Second Claes reply function

Read-only. Nothing was changed. No secret values were read or shown.

## Secret names

| Name | Status |
|---|---|
| OPENAI_API_KEY | Absent. Not in project secrets. |
| SUPABASE_SERVICE_ROLE_KEY | Not listed as a project secret. Lovable Cloud injects it into the server runtime automatically (the generated admin client depends on it). It cannot be viewed, copied or set by anyone. |
| SUPABASE_URL | Provided automatically by Lovable Cloud to the server runtime. |
| SUPABASE_PUBLISHABLE_KEY | Provided automatically by Lovable Cloud to the server runtime. |
| LOVABLE_API_KEY | Present (managed). Gives access to Lovable AI. |

As merged, the reply function stops with "Second Claes replies are not configured yet" because OPENAI_API_KEY is missing.

## Server-function runtime

Supported. Published hosting runs TanStack Start server functions on Cloudflare Workers (edge runtime). Plain `fetch`, `AbortSignal.timeout` and the Supabase JS client work there. Secrets must be read inside the handler, which the function already does.

## Can Lovable AI replace OpenAI?

Yes. No paid OpenAI key is needed. Lovable AI uses the existing LOVABLE_API_KEY and bills usage to the workspace. There is a free monthly allowance, then usage-based credits. Models include Google Gemini and OpenAI GPT-5 family.

## Safe next steps (for Codex, via a GitHub PR)

1. In the reply server function, swap the OpenAI call for a Lovable AI Gateway call (the `@lovable.dev/ai-gateway` SDK, or the OpenAI-compatible chat endpoint) using `process.env.LOVABLE_API_KEY`, read inside the handler. Suggested model: `google/gemini-3-flash-preview` (cheap and fast).
2. Remove the OPENAI_API_KEY requirement. Keep the server-side checks for verified session and Level 1.
3. Handle rate-limit (429) and out-of-credits (402) responses with a clear error and no fake success.
4. Keep using the injected service role key only inside the handler. Never expose it to the browser.
5. Apply the reply migration only after approval, then publish and test with two verified accounts.

To keep OpenAI instead: First Claes adds OPENAI_API_KEY in Project Settings -> Secrets, then publishes.
