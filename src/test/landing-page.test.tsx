import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/index";

const Index = Route.options.component;
if (!Index) throw new Error("Landing page component unavailable");

describe("Landing page", () => {
  it("shows the required Hello Claes copy", () => {
    render(<Index />);

    expect(screen.getByRole("heading", { level: 1, name: "Hello Claes" })).toBeInTheDocument();
    expect(
      screen.getByText("Hej! Jag är Second Claes, the digital representative of First Claes."),
    ).toBeInTheDocument();
    expect(screen.getByText("+46705121441")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "+46705121441" })).not.toBeInTheDocument();
    expect(screen.getByText("How can I help you?")).toBeInTheDocument();
  });

  it("shows the Second Claes portrait, not the placeholder", () => {
    render(<Index />);

    const img = screen.getByRole("img", {
      name: "Second Claes, the digital representative of First Claes",
    });
    expect(img.getAttribute("src")).toContain("second-claes-network.webp");
  });

  it("disables sign-in when provider configuration is missing", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    try {
      render(<Index />);
      expect(screen.getByRole("button", { name: "Request access" })).toBeDisabled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
