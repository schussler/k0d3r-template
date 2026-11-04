---
description: End-of-session retrospective on the .claude/ AI toolset (agents, skills, commands, rules, hooks). Answers three fixed questions grounded in the session; reminds when the ECC sync is stale; checks the ECC catalog before filing a missing tool; applies durable toolbox fixes, files deferred items to the planned toolset backlog, and records the reasoning in the commit message (no standing log doc).
argument-hint: "[optional: a focus area, e.g. 'rules' or 'the code-reviewer agent']"
---

# Toolset retrospective

**Input (optional focus):** $ARGUMENTS

A short, honest review of how the repo's **`.claude/` AI toolset** served *this* session, so the
toolbox improves over time instead of drifting. Run it at the end of a substantive session (the
CLAUDE.md Workflow points here). Keep it grounded in what actually happened — cite specific
tools and files; do not invent praise.

## 0. Is the ECC sync stale?

Read `syncedAt` and `syncStaleDays` from `.claude/ecc-sync/manifest.json` (the limit lives only there; the
`SessionStart` hook `scripts/hooks/toolset-staleness.mjs` reads the same field) and compute the days since
`syncedAt`. If it is more than `syncStaleDays`, the **first line** of the answer is:

> último sync com o ECC há N dias, rode `/sync-ecc-tools`

Otherwise say nothing about it.

## 1. Answer these three questions

1. **Did you use the AI toolset?** Which agents / skills / commands / rules / hooks did you actually use
   (actively invoked vs. passively followed)? Be honest about what was **authored but not
   runnable** in this harness (e.g. a named agent you couldn't invoke and had to approximate).
2. **Benefit, or in the way?** Both, usually. Give **concrete** wins (e.g. "the guard-shell hook
   blocked a piped test run that would have read green") and **concrete** friction (noise, stale or
   generic content, token cost, unexecutable mandates).
3. **What would you change?** Prioritized. Prefer changes that *prevent a recurrence* of something
   that bit you this session.

## 2. A missing tool? Check the ECC catalog first

When the answer to question 3 is "we lacked a tool for X", search `.claude/ecc-sync/catalog.json` by
**description** (not only by name) before writing anything:

- **ECC already has it** (`adopted: false`): the suggestion is to adopt it with `/sync-ecc-tools --adopt`,
  naming the item and its `source`. Do not write a local copy, and do not file "write X" in the backlog.
- **ECC does not have it**: file it in the backlog (below) as a candidate local tool, and say the catalog was
  checked at which `ref`.

## 3. Then: act, don't log

There is **no standing feedback-log doc** (a log would live in `implemented/`, which is for current
state only). A retro splits its output exactly like the rest of the docs — *implemented*
(applied now) or *planned* (deferred) — and the **reasoning lives in the commit message** (git
history), not a persistent file. Map each finding:

1. **Applied now → the toolset itself** (a retro that only writes prose is half-done):
   - A hard-won lesson → a **project-local rule** (`.claude/rules/**`), so the next session is warned.
     (Don't edit `track` upstream rules — they get overwritten; add a project-local rule or reclassify
     to `adapt`.)
   - An adaptation/discard decision about an ECC tool → the manifest
     (`.claude/ecc-sync/manifest.json`): an `adaptation` note on an `adapt` item, or a
     `discarded` entry (see `docs/implemented/processo/ecc-sync.md`).
2. **Deferred → the planned toolset backlog.** Add anything bigger (trim always-on rules, fix stale
   content, make an agent invokable, a tool the catalog does not have) to
   [`docs/planned/processo/toolset-backlog.md`](../../docs/planned/processo/toolset-backlog.md).
3. **The reasoning → the commit message.** Put the three answers (used / benefit-or-friction /
   what-changed) in the `chore(toolset): …` (or `docs(toolset): …`) commit body. That is the log;
   git keeps it. Do **not** recreate a feedback-log doc in `implemented/`.
4. **Confirm before large changes.** Small fixes + backlog entries: just do them. Reclassifying
   tools, deleting rules, adopting from ECC, or touching `adapt`/`track` files: propose first, then
   apply on approval.

## Guardrails

- This is a **judgment** exercise, not a checklist to pass — a brief, truthful "it mostly stayed
  out of the way, one rule was stale" is a perfectly good outcome (a commit message + maybe one
  backlog line).
- Don't touch vendored `track` files here (ECC sync owns them); file the wish in the backlog.
- If nothing changed since the last retro, say so and stop.
- **Invoked in a session that did no work?** Say so **in the first line of the answer** (after the
  sync reminder, if any) — the three questions are about *lived* experience and you have none. Then
  retro the **range**, not the session: `git log --grep='chore(toolset)' -1` gives the last retro, and
  `<last>..HEAD` is what has not been reviewed. Read the **commit bodies** in that range plus
  `git log --format='%ce'` to see who committed what. That yields real findings, but label it for what
  it is: **archaeology** — it can see a defect class in the history, and cannot see the friction that
  had no commit.
