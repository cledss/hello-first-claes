<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Ownership and workflow (Hello Claes / SecondSelf)

- GitHub is the single source of truth. All further development MUST happen in Codex via GitHub pull requests.
- Lovable only provided the bootstrap landing page; keep Lovable edits minimal.
- Codex owns: authentication, access levels, database, admin approval, personal MCP endpoint, SecondSelf-to-SecondSelf interactions, and tests.
- No mock auth or fake backend. The "Request access" form is an inert placeholder until real access requests ship — never show fake success.
- Access model to implement: Level 0 anonymous (intro + request login); Level 1 auto-granted to verified new users; Level 2+ only via explicit authenticated approval by First Claes (separate admin approval flow).
- Hero portrait (src/assets/portrait-placeholder.jpg) is a placeholder to be replaced by the uploaded image.
