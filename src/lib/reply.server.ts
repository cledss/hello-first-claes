import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import {
  SECOND_CLAES_INSTRUCTIONS,
  toModelMessages,
  validateReplyInput,
  type ConversationMessage,
} from "./second-claes";

export const replyAsSecondClaes = createServerFn({ method: "POST" })
  .inputValidator(validateReplyInput)
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
    const publishable =
      process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!url || !publishable || !serviceKey || !apiKey) {
      throw new Error("Second Claes replies are not configured yet");
    }

    // Validate the actual Supabase session, then enforce Level 1 through the database.
    const client = createClient(url, publishable, {
      global: { headers: { Authorization: `Bearer ${data.token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: identity, error: identityError } = await client.auth.getUser(data.token);
    if (identityError || !identity.user || !identity.user.email_confirmed_at) {
      throw new Error("Authentication required");
    }
    const { data: access, error: accessError } = await client.rpc("secondself_access");
    if (accessError || !access || access.level < 1) {
      throw new Error("Level 1 access required");
    }

    const { data: messageId, error: saveError } = await client.rpc("secondself_send_message", {
      message_body: data.body,
    });
    if (saveError || typeof messageId !== "number") {
      throw new Error("Message could not be saved");
    }

    const { data: conversation, error: conversationError } =
      await client.rpc("secondself_conversation");
    if (conversationError || !Array.isArray(conversation)) {
      throw new Error("Conversation could not be loaded");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        max_tokens: 500,
        messages: [
          { role: "system", content: SECOND_CLAES_INSTRUCTIONS },
          ...toModelMessages(conversation as ConversationMessage[]),
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error("Second Claes is temporarily unavailable");
    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Second Claes returned an empty reply");

    const serverClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: replyError } = await serverClient.rpc("secondself_store_reply", {
      p_message_id: messageId,
      p_body: reply.slice(0, 8000),
    });
    if (replyError) throw new Error("Reply could not be saved");
    return { reply };
  });
