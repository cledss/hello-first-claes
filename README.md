# Hello Claes (SecondSelf)

## Ownership and workflow (Hello Claes / SecondSelf)

- GitHub is the single source of truth. All further development MUST happen in Codex via GitHub pull requests.
- Lovable only provided the bootstrap landing page. The Lovable project is two-way synced with `main`; keep Lovable edits minimal. See AGENTS.md.
- Codex owns: authentication, access levels, database, admin approval, personal MCP endpoint, SecondSelf-to-SecondSelf interactions, and tests.
- No mock auth or fake backend. The "Request access" form is an inert placeholder until real access requests ship — never show fake success.
- Access model to implement: Level 0 anonymous (intro + request login); Level 1 auto-granted to verified new users; Level 2+ only via explicit authenticated approval by First Claes (separate admin approval flow).
- Hero portrait: `src/assets/second-claes-portrait.jpg` (currently a neutral placeholder; Codex supplies the real portrait).

## Original Lovable notes

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

You need Node.js and [bun](https://bun.sh).

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
bun run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
