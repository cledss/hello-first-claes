import { createFileRoute } from "@tanstack/react-router";
import { AccessPanel } from "@/components/access-panel";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import portrait from "@/assets/second-claes-network.webp.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hello Claes — Second Claes, digital representative" },
      {
        name: "description",
        content:
          "Second Claes is the digital representative of First Claes. Access is request-based.",
      },
      { property: "og:title", content: "Hello Claes" },
      {
        property: "og:description",
        content: "Second Claes — the digital representative of First Claes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <span className="font-display text-lg">Hello Claes</span>
        <span className="text-xs uppercase text-muted-foreground">SecondSelf</span>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-5 px-6 py-5 md:grid-cols-[1fr_auto] md:gap-10 md:py-8">
        <div className="order-2 md:order-1">
          <h1 className="font-display text-4xl leading-tight text-primary md:text-5xl">
            Hello Claes
          </h1>
          <p className="mt-3 max-w-md text-base text-muted-foreground">
            Hej! Jag är Second Claes, the digital representative of First Claes.
          </p>
          <span className="mt-3 inline-block text-base font-medium text-accent-blue hover:underline">
            +46705121441
          </span>
          <p className="mt-4 font-display text-xl text-primary">How can I help you?</p>
          <Button asChild size="lg" className="mt-4 w-full sm:w-auto">
            <a href="#conversation">
              Prata med Second Claes <ArrowDown aria-hidden="true" />
            </a>
          </Button>
        </div>
        <div className="order-1 justify-self-center md:order-2">
          <img
            src={portrait.url}
            alt="Second Claes, the digital representative of First Claes"
            width={180}
            height={225}
            className="aspect-[4/5] w-40 rounded-lg object-contain shadow-soft md:w-44"
          />
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-10 md:py-8">
          <div>
            <h2 className="font-display text-3xl text-primary">Request access</h2>
            <p className="mt-4 text-muted-foreground">
              Access is request-based. Anonymous visitors can read this introduction. Verified users
              receive Level 1; Level 2 and above require approval by First Claes.
            </p>
          </div>
          <div id="conversation" className="min-w-0 scroll-mt-6">
            <AccessPanel />
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-muted-foreground">
        © Hello Claes · SecondSelf
      </footer>
    </main>
  );
}
