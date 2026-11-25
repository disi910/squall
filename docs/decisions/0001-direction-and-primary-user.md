# 0001: Two tracks, for teams building operations agents

- **Date:** 2026-11-25
- **Status:** decided by the owner
- **Context:** [`roadmap.md`](../roadmap.md), questions 2 and 3, and Phase 1

## Decision 1: two tracks on one environment

Squall measures both models and agents, on the same environment, faults and graders.

- **The model track** runs Squall's reference agents (ReAct, plan-and-execute, ReAct with a verifier) across models. It answers: how robust is model X under realistic faults, and how much does a standard scaffold help?
- **The agent track** lets users bring their own agent, through an MCP server for the environment and an Inspect agent entry point. It answers: is my agent more robust than a plain reference agent? The reference agents are the baselines to beat.

Users run the agent track locally or in CI with their own API keys. Squall does not host or run uploaded agents.

**Why:**

- No existing benchmark centers on fault injection plus replayable traces, and the agent track is where that matters most.
- It adds no API spend for the owner.
- A model benchmark alone would sit in a crowded field (τ-bench, AppWorld, AgentDojo).

**Rejected:** a model benchmark only. It's smaller in scope, but less useful to people building agents and less distinctive.

## Decision 2: the primary user is teams building operations agents

The primary user is teams building tool-using agents for operations work (support, back office, internal tools), who need to know how their agent behaves when tools misbehave before they deploy it.

The secondary users are people evaluating models, who want comparable numbers and traces, and the portfolio audience, who wants a clear, defensible story.

**Why:** these teams have a concrete need Squall can meet: robustness as a CI check, and fault injection for their own tools.

**Rejected as primary:**

- **Model evaluators:** they're well served by existing benchmarks.
- **The portfolio audience:** it would favor polish over usefulness, though the story stays a secondary goal.

## What follows

- **Phases 2–4 are unchanged:** reference agent designs on Haiku, then environment v2's design, build and Haiku baseline.
- **Phase 5 (bring your own agent) is confirmed:** the MCP server, `--agent`, a guide with two example agents, and a GitHub Action.
- **Phase 7 is ordered by this user's needs:** the fault-injection proxy for their own tools, custom graders, regression comparison and a failure taxonomy.
- **Environment v2 is designed with MCP in mind:** tool surfaces an MCP client can use as they are.
- **Still open:** hosted submissions and a public agent leaderboard (Phase 7, open question 4).
