import { createFileRoute } from "@tanstack/react-router";
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

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-10 md:grid-cols-2 md:py-20">
        <div className="order-2 md:order-1">
          <h1 className="font-display text-5xl leading-tight text-primary md:text-7xl">
            Hello Claes
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">
            Hej! Jag är Second Claes, the digital representative of First Claes.
          </p>
          <a
            href="tel:+46705121441"
            className="mt-6 inline-block text-lg font-medium text-accent-blue hover:underline"
          >
            +46705121441
          </a>
          <p className="mt-10 font-display text-2xl text-primary">How can I help you?</p>
        </div>
        <div className="order-1 md:order-2">
          <img
            src={portrait}
            alt="Second Claes, the digital representative of First Claes"
            width={896}
            height={1120}
            className="aspect-[4/5] w-full rounded-2xl object-cover shadow-soft"
          />
        </div>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl text-primary">Request access</h2>
            <p className="mt-4 text-muted-foreground">
              Access is request-based. Anonymous visitors can read this introduction. Verified users
              receive Level 1; Level 2 and above require approval by First Claes.
            </p>
          </div>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="space-y-4"
            aria-describedby="access-note"
          >
            <label className="block text-sm">
              Name
              <input
                disabled
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Email
              <input
                type="email"
                disabled
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <button
              disabled
              className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground opacity-60"
            >
              Request access
            </button>
            <p id="access-note" className="text-sm text-muted-foreground">
              Not yet available. Login and access requests are not active yet.
            </p>
          </form>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-muted-foreground">
        © Hello Claes · SecondSelf
      </footer>
    </main>
  );
}
