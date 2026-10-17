import { useCallback, useEffect, useState } from "react";
import { getAuthClient } from "@/lib/auth";

type Message = { id: number; body: string; created_at: string };

export function AccessPanel() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [level, setLevel] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = Boolean(
    import.meta.env["VITE_SUPABASE_URL"] && import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
  );
  const inputClass = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2";
  const buttonClass = "rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try {
      await action();
    } catch {
      setStatus("The request could not be completed. Check your email or try again.");
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(async () => {
    const client = getAuthClient();
    if (!client) throw new Error("Authentication unavailable");
    const access = await client.rpc("secondself_access");
    if (access.error) {
      setLevel(null);
      setMessages([]);
      throw access.error;
    }
    const result = await client.rpc("secondself_messages");
    if (result.error) throw result.error;
    setLevel(access.data.level);
    setMessages(result.data);
  }, []);

  useEffect(() => {
    const client = getAuthClient();
    if (!client) return;
    let active = true;
    // Supabase completes the emailed magic link when the browser returns here.
    void client.auth.getSession().then(({ data, error }) => {
      if (!active || error || !data.session) return;
      void load().catch(() => {
        if (active) setStatus("Sign-in succeeded, but access could not be loaded.");
      });
    });
    return () => {
      active = false;
    };
  }, [load]);

  return (
    <div className="space-y-4">
      {level === null ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const client = getAuthClient();
              if (!client) throw new Error("Authentication unavailable");
              const { error } = await client.auth.signInWithOtp({
                email: email.trim(),
                options: {
                  emailRedirectTo: window.location.origin,
                  data: { full_name: name.trim() },
                },
              });
              if (error) throw error;
              setSent(true);
              setStatus("Check your email for a sign-in link. Open it in this browser.");
            });
          }}
        >
          <label className="block text-sm">
            Name
            <input
              type="text"
              required
              maxLength={120}
              autoComplete="name"
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </label>
          <button disabled={!configured || busy} className={buttonClass}>
            {sent ? "Resend sign-in link" : "Request access"}
          </button>
          {sent && (
            <button
              type="button"
              disabled={busy}
              className="ml-3 underline"
              onClick={() => {
                setSent(false);
                setStatus("");
              }}
            >
              Use another email
            </button>
          )}
          <p className="text-sm text-muted-foreground">
            {configured
              ? "A sign-in link will be emailed to you. Verified accounts receive Level 1 automatically."
              : "Sign-in is unavailable until authentication is configured."}
          </p>
        </form>
      ) : (
        <section className="space-y-4" aria-label="Your SecondSelf access">
          <p>Level {level} access · Second Claes</p>
          <p className="text-sm">
            Public capabilities: introductions and access requests. Your messages are private to
            your account. Automated replies are not available yet.
          </p>
          <ul>
            {messages.map((message) => (
              <li key={message.id} className="whitespace-pre-wrap border-b py-2">
                {message.body}
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const { error } = await getAuthClient()!.rpc("secondself_send", { body });
                if (error) throw error;
                setBody("");
                await load();
                setStatus("Message saved. Automated replies are not available yet.");
              });
            }}
          >
            <label>
              Your message
              <textarea
                required
                maxLength={4000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className={inputClass}
              />
            </label>
            <button disabled={busy || !body.trim()} className={buttonClass}>
              Save message
            </button>
          </form>
          <button
            disabled={busy}
            className={buttonClass}
            onClick={() =>
              void run(async () => {
                const { error } = await getAuthClient()!.rpc("secondself_request", {
                  requested_level: 2,
                });
                if (error) throw error;
                setStatus("Level 2 request pending. First Claes must approve it.");
              })
            }
          >
            Request Level 2
          </button>
          <button disabled={busy} className="ml-3 underline" onClick={() => void run(load)}>
            Refresh access
          </button>
          <button
            disabled={busy}
            className="ml-3 underline"
            onClick={() =>
              void run(async () => {
                const { error } = await getAuthClient()!.auth.signOut();
                setLevel(null);
                setMessages([]);
                setSent(false);
                if (error) throw error;
              })
            }
          >
            Sign out
          </button>
        </section>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
