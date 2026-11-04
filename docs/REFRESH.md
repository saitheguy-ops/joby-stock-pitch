# Refreshing the Joby briefing

Follow these steps exactly when asked to **"refresh the Joby briefing"**. The analysis is written by a Claude Code session; the app only displays it. No API keys are needed.

## Ground rules (never break these)

1. **The snapshot is the only source of facts.** Every number, date, quote and URL in the briefing must come from `data/snapshot.json`. Do not use memory, web search or anything else, even if you "know" something newer.
2. **Every bullet cites a source** as a markdown link whose URL appears in the snapshot (`npm run briefing:check` enforces this).
3. **Missing means missing.** If a source failed (`sourcesStatus` shows `ok: false`) or a field is `null`, say "not available in this snapshot". Never estimate or fill the gap.
4. **Don't hand-edit `data/snapshot.json`.** Regenerate it with `npm run snapshot`.
5. **Assumptions change only with evidence,** logged in `content/assumptions.json` → `changelog` (see step 4).

## Steps

### 1. Start from the latest `main`

```bash
git checkout main && git pull origin main && npm install
```

### 2. Read the previous briefing

Open `content/briefing.md`. Note its front-matter (`date`, `verdict`, `price_target`, `price_at_writing`) and its scorecard ratings. These become the "previous" values and the baseline for "what changed".

### 3. Take a fresh snapshot

```bash
npm run snapshot
npm run snapshot:check
```

`npm run snapshot` writes `data/snapshot.json` and moves the old one to `data/snapshot.previous.json`. Read the console output: if any source failed, record it and carry on with what is available.

Compare the two snapshots (or the previous briefing's numbers) and list what moved:

- `price`, `performance` (1W/1M vs SPY and peers), `analysts`
- `metrics`: cash, `quarterlyBurn`, `runway`, `shares.latest` and dilution, `certification.statements`, `filingMilestones`, `legal`
- `filings` and `news` that are new since the previous briefing's `data_as_of`; their `reaction.firstReaction` (vs `spySameDay`/`spyNextDay`). If `reaction.partial` is true, say the move is intraday. Press releases picked up by Google News often carry a date-only timestamp (07:00 UTC), so for those quote both `sameDay` and `nextDay` rather than claiming the exact reaction. Prefer the SEC filing's reaction (it has an exact acceptance time) when both exist.
- `events` that were added, moved or have passed
- `valuation`: weighted target, scenario prices, `impliedFleetAtScale`

Pick the **3–5 items that matter for the thesis**: certification, cash/dilution, launch timing, deals, and big price reactions. Skip noise such as market-research press releases and repeated syndications of one story.

### 4. Update valuation assumptions only if the evidence supports it

Assumptions live in `content/assumptions.json` (judgment, not facts). Change one only when a snapshot item directly bears on it. For example:

| Evidence in the snapshot | Assumption it can move |
| --- | --- |
| Filing changes the first-passenger / certification target date | `launchYear` |
| New equity raise, ATM usage or share count jump | `futureDilution` |
| Disclosed fleet, production rate or unit economics | `fleetAtScale`, `revenuePerAircraftM`, `costPerAircraftM` |
| Nothing new on a driver | leave it unchanged |

The burn input updates automatically from filings, so don't edit it.

If you change anything:

1. Edit the values and set `asOf` to today.
2. Append to `changelog`: `{ "date", "change", "reason", "sources": [snapshot URLs] }`.
3. Re-run `npm run snapshot` so `valuation` reflects the new assumptions.
4. In the briefing's "What it means for the price" section, say what changed and why.

If you change nothing, say so in that section ("assumptions unchanged: no new evidence on …").

### 5. Rewrite `content/briefing.md`

Front-matter (all required except where noted):

```yaml
---
date: YYYY-MM-DD                       # today
data_as_of: <snapshot.generatedAt>     # copy exactly
verdict: BUY | HOLD | SELL             # = snapshot.valuation.recommendation unless you justify an override
price_target: 4.19                     # = snapshot.valuation.weighted.target, 2 decimals
price_at_writing: 5.11                 # = snapshot.price.value, 2 decimals
previous_verdict: SELL                 # from the old front-matter
previous_price_target: 4.19
previous_date: YYYY-MM-DD
---
```

Sections, in this order, with these exact `##` headings:

1. `## Verdict and what changed since last time`: 2–3 bullets. Give the verdict and target vs. last time, and the main reason.
2. `## Status scorecard`: exactly five bullets, in this format (the page parses it):
   `- **Certification:** improving — one-line reason ([source](url))`
   Areas: `Certification`, `Cash runway`, `Dilution`, `Launch timeline`, `Partnerships/deals`. Ratings: `improving`, `stable` or `worsening`, judged against the previous briefing.
3. `## What changed`: 3–5 bullets. For each: what happened, why it matters, and the stock's reaction (first-reaction % vs. SPY, from the snapshot).
4. `## What it means for the price`: which assumptions the news supports or challenges, any assumption changes made in step 4, and the weighted target with its scenario prices.
5. `## Upcoming events`: one bullet per event, in this format (the page draws a timeline from it):
   `- **2027-01-15** — Event — why it matters ([source](url))`
   Use `snapshot.events`. For month- or year-precision dates, write `Jan 2027` or `2026`.
6. `## Things to watch`: 3–5 measurable signals, each with a threshold and the snapshot value it is measured against (e.g. "quarterly burn above $250M; last quarter $202M").

Style: one screen of reading (~600–800 words), plain English, numbers rounded sensibly, dates as written in the snapshot. Educational, not investment advice.

### 6. Keep a dated copy

```bash
mkdir -p content/briefings
cp content/briefing.md content/briefings/$(date +%F).md
```

If a file for today already exists, append `-2`, `-3`, and so on. Never edit older copies; they are the history shown on the Briefing page.

### 7. Check everything

```bash
npm run snapshot:check
npm run briefing:check
npm run lint
npm test
npm run build
```

All must pass. `briefing:check` fails on any uncited bullet or any URL that isn't in the snapshot: fix the briefing, not the checker.

### 8. Commit and push to `main`

```bash
git add data/snapshot.json data/snapshot.previous.json content/briefing.md content/briefings content/assumptions.json
git commit -m "Refresh Joby briefing YYYY-MM-DD: VERDICT \$TARGET (was PREV_VERDICT \$PREV_TARGET)"
git push origin main
```

Then reply with: the verdict and target (and the change), the 3–5 things that changed, any assumption changes with their reasons, and any sources that were unavailable.
