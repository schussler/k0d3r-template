# Agent Orchestration

## Available Agents

Located in this repo's `.claude/agents/` and invoked through the Agent tool by name
(`Agent(subagent_type: "planner", prompt: "...")`). Only the agents present there exist; stack-specific
agents (language reviewers, build resolvers, e2e runners) are adopted from ECC with
`/sync-ecc-tools --adopt` (see "Pacotes de stack" in `.claude/README.md`).

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| code-architect | Implementation blueprint from existing patterns | Designing a feature in an existing codebase |
| tdd-guide | Test-driven development, driven by the session | The red/green/refactor cycle outside `/k0d3r-task` |
| test-author | Failing tests written from the approved spec alone, with a clean context | In `/k0d3r-task`, after the spec is approved and before the code |
| acceptance-verifier | Checks each acceptance criterion by running, with a clean context; never edits | In `/k0d3r-task`, after the gates are green, and at the end of each slice in a task with more than one |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| silent-failure-hunter | Swallowed errors and bad fallbacks | Reviewing error paths |
| code-simplifier | Simplification without behaviour change | After a change works |
| type-design-analyzer | Type design and invariants | New or changed types |
| pr-test-analyzer | Test coverage quality of a PR | Before merging |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |
| docs-lookup | Current library docs via Context7 | Library/API questions |

For codebase exploration, use the built-in `Explore` subagent.

## When to Delegate

A subagent starts with none of your context and returns only a summary, and subagents can account for a large
part of what a session costs. Delegate when that buys something:

- the work is independent and can run while you do something else;
- the answer needs a sweep across many files and you only need the conclusion;
- you want a read that is not anchored on yours: a review, or one of the two clean-context roles below.

Do the work yourself when it fits in a handful of tool calls or when you already know where to look.

Which agents run at each step of a task is decided by the `/k0d3r-task` command, not by this rule:
`test-author` before the code, `acceptance-verifier` at the end of each slice and, with the reviewers, after
the gates are green. Outside the
command, `planner` and `architect` fit a change that reshapes the system, and `code-reviewer` fits a code diff
before it is committed.

The model and the effort of each agent come from `.claude/model-routing.json`; see
[model-routing.md](./model-routing.md).

## Parallel Task Execution

When the agents you decided to use are independent of each other, launch them in the same message so they run
concurrently. This is about how to launch agents, not a reason to launch more of them.

## Briefing a Clean-Context Agent

`test-author` and `acceptance-verifier` are worth what they cost only if they do not inherit your reasoning.
Their brief carries:

- `test-author`: the path of the approved spec.
- `acceptance-verifier`: the path of the spec and the base ref of the diff. In a task without a spec, the base
  ref and the claim "no behaviour change". At the end of a slice, in a task with more than one: the path of
  the spec, the base ref of the slice and the slice's name as the build plan writes it; it checks only the
  criteria the plan ties to that slice.

Leave out your plan, your summary of what was done and the conclusion you expect: an agent handed your
conclusion tends to return it confirmed. Read the diff an agent produced before relying on it
([verification.md](./verification.md), rule 9).

## Delegation Completion Contract

Applies to every agent at every depth (parent, child, grandchild):

1. **Your final message IS the deliverable.** Never end your turn with "waiting for background agents" — a spawned task is not a completed task. Ending your turn while children are running orphans their results (completed children cannot notify a parent whose turn has ended).
2. **If you delegate, you own collection.** Wait for results, integrate them, then return. Fire-and-forget delegation is forbidden.
3. **Decompose only when the work cannot fit in one context.** Do not re-delegate a task already sized for a single agent — depth is an outcome, not a plan.

> Rationale: observed failure mode — research agents followed "Parallel Task Execution" above, spawned children, and returned "waiting" as their final answer. All children completed successfully but their results were orphaned. The parallel rule without a completion contract produces zombie tasks.

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker
