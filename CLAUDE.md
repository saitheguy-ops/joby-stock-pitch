# CLAUDE.md

@AGENTS.md

## Refreshing the briefing

When asked to **"refresh the Joby briefing"**, follow [docs/REFRESH.md](docs/REFRESH.md) step by step:

1. `npm run snapshot`
2. Compare with the previous briefing.
3. Change `content/assumptions.json` only with logged evidence.
4. Rewrite `content/briefing.md`.
5. Copy it to `content/briefings/YYYY-MM-DD.md`.
6. Run `snapshot:check`, `briefing:check`, lint, tests and build.
7. Commit and push to `main`.

Never invent facts or cite anything that is not in `data/snapshot.json`.

## Project rules

- Every number or claim shown in the app links to a dated source; if data is missing, show "unavailable", never a guess.
- No API keys anywhere. SEC requests use `SEC_USER_AGENT` (generic default, no personal email).
- Valuation math lives in `src/lib/valuation.ts` (unit-tested). Assumptions live in `content/assumptions.json`, with a changelog.
- Before committing, run `npm run lint`, `npm test` and `npm run build`.
