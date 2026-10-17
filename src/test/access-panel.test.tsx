import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessPanel } from "@/components/access-panel";

const client = vi.hoisted(() => ({
  auth: {
    signInWithOtp: vi.fn(),
    getSession: vi.fn(),
    signOut: vi.fn(),
  },
  rpc: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuthClient: () => client }));

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-configuration");
  vi.clearAllMocks();
  client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("email access flow", () => {
  it("sends a provider magic link with the requester's name and current origin", async () => {
    client.auth.signInWithOtp.mockResolvedValue({ error: null });
    render(<AccessPanel />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Example User" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Request access" }));
    await screen.findByText(/Check your email for a sign-in link/);
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.invalid",
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: "Example User" },
      },
    });
    expect(screen.getByRole("button", { name: "Resend sign-in link" })).toBeEnabled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("loads server-authorized Level 1 after the magic-link callback", async () => {
    client.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "test" } },
      error: null,
    });
    client.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data: name === "secondself_access" ? { level: 1 } : [],
    }));
    render(<AccessPanel />);
    await screen.findByText("Level 1 access · Second Claes");
    expect(client.rpc).toHaveBeenCalledWith("secondself_access");
    fireEvent.click(screen.getByRole("button", { name: "Request Level 2" }));
    await screen.findByText("Level 2 request pending. First Claes must approve it.");
    expect(client.rpc).toHaveBeenCalledWith("secondself_request", { requested_level: 2 });
  });

  it("queues a voicemail and displays the stored acknowledgement", async () => {
    client.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-session-token" } },
      error: null,
    });
    let refreshed = false;
    client.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data:
        name === "secondself_access"
          ? { level: 1, is_owner: false }
          : name === "secondself_voicemail"
            ? ((refreshed = true), { queue_position: 2, message_id: 5 })
            : refreshed
              ? [
                  { id: 5, role: "user", body: "Please call me", queue_status: "pending" },
                  { id: 6, role: "assistant", body: "Tack för ditt meddelande." },
                ]
              : [],
    }));
    render(<AccessPanel />);
    await screen.findByText("Level 1 access · Second Claes");
    fireEvent.change(screen.getByLabelText("Fråga eller meddelande till First Claes"), {
      target: { value: "Please call me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Skicka" }));
    await screen.findByText("Tack för ditt meddelande.");
    expect(screen.getByRole("status")).toHaveTextContent("Köplats: 2");
    expect(client.rpc).toHaveBeenCalledWith("secondself_voicemail", {
      message_body: "Please call me",
    });
    expect(screen.queryByText("Meddelanden till First Claes")).not.toBeInTheDocument();
  });

  it("answers a pre-MCP question in text without queuing a message", async () => {
    client.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-session-token" } },
      error: null,
    });
    client.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data: name === "secondself_access" ? { level: 1, is_owner: false } : [],
    }));
    render(<AccessPanel />);
    await screen.findByText("Level 1 access · Second Claes");
    fireEvent.change(screen.getByLabelText("Fråga eller meddelande till First Claes"), {
      target: { value: "Who are you?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Skicka" }));
    await screen.findByText(/personlig digital assistent till First Claes/);
    expect(client.rpc).not.toHaveBeenCalledWith("secondself_voicemail", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "What can you do?" }));
    await screen.findByText(/ingen allmän AI-chatt/);
    expect(client.rpc).not.toHaveBeenCalledWith("secondself_voicemail", expect.anything());
  });

  it("does not grant access when the server denies the session", async () => {
    client.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "test" } },
      error: null,
    });
    client.rpc.mockResolvedValue({ data: null, error: new Error("Access denied") });
    render(<AccessPanel />);
    await screen.findByText("Sign-in succeeded, but access could not be loaded.");
    expect(
      screen.queryByRole("region", { name: "Your SecondSelf access" }),
    ).not.toBeInTheDocument();
  });

  it("does not claim success when the provider fails", async () => {
    client.auth.signInWithOtp.mockResolvedValue({ error: new Error("Unavailable") });
    render(<AccessPanel />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Example User" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Request access" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("could not be completed"),
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
