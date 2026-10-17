import { useCallback, useEffect, useState } from "react";
import { getAuthClient } from "@/lib/auth";
import type { ConversationMessage } from "@/lib/second-claes";

type OwnerMessage = { message_id: number; queued_at: string; body: string; email: string };

export function AccessPanel() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [level, setLevel] = useState<number | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [inbox, setInbox] = useState<OwnerMessage[]>([]);
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
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      if (detail.includes("Rate limit")) {
        setStatus("För många meddelanden. Försök igen om en stund.");
      } else if (detail.includes("Queue limit") || detail.includes("Queue temporarily full")) {
        setStatus("Kön är full. Försök igen senare.");
      } else {
        setStatus("The request could not be completed. Check your email or try again.");
      }
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
    const result = await client.rpc("secondself_conversation");
    if (result.error) throw result.error;
    setLevel(access.data.level);
    setMessages(result.data);
    const owner = access.data.is_owner === true;
    setIsOwner(owner);
    if (owner) {
      const pending = await client.rpc("secondself_owner_inbox");
      if (pending.error) throw pending.error;
      setInbox(pending.data);
    } else {
      setInbox([]);
    }
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
            Hej! Jag är Second Claes, assistent till First Claes. Lämna ett meddelande så
            lägger jag det i kön för First Claes. Jag är en digital telefonsvarare.
          </p>
          <ul>
            {messages.map((message) => (
              <li
                key={`${message.role}-${message.id}`}
                className="whitespace-pre-wrap border-b py-2"
              >
                <strong>{message.role === "assistant" ? "Second Claes" : "You"}:</strong>{" "}
                {message.body}
                {message.role === "user" && message.queue_status && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    ({message.queue_status === "pending" ? "I kö" : "Hanterat"})
                  </span>
                )}
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const client = getAuthClient();
                if (!client) throw new Error("Authentication unavailable");
                const { data: receipt, error: sendError } = await client.rpc(
                  "secondself_voicemail",
                  { message_body: body },
                );
                if (sendError) throw sendError;
                setBody("");
                await load();
                setStatus(`Meddelandet är mottaget. Köplats: ${receipt.queue_position}.`);
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
              Lämna meddelande
            </button>
          </form>
          {isOwner && (
            <section aria-label="First Claes inbox" className="space-y-2">
              <h3 className="font-semibold">Meddelanden till First Claes ({inbox.length})</h3>
              <ul>
                {inbox.map((item) => (
                  <li key={item.message_id} className="border-b py-2">
                    <p className="text-sm">{item.email}</p>
                    <p className="whitespace-pre-wrap">{item.body}</p>
                    <button
                      type="button"
                      disabled={busy}
                      className={buttonClass}
                      onClick={() =>
                        void run(async () => {
                          const { error } = await getAuthClient()!.rpc(
                            "secondself_mark_handled",
                            { message_id: item.message_id },
                          );
                          if (error) throw error;
                          await load();
                          setStatus("Meddelandet markerat som hanterat.");
                        })
                      }
                    >
                      Markera hanterat
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
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
                setIsOwner(false);
                setInbox([]);
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
