# Squall roadmap

Written 2026-11-25, after the Haiku trial went live. It assesses four open questions from the owner, recommends a direction for each, and orders the remaining work into phases. Decisions marked **Owner decides** need the owner's answer before that phase starts. Everything else is a recommendation the owner can override.

Each phase follows the working rules from the harness phase: explain choices before building, work milestone by milestone, stop for review after each milestone, get explicit approval before any paid API batch, and change nothing to make results more or less interesting.

## Where Squall stands

- The live site shows a real trial: Claude Haiku 5.5 with one reference ReAct agent. That is 480 runs over 20 tasks, 8 fault settings and 3 seeds. 394 of 480 succeeded, silent failure succeeded in 0 of 60, and injection was resisted in 60 of 60.
- The environment ("setup v1") is frozen at commit `9e405eb`, with the review fixes at `047b21d`. It is a small simulated order-support desk: 9 tools, a JSON world, one ticket per run, and one customer message with no follow-up conversation.
- Sonnet 5.5 and Opus 5.5 are deferred for cost.

## The four questions

### 1. Should the world be as complex as real systems?

**Yes, within limits we can defend.** Setup v1 is deliberately small, and it is more trivial than the systems these agents are deployed into. The gaps that matter most:

| Real systems have                                                                                                                                                                      | Setup v1 has                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Several systems with their own APIs: a help desk (tickets, threads, macros, tags), order management, a payment processor (charges, refunds, disputes), a carrier API, a knowledge base | One flat set of 9 tools over one JSON world |
| Large databases that must be searched and paged through                                                                                                                                | One to three orders per task                |
| Pagination, partial results, auth tokens that expire, permissions, idempotency keys, asynchronous jobs                                                                                 | Single-call tools that return everything    |
| Policy spread over a searchable knowledge base, with versions and exceptions                                                                                                           | The whole handbook in the system prompt     |
| Conversations: the customer answers questions, changes their mind, pushes back                                                                                                         | One message, no follow-up                   |
| An inbox with many tickets, priorities and SLAs                                                                                                                                        | Exactly one open ticket                     |

**Recommendation:**

- Build an **environment v2** whose tool surfaces follow the shape of widely used public APIs: help desk, commerce, payments and carrier APIs. Use the same kinds of ids, pagination, error codes and status models, without copying any vendor's API or branding.
- Keep v1 as **tier 1** and add harder **tiers**, so results stay comparable and the matrix still separates stronger models (planned since the harness phase).

**What to avoid:**

- **Claiming realism we can't show.** Every v2 feature should cite the real-world pattern it models.
- **Complexity that only adds cost.** A tier earns its place if it changes how agents fail.

**Prior art to review before designing v2:** τ-bench and τ²-bench (policy-following support agents with a simulated user), AppWorld and ToolSandbox (many stateful apps and APIs), and AgentDojo (prompt injection through tools). Squall's niche stays **fault injection plus replayable traces**, which none of these centers on.

### 2. What is Squall for: models, agents, or both?

**Definitions.** A **model** is the LLM. An **agent** is a model plus its scaffold: the system prompt, the control loop (ReAct, plan-and-execute, …), how it uses tools, any memory, and any self-checks such as a verifier step. Today Squall varies the model and keeps one reference scaffold fixed, so it measures **models under a reference agent**.

**Recommendation: two tracks on the same environment, faults and graders.**

- **Model track (what we do now).** Squall runs a small set of **reference agents** (ReAct, plan-and-execute, ReAct with verifier) across models. This answers "how robust is model X under realistic faults, and how much does a standard scaffold help?"
- **Agent track (new).** Users bring their own agent, and Squall evaluates it on the same tasks and faults. This answers "is my agent more robust than a plain Opus agent?", which is exactly the owner's question. Squall's own reference agents are the baselines to beat.

**How users define an agent, using standard interfaces rather than a format of our own:**

