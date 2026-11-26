# Known gaps in the web app

Controls that exist and work, but have nothing useful to do with the current data, and limits that are deliberate for now. Audited 2026-11-24 against the deployed Haiku trial (one model, three seeds), and updated 2026-11-26 for Phase 2 (one model, three agent designs). Every button and link on the site was checked: each one does something; none is a placeholder.

## Fixed

- **Stale page scripts after a deploy** (Phase 0, item 1). A tab opened before a deploy that then navigated to another page asked for that page's old script file, which no longer exists, and showed the error page. Now a failed page or schema script reloads the page once (`src/reloadOnce.ts`). A second failure within 10 seconds is a real error and shows the error page, so there is no reload loop. One path is left: the data worker's script. Every page starts the worker on its first render, so a stale tab already has it, unless the tab's first page was the 404 page.

- **Controls with nothing to do** (Phase 2). With three agent configs, leaderboard sorting and the Runs page's Agent filter now order and filter real rows, and the agent-design finding (verifier vs plain ReAct) shows on the landing page and in the report.
- **Copy that named one design** (Phase 2). The "How a run works" step and the leaderboard intro name the designs from the manifest, and the verifier finding is worded by the direction of the difference.

## Controls with little effect yet

- **Matrix: rows per model.** The matrix groups rows by model. With one model there is one group of three designs; more groups come with Sonnet and Opus.

## Hidden until the data supports it

- **Golden traces** (the hand-written showcase runs from the preview) are not part of the real dataset, so the Runs page hides their section and the Leaderboard drops its note about them. Both come back with the simulated data (`npm run generate`).

## Limits kept as they are

- **The model's reasoning is not shown in replays.** Claude's thinking is not returned by default, so traces show tool calls, results, replies and any text between tool calls.
- **Wide tables scroll sideways below about 1,200 px.** The leaderboard (1,166 px of columns) and the runs table scroll inside their cards on laptops and phones; an edge fade now shows that more columns are there. Making the tables narrower would change their look, so they were left as they are.
- **The navigation scrolls sideways on phones.** All six links do not fit at 375 px; the edge fade shows the rest.
- **The report names Haiku and the three designs.** `src/content/report.mdx` is the write-up of this dataset, so its prose names them on purpose; every number in it is still computed live.
- **Setup v1 gives no current date.** The handbook's 30-day refund window can't be checked against "today". Plan-and-execute, which checks it explicitly, escalates many refunds because of it ([review notes](../datasets/haiku-trial/REVIEW.md#observations)). Environment v2 should give the date; v1 stays frozen.
