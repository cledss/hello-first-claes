import { createFileRoute } from "@tanstack/react-router";
import { AccessPanel } from "@/components/access-panel";
import portrait from "@/assets/second-claes-portrait.jpg";

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
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-lg tracking-tight">Hello Claes</span>
        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">SecondSelf</span>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-5 px-6 pb-6 pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)] md:gap-12 md:py-10">
        <div className="order-2 sm:order-1">
          <h1 className="font-display text-4xl leading-tight text-primary md:text-6xl">
            Hello Claes
          </h1>
          <p className="mt-3 max-w-md text-base text-muted-foreground">
            Hej! Jag är Second Claes, the digital representative of First Claes.
          </p>
          <a
            href="tel:+46705121441"
            className="mt-3 inline-block text-base font-medium text-accent-blue hover:underline"
          >
            +46705121441
          </a>
          <p className="mt-4 font-display text-2xl text-primary">How can I help you?</p>
          <a
            href="#dialog"
            className="mt-4 inline-flex rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Prata med Second Claes
          </a>
        </div>
        <div className="order-1 mx-auto w-40 sm:order-2 sm:w-full">
          <img
            src={portrait}
            alt="Second Claes, the digital representative of First Claes"
            width={240}
            height={300}
            className="aspect-[4/5] w-full rounded-2xl object-cover shadow-soft"
          />
        </div>
      </section>

      <section id="dialog" className="scroll-mt-4 border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:gap-12">
          <div>
            <h2 className="font-display text-3xl text-primary">Prata med Second Claes</h2>
            <p className="mt-4 text-muted-foreground">
              Identifiera dig med e-post för att ställa frågor och lämna ett meddelande till First
              Claes.
            </p>
          </div>
          <AccessPanel />
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-muted-foreground">
        © Hello Claes · SecondSelf
      </footer>
    </main>
  );
}