- **MCP.** Squall exposes its environment as an MCP server: tools in, results out, with faults injected and every call recorded on the server side. Any framework that speaks MCP can connect: the Claude Agent SDK, OpenAI's Agents SDK, LangGraph, or custom code. Grading happens on Squall's side from the recorded world, so the agent's internals don't matter. This is the most framework-neutral option.
- **Inspect agents.** Python agents can plug in as Inspect agents (and Inspect's agent bridge can wrap some third-party frameworks; check its current docs). This reuses the harness as it is.

**Uploading agent harnesses to a hosted Squall: not now.** It means running untrusted code (sandboxing and abuse risk) and paying for other people's tokens. Instead, users run Squall locally or in CI with their own API keys, and publish the resulting dataset. Traces are replayable and the validator re-checks every contract rule, but a self-reported run can't prove which model produced it. A public agent leaderboard therefore needs a trust policy first (Phase 7).

**Owner decides:** confirm the two-track direction, or keep Squall a model benchmark only.

### 3. Who is the user, and what would make Squall more useful to them?

**Recommendation:**

- **Primary user:** teams building tool-using agents for operations work (support, back office, internal tools). They need to know before deploying how their agent behaves when tools misbehave.
- **Secondary users:**
  - people evaluating models, who want comparable numbers and traces
  - the portfolio audience, who wants a clear, defensible story

**What would make Squall useful to the primary user,** roughly in order of value:

1. **Bring your own agent** (MCP and Inspect, above), with a one-command local run and a GitHub Action, so robustness becomes a CI check.
2. **A fault-injection proxy for their own tools.** Squall sits between their agent and their real MCP servers and injects seeded faults (timeouts, rate limits, malformed or stale responses, silent failures, injected text), recording a replayable trace. This is "chaos engineering for agent tools", and it is useful even without Squall's simulated shop.
3. **Their own graders:** assertions over the final state or the trace, so they can test their own environment.
4. **Regression comparison:** two datasets side by side (before and after a prompt change, or two models), showing which cells got better or worse.
5. **A failure taxonomy per run:** what went wrong and where (tool misuse, policy violation, unverified action, unnecessary escalation, injection followed), aggregated across runs.

**Owner decides:** confirm the primary user. It shapes Phases 5 and 7.

### 4. How do agents usually fail in real environments, and does the fault set cover it?

Setup v1 injects 7 faults: timeout, rate limit, malformed response, stale data, contradictory sources, silent failure and prompt injection. Real deployments fail in more ways. Some of these are tool faults Squall can inject; others are properties of the task or the user:

| Failure source                                                                         | Kind       | In v1?                             | Recommendation                                                                                                     |
| -------------------------------------------------------------------------------------- | ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Pagination and truncation: the needed record is on page 2, or a list is cut short      | Tool fault | No                                 | **Add** (very common, cheap to inject)                                                                             |
| Auth expiry or a permission error mid-session (401/403)                                | Tool fault | No                                 | **Add**                                                                                                            |
| Schema drift: a renamed field, a new enum value, a changed type                        | Tool fault | No                                 | **Add**                                                                                                            |
| Eventual consistency: a write is accepted but a read shows the old state               | Tool fault | Partly (silent failure)            | **Add** as its own fault; silent failure stays                                                                     |
| Duplicate side effects on retry (no idempotency)                                       | Tool fault | Partly (malformed write responses) | **Add** with idempotency keys in v2 tools                                                                          |
| Noisy or oversized output: distractors, huge payloads that crowd the context           | Tool fault | No                                 | **Add**                                                                                                            |
| Injection through retrieved documents (knowledge base), not just tickets               | Tool fault | No                                 | **Add** with the v2 knowledge base                                                                                 |
| Social engineering: a customer claims authority, pressures, or lies                    | Task/user  | No                                 | **Add** as task variants (no fault layer needed)                                                                   |
| Ambiguous requests, several matching records                                           | Task       | Yes (T14)                          | Expand in v2 tiers                                                                                                 |
| Multi-turn drift: the user changes their mind or adds information later                | Task/user  | No                                 | v2 with a **scripted** customer first; an LLM-simulated customer only if needed (it adds cost and non-determinism) |
| Several faults at once                                                                 | Tool fault | No                                 | **Add** a small set of realistic combinations (an open question since schema 0.1)                                  |
| Agent-side errors: invented tools or arguments, loops, giving up early, budget overrun | Agent      | Recorded (limits, unknown tools)   | Report them in the failure taxonomy (Question 3, item 5)                                                           |

**Recommendation:** treat this table as the input to the v2 fault and task design. Each new fault needs:

- a seeded plan
- an annotation in the trace
- a clear correct behavior in the handbook
- a grader rule

The same discipline as v1, so results stay defensible.

## Phases

Ordered so that cheap, high-information work comes first, the environment is made realistic **before** the expensive model comparisons, and the agent track is built on the environment it will be used with.

### Phase 0: Housekeeping (no spend, small)

1. **Done: stale-deploy error.** After a deploy, an open tab that navigates to a page whose old script file is gone gets an error page. Reload once automatically when a page's script fails to load. (Seen on the live site on 2026-11-24; fixed in `src/reloadOnce.ts`.)
2. **Required CI checks** on `main` (a GitHub setting, the owner's action), so merging can wait for CI.
3. **Done: CLI cost estimate.** It now uses the token use measured in the Haiku trial (about $0.0009 per Haiku run with caching) instead of the pre-caching guess, which was about six times too high. Sonnet and Opus are priced on Haiku's tokens, and the prompt says a larger model may use more.
4. **Missing test:** exporting runs that end at a message or token limit, or a refusal.
5. **Copy that assumes one model** ("Claude Haiku 5.5 so far" in `src/content/copy.ts`): derive it from the manifest.

### Phase 1: Decide the direction (no code)

The owner answers the **Owner decides** items above (the two tracks, the primary user), and the answers go into a short decision record in `docs/decisions/`. Everything after depends on them.

### Phase 2: Reference agent designs on Haiku (cheap, high information)

- Add **ReAct with verifier** and **plan-and-execute** as Inspect agents next to the current ReAct agent. The schema and the site already support several designs; the mock phase showed the views.
- Run them on the frozen setup v1 with Haiku: 480 runs each, about $0.45 per design. Each batch needs the owner's go-ahead.
- **Question it answers:** does scaffolding beat the raw model? The obvious test is silent failure, which plain ReAct handles in 0 of 60 runs. If a verifier step fixes it, the site has its first real design finding, and the agent track has proof that agents, not just models, matter.

### Phase 3: Environment v2 design (spec, no spend)

- Review the prior art (Question 1).
- Write the v2 design: tool surfaces shaped like real APIs, larger databases, pagination and auth, a knowledge base, a multi-ticket inbox, a scripted multi-turn customer, task tiers, the new faults and task variants (Question 4), and grading for multi-turn tasks.
- **Introduce setup versions** in the data format: the manifest names the environment version, so v1 and v2 results are never mixed.
- Run it through the same process as the harness phase: a builder check, then the owner's approval.

### Phase 4: Environment v2 build and Haiku baseline

Build v2 milestone by milestone, keeping v1 runnable. Then:

- run the smoke test, the epoch-1 review and the freeze, as in the Haiku trial
- run Haiku's baseline on v2, with all reference designs

Haiku keeps this cheap.

### Phase 5: Bring your own agent

- An **MCP server** for the Squall environment: faults and recording on the server side, grading from the recorded world.
- An **Inspect agent entry point** and `squall-harness run --agent <path>`.
- A guide, "Define an agent", with two example agents: a minimal one, and one built with a popular agent SDK.
- Datasets from user agents load in the site locally (`npm run dataset:use`).
- A **GitHub Action** that runs a chosen grid and fails the build on a regression.

### Phase 6: Model comparison on v2

Run Sonnet 5.5 and Opus 5.5 with the reference agents on the frozen v2, when the budget allows and on the owner's go-ahead. Running them once on v2, rather than on v1 first, spends the budget once on the setup that matters. Open models on the DTU HPC cluster follow, since Inspect supports local providers.

### Phase 7: For agent developers' own systems

- The **fault-injection proxy** for users' own MCP servers.
- **Custom graders.**
- **Regression comparison** between two datasets.
- **A failure taxonomy** per run.
- Optionally, **a public agent leaderboard** with submitted traces and a stated trust policy.

## Open questions

1. Two tracks, or a model benchmark only? (Phase 1)
2. Is the primary user the agent developer? (Phase 1)
3. How far should v2's multi-turn customer go: scripted only, or an LLM-simulated customer for some tiers? (Phase 3)
4. Should the agent track ever accept hosted submissions, and under what trust policy? (Phase 7)
