import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

  it("keeps the access request form inert until real auth exists", () => {
    render(<Index />);

    expect(screen.getByRole("button", { name: "Request access" })).toBeDisabled();
  });
});
