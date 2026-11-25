# Known gaps in the web app

Controls that exist and work, but have nothing useful to do with the current data, and limits that are deliberate for now. Audited 2026-11-24 against the deployed Haiku trial (one model, three seeds). Every button and link on the site was checked: each one does something; none is a placeholder.

## Open bug

- **Stale page scripts after a deploy.** A tab opened before a deploy that then navigates to another page asks for that page's old script file, which no longer exists, and shows the error page until reloaded. The fix (reload once when a page's script fails to load) is Phase 0, item 1 in [`roadmap.md`](roadmap.md).

## Controls with no visible effect yet

These work, and they start to matter once more than one model has run (Sonnet 5.5 and Opus 5.5 are deferred for cost).

- **Leaderboard column sorting.** Sorting works, but with one agent config there is only one row to order.
- **Runs: the Agent filter.** It lists the single agent config, so choosing it changes nothing.
- **Matrix: rows per model.** The matrix groups rows by model; with one model there is one group.

## Hidden until the data supports it

- **The agent-design finding** (verifier vs plain ReAct) is hidden: only the ReAct design has run.
- **Golden traces** (the hand-written showcase runs from the preview) are not part of the real dataset, so the Runs page hides their section and the Leaderboard drops its note about them. Both come back with the simulated data (`npm run generate`).

## Limits kept as they are

- **The model's reasoning is not shown in replays.** Claude's thinking is not returned by default, so traces show tool calls, results, replies and any text between tool calls.
- **Wide tables scroll sideways below about 1,200 px.** The leaderboard (1,166 px of columns) and the runs table scroll inside their cards on laptops and phones; an edge fade now shows that more columns are there. Making the tables narrower would change their look, so they were left as they are.
- **The navigation scrolls sideways on phones.** All six links do not fit at 375 px; the edge fade shows the rest.
- **Some copy names the current model.** The "How a run works" agent step says "Claude Haiku 5.5 so far"; update it, and check `src/content/copy.ts` for other wording that assumes one model, when Sonnet and Opus are added.
