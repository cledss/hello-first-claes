import { useCallback, useEffect, useState } from "react";
import { clearVerifiedLogin, enforceSevenDayLogin, getAuthClient, markVerifiedLogin } from "@/lib/auth";
import type { ConversationMessage } from "@/lib/second-claes";
import { PRE_MCP_TEMPLATES, preMcpResponse } from "@/lib/pre-mcp";

type OwnerMessage = { message_id: number; queued_at: string; body: string; email: string };

export function AccessPanel() {
  const [guestBody, setGuestBody] = useState("");
  const [guestMessages, setGuestMessages] = useState<ConversationMessage[]>([]);
  const [guestReply, setGuestReply] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [level, setLevel] = useState<number | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [inbox, setInbox] = useState<OwnerMessage[]>([]);
  const [body, setBody] = useState("");
  const [templateReply, setTemplateReply] = useState<string | null>(null);
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
      if (detail.includes("Temporary account limit")) {
        setStatus("Tillfälliga konton kan skicka ett meddelande. Logga in för fler.");
      } else if (detail.includes("Rate limit")) {
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

  const loadGuest = useCallback(async () => {
    const client = getAuthClient();
    if (!client) throw new Error("Authentication unavailable");
    const { data, error } = await client.rpc("secondself_guest_conversation");
    if (error) throw error;
    setGuestMessages(data ?? []);
  }, []);

  useEffect(() => {
    const client = getAuthClient();
    if (!client) return;
    let active = true;
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_IN" && session && !session.user.is_anonymous) {
        markVerifiedLogin();
        queueMicrotask(() => {
          if (active) void enforceSevenDayLogin(client).then((valid) => {
            if (valid && active) void load();
          }).catch(() => setStatus("Kunde inte läsa in inloggningen."));
        });
      }
      if (event === "SIGNED_OUT") {
        clearVerifiedLogin();
        setLevel(null);
        setGuestMessages([]);
      }
    });
    void enforceSevenDayLogin(client).then((session) => {
      if (!active || !session) return;
      if (session.user.is_anonymous) {
        void loadGuest().catch(() => setStatus("Kunde inte läsa in det tillfälliga samtalet."));
      } else {
        void load().catch(() => setStatus("Inloggningen lyckades men behörigheten kunde inte läsas."));
      }
    }).catch(() => {
      if (active) setStatus("Kunde inte kontrollera inloggningen.");
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [load, loadGuest]);

  return (
    <div className="space-y-4">
      {level === null ? (
        <div className="space-y-6">
          <section aria-label="Prata med Second Claes" className="space-y-3">
            <h3 className="font-display text-2xl text-primary">Lämna ett meddelande</h3>
            <p className="text-sm text-muted-foreground">
              Börja direkt utan inloggning. Ett tillfälligt konto skapas automatiskt när du skickar.
              Du får ett svar här och kan läsa det igen i samma webbläsare.
            </p>
            {guestMessages.map((message) => (
              <p key={`${message.role}-${message.id}`} className="whitespace-pre-wrap rounded-md border p-3">
                <strong>{message.role === "assistant" ? "Second Claes" : "Du"}:</strong> {message.body}
              </p>
            ))}
            {guestReply && (
              <p role="note" className="rounded-md border p-3">
                <strong>Second Claes:</strong> {guestReply}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {PRE_MCP_TEMPLATES.map((template) => (
                <button key={template.intent} type="button" disabled={busy}
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={() => setGuestReply(preMcpResponse(template.question)?.reply ?? null)}>
                  {template.question}
                </button>
              ))}
            </div>
            {guestMessages.length === 0 ? (
              <form className="space-y-3" onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const template = preMcpResponse(guestBody);
                  if (template) {
                    setGuestReply(template.reply);
                    setGuestBody("");
                    return;
                  }
                  const client = getAuthClient();
                  if (!client) throw new Error("Authentication unavailable");
                  const { data: current } = await client.auth.getSession();
                  if (!current.session) {
                    const { error } = await client.auth.signInAnonymously();
                    if (error) throw error;
                  } else if (!current.session.user.is_anonymous) {
                    await load();
                    setStatus("Du är redan inloggad. Använd din personliga meddelanderuta.");
                    return;
                  }
                  const { data: receipt, error } = await client.rpc("secondself_guest_voicemail", {
                    message_body: guestBody,
                  });
                  if (error) throw error;
                  setGuestBody("");
                  setGuestReply(null);
                  await loadGuest();
                  setStatus(`Meddelandet är mottaget. Köplats: ${receipt.queue_position}.`);
                });
              }}>
                <label className="block text-sm">Ditt meddelande till First Claes
                  <textarea required maxLength={4000} value={guestBody} disabled={busy}
                    onChange={(event) => setGuestBody(event.target.value)} className={inputClass} />
                </label>
                <button disabled={!configured || busy || !guestBody.trim()} className={buttonClass}>
                  Skicka meddelande
                </button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Meddelandet är sparat. Logga in med e-post för att kunna skicka fler.
              </p>
            )}
          </section>
          <div className="border-t pt-4">
            <h3 className="font-display text-2xl text-primary">Logga in med e-post</h3>
            <p className="text-sm text-muted-foreground">
              Magisk länk ger en inloggning som sparas i upp till sju dagar i denna webbläsare.
            </p>
          </div>
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
        </div>
      ) : (
        <section className="space-y-4" aria-label="Your SecondSelf access">
          <p>Level {level} access · Second Claes</p>
          <p className="text-sm">
            Hej! Jag är Second Claes, assistent till First Claes. Lämna ett meddelande så lägger jag
            det i kön för First Claes. Jag är en digital telefonsvarare.
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
          <div className="space-y-2">
            <p className="text-sm">Du kan fråga mig vem jag är eller lämna ett meddelande.</p>
            <div className="flex flex-wrap gap-2">
              {PRE_MCP_TEMPLATES.map((template) => (
                <button
                  key={template.intent}
                  type="button"
                  disabled={busy}
                  className="rounded-md border px-3 py-2 text-sm"
                  onClick={() => {
                    const response = preMcpResponse(template.question);
                    if (response) {
                      setTemplateReply(response.reply);
                      setStatus("");
                    }
                  }}
                >
                  {template.question}
                </button>
              ))}
            </div>
            {templateReply && (
              <p role="note" className="rounded-md border p-3">
                <strong>Second Claes:</strong> {templateReply}
              </p>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const template = preMcpResponse(body);
                if (template) {
                  setTemplateReply(template.reply);
                  setBody("");
                  return;
                }
                const client = getAuthClient();
                if (!client) throw new Error("Authentication unavailable");
                const { data: receipt, error: sendError } = await client.rpc(
                  "secondself_voicemail",
                  { message_body: body },
                );
                if (sendError) throw sendError;
                setBody("");
                setTemplateReply(null);
                await load();
                setStatus(`Meddelandet är mottaget. Köplats: ${receipt.queue_position}.`);
              });
            }}
          >
            <label>
              Fråga eller meddelande till First Claes
              <textarea
                required
                maxLength={4000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className={inputClass}
              />
            </label>
            <button disabled={busy || !body.trim()} className={buttonClass}>
              Skicka
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
                          const { error } = await getAuthClient()!.rpc("secondself_mark_handled", {
                            message_id: item.message_id,
                          });
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
                clearVerifiedLogin();
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
