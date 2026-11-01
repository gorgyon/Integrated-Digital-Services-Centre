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

## Platform boundaries

- Keep the TanStack file-based bootstrap and an explicit edge-compatible deployment target; this preserves one deployable codebase inside and outside Lovable.
- Shared browser-safe platform identity belongs in `src/lib/platform.ts`; future business modules belong in separate `src/modules/<domain>/` directories and must reuse shared services, keeping orders and employment applications separate.
- Deployment and backup tooling stays outside application imports in `scripts/` and `docs/`; it may use local Node APIs without putting unsupported APIs into the edge runtime.
- M02 creates no data/storage clients or business entities; provider activation and operational backup automation require their approved later milestone.
