import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessPanel } from "@/components/access-panel";

const client = vi.hoisted(() => ({
  auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn() },
  rpc: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuthClient: () => client }));

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-test-configuration");
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe("email access flow", () => {
  it("sends a real-provider OTP request, verifies, then loads server-authorized access", async () => {
    client.auth.signInWithOtp.mockResolvedValue({ error: null });
    client.auth.verifyOtp.mockResolvedValue({ error: null });
    client.rpc.mockImplementation(async (name: string) => ({
      error: null,
      data: name === "secondself_access" ? { level: 1 } : [],
    }));
    render(<AccessPanel />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Example User" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Request access" }));
    await screen.findByLabelText("Email verification code");
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.invalid",
      options: { data: { full_name: "Example User" } },
    });
    fireEvent.change(screen.getByLabelText("Email verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await screen.findByText("Level 1 access · Second Claes");
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      email: "user@example.invalid",
      token: "123456",
      type: "email",
    });
    fireEvent.click(screen.getByRole("button", { name: "Request Level 2" }));
    await screen.findByText("Level 2 request pending. First Claes must approve it.");
    expect(client.rpc).toHaveBeenCalledWith("secondself_request", { requested_level: 2 });
  });

  it("keeps private access closed when code verification fails", async () => {
    client.auth.signInWithOtp.mockResolvedValue({ error: null });
    client.auth.verifyOtp.mockResolvedValue({ error: new Error("Invalid or expired code") });
    render(<AccessPanel />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Example User" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Request access" }));
    await screen.findByLabelText("Email verification code");
    fireEvent.change(screen.getByLabelText("Email verification code"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("could not be completed"),
    );
    expect(client.rpc).not.toHaveBeenCalled();
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
    expect(screen.queryByLabelText("Email verification code")).not.toBeInTheDocument();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
