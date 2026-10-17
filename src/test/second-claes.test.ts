import { describe, expect, it } from "vitest";
import { SECOND_CLAES_INSTRUCTIONS, toModelMessages, validateReplyInput } from "@/lib/second-claes";

describe("Second Claes reply safety", () => {
  const token = "verified-user-session-token-long-enough";

  it("rejects unauthenticated and empty requests", () => {
    expect(() => validateReplyInput({ body: "hello" })).toThrow("Authentication required");
    expect(() => validateReplyInput({ token, body: "  " })).toThrow("Message must contain");
    expect(() => validateReplyInput({ token, body: "a".repeat(4001) })).toThrow();
  });

  it("validates and trims the message", () => {
    expect(validateReplyInput({ token, body: "  Hello Second Claes  " })).toEqual({
      token,
      body: "Hello Second Claes",
    });
  });

  it("limits model context and excludes database metadata", () => {
    const history = Array.from({ length: 30 }, (_, id) => ({
      id,
      role: (id % 2 ? "assistant" : "user") as "assistant" | "user",
      body: "Hello",
      created_at: "2026-10-17T00:00:00Z",
    }));
    const context = toModelMessages(history);
    expect(context).toHaveLength(20);
    expect(context[0]).toEqual({ role: "user", content: "Hello" });
    expect(JSON.stringify(context)).not.toContain("created_at");
  });

  it("defines Level 1 privacy boundaries", () => {
    expect(SECOND_CLAES_INSTRUCTIONS).toContain("no access");
    expect(SECOND_CLAES_INSTRUCTIONS).toContain("explicit approval");
  });
});
