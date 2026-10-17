import { describe, expect, it } from "vitest";
import { PRE_MCP_TEMPLATES, preMcpResponse } from "@/lib/pre-mcp";

describe("pre-MCP text templates", () => {
  it("answers all four templates without AI or database writes", () => {
    for (const { intent, question } of PRE_MCP_TEMPLATES) {
      expect(preMcpResponse(question)?.intent).toBe(intent);
      expect(preMcpResponse(question)?.reply.length).toBeGreaterThan(30);
    }
  });

  it("accepts Swedish variants and case/whitespace/punctuation", () => {
    expect(preMcpResponse("  VEM ÄR DU?!  ")?.intent).toBe("identify");
    expect(preMcpResponse("Vad kan du göra?")?.intent).toBe("capabilities");
    expect(preMcpResponse("Hur kontaktar jag First Claes?")?.intent).toBe("contact");
  });

  it("treats all other text as a voicemail, including messages containing a question", () => {
    expect(preMcpResponse("Please tell First Claes who are you?")).toBeNull();
    expect(preMcpResponse("I'd like to discuss a business opportunity")).toBeNull();
    expect(preMcpResponse("What can you do for my business?")).toBeNull();
    expect(preMcpResponse("")).toBeNull();
  });

  it("does not imply a guaranteed personal response or an MCP connection", () => {
    for (const template of PRE_MCP_TEMPLATES) {
      const answer = preMcpResponse(template.question)!.reply;
      expect(answer).not.toContain("kommer att svara");
      expect(answer).not.toContain("MCP-anslutning etablerad");
    }
  });
});
