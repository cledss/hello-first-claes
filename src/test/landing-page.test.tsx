import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/index";

const Index = Route.options.component!;

describe("Landing page", () => {
  it("shows the required Hello Claes copy", () => {
    render(<Index />);

    expect(screen.getByRole("heading", { level: 1, name: "Hello Claes" })).toBeInTheDocument();
    expect(
      screen.getByText("Hej! Jag är Second Claes, the digital representative of First Claes."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+46705121441" })).toHaveAttribute(
      "href",
      "tel:+46705121441",
    );
    expect(screen.getByText("How can I help you?")).toBeInTheDocument();
  });

  it("shows the Second Claes portrait, not the placeholder", () => {
    render(<Index />);

    const img = screen.getByRole("img", {
      name: "Second Claes, the digital representative of First Claes",
    });
    expect(img.getAttribute("src")).toContain("second-claes-portrait");
  });

  it("prioritizes the conversation with a visible dialogue anchor", () => {
    render(<Index />);
    expect(screen.getByRole("link", { name: "Prata med Second Claes" })).toHaveAttribute(
      "href",
      "#dialog",
    );
    expect(document.querySelector("#dialog")).toBeInTheDocument();
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
