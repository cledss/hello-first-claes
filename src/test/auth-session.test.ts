/* eslint-disable prettier/prettier -- temporary until formatter pass */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearVerifiedLogin, enforceSevenDayLogin, LOGIN_MAX_AGE_MS, markVerifiedLogin } from "@/lib/auth";

const key = "secondself:verified-login-at";
const session = { user: { is_anonymous: false } };

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("seven-day magic-link session", () => {
  it("remembers the first verified login without extending it on repeated events", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000000);
    markVerifiedLogin();
    vi.spyOn(Date, "now").mockReturnValue(2000000);
    markVerifiedLogin();
    expect(window.localStorage.getItem(key)).toBe("1000000");
    clearVerifiedLogin();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("expires verified sessions after seven days", async () => {
    window.localStorage.setItem(key, "1000000");
    vi.spyOn(Date, "now").mockReturnValue(1000000 + LOGIN_MAX_AGE_MS);
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }), signOut },
    };
    expect(await enforceSevenDayLogin(client as never)).toBeNull();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("does not expire a temporary guest identity as a verified login", async () => {
    const guest = { user: { is_anonymous: true } };
    const signOut = vi.fn();
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: guest }, error: null }), signOut },
    };
    expect(await enforceSevenDayLogin(client as never)).toBe(guest);
    expect(signOut).not.toHaveBeenCalled();
  });
});
