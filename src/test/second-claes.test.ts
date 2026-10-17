import { describe, expect, it } from "vitest";
import { VOICEMAIL_GREETING } from "@/lib/second-claes";

describe("Second Claes voicemail identity", () => {
  it("identifies Second Claes as First Claes's assistant", () => {
    expect(VOICEMAIL_GREETING).toContain("assistent till First Claes");
  });

  it("confirms receipt and queueing without promising a personal reply", () => {
    expect(VOICEMAIL_GREETING).toContain("lagt det i kön");
    expect(VOICEMAIL_GREETING).not.toContain("kommer att svara");
  });
});
