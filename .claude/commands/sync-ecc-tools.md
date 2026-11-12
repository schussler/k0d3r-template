---
description: Keep the vendored .claude/ toolset current with upstream ECC (affaan-m/ECC), and adopt ECC items that fit the project's stack. Plans the delta (or the adoption list), WAITS for confirmation, then lands the approved changes with provenance (manifest + catalog) updated.
argument-hint: "[--adopt] [path to ECC clone | blank to use ../ECC] [--to <ref>]"
---

# Sync ECC tools → this project

**Input**: $ARGUMENTS

Two modes, one rule: **adopting or overwriting anything is a human decision.** You compute, present, and
**wait for an explicit yes** before writing a single file.

- **Sync (default):** bring the adopted `.claude/` slice (agents, skills, commands, rules, and the vendored
  hook) up to date with upstream **ECC**, **without clobbering local adaptations or project-local tools**.
- **Adopt (`--adopt`):** pick the ECC items that serve this project's stack from the catalog, and add them.
  Run it on day zero, whenever a spec changes the stack, and when a retro finds a missing tool that ECC has.

## Inputs & key files

- **ECC clone**: first non-flag arg, else `../ECC` (a sibling of this repo). It must be a **full** git clone of
  `affaan-m/ECC`. If it does not exist, **ask the human before cloning** (`git clone https://github.com/affaan-m/ECC.git ../ECC`).
- **Target ref (sync)**: by default, the **newest commit of the ECC `main` that is at least 14 days old**
  (`MIN_TARGET_AGE_DAYS` in `report.mjs`, the same two-week rule as pinned npm versions). `report.mjs` picks it
  when `--to` is absent and prints its date and age in the header. A **newer** target is allowed only as the
  human's **explicit choice**, asked for and recorded in the notes of the log row (the report header flags it).
- **Target ref (adopt)**: the manifest's `targetRef`, so adopted items match the rest of the toolset.
- **Manifest / provenance lockfile** (source of truth): `.claude/ecc-sync/manifest.json` — per item
  `{ downstream, source, type, policy, lastSyncedRef, adaptation?, alsoTracks? }`. `policy` is `track` (clean
  mirror, safe to overwrite), `adapt` (locally customized — never auto-edit), or `local` (no upstream — skip).
  `alsoTracks` lists extra ECC files whose code was pasted into the item (e.g. the compact hook).
- **Catalog**: `.claude/ecc-sync/catalog.json` — every ECC item at the manifest's ref (`name`, `type`,
  `description`, `source`, `adopted`). It is what the project knows about ECC without a clone.
- **Stack**: the `## Stack` section of `CLAUDE.md`.
- **Helper (read-only for `.claude/` content)**: `scripts/ecc-sync/report.mjs`; tests in
  `scripts/ecc-sync/report.test.mjs`.
- **Process doc and run log**: `docs/implemented/processo/ecc-sync.md`.

---

## Mode: sync (default)

### 1. Refresh upstream & sanity-check
- Ensure the ECC clone exists and is a git repo; `git -C <ecc> fetch origin main` (the fetch only updates what
  the clone knows; the 14-day rule below still picks the target).
- **The clone must be FULL, not shallow.** If `git -C <ecc> rev-parse --is-shallow-repository` is `true`, run
  `git -C <ecc> fetch --unshallow`. (The helper refuses to run on a shallow clone.)
- `node --test scripts/ecc-sync/report.test.mjs` — the classifier's unit tests must pass first. Read the exit
  code; never pipe it.

### 2. Compute & classify the delta (read-only)
```
node scripts/ecc-sync/report.mjs report --ecc <ecc> --json "$TMPDIR/ecc-sync.json"
# only after the human explicitly chose a newer target:  ... report --ecc <ecc> --to <ref> ...
```
Read the Markdown report. It buckets every item into:
- **Updates** (`track` + upstream changed) → safe to overwrite verbatim.
- **Needs review** (`adapt` + upstream changed, or any item whose `alsoTracks` origin changed) → port by hand.
  The report prints the diff of each changed origin.
- **Drifted** (`track` file edited locally) → decide: re-track or reclassify `adapt`.
- **Unchanged** / **Project-local (skipped)** → no action.
- **Removed upstream** → source gone; decide whether to drop locally.
- **New upstream candidates** → tools ECC has that the manifest does not, split into **Ligados à sua stack**,
  **Outros** and **Excluídos por política** (the `POLICY_EXCLUSIONS` list in `report.mjs`, which the catalog also
  applies), one line each. Nothing is hidden. **Do not auto-adopt.**

### 3. Present the plan and WAIT for confirmation
State the target, its date and age (from the report header). Summarize, grouped as above: exactly which files will be overwritten, which adapted files have upstream
changes (with the diffs from the report, so the human can choose what to port), and a **short list** of
candidates worth considering. Build the short list by crossing the candidates with the `## Stack` section **and**
with the specs in `docs/planned/` and `docs/in-progress/` (a spec about to add a queue, a database or a
language makes the matching ECC items relevant before the stack section says so). Give one line of reason per
item. The full candidate list stays in the report. **Do not edit anything until the human confirms.**

### 4. Land the approved changes
- Stay on the session's branch (one branch per session, `.claude/rules/common/git-workflow.md`).
- **Updates**: copy each from the ECC clone verbatim (`git -C <ecc> show <target>:<source> > <downstream>`
  for files; for skill dirs copy the whole tree). Files are byte-identical mirrors — never hand-retype. Bump
  that item's `lastSyncedRef` to `<target>`.
- **Needs review / Drifted**: **never overwrite.** Apply only the edits the human approved in step 3; keep the
  `adaptation` note true. Bump `lastSyncedRef` to `<target>` once reviewed (for `alsoTracks`, after every
  changed origin was ported). After porting an agent, run `node scripts/model-routing/model-routing.mjs apply`:
  the `model:` and `effort:` lines of its frontmatter come from `.claude/model-routing.json`, never from upstream.
- **Candidates** the human chose to adopt: follow "Land the adoption" below.
- **Project-local**: never touched.
- Update `.claude/ecc-sync/manifest.json`: `baselineRef` → `<target>`, `targetRef` → `<target>`, plus per-item
  `lastSyncedRef`, and the two dates:
  - `syncedAt` → **today**, the day this conference against upstream ran. It is what the `SessionStart` hook
    (`toolset-staleness.mjs`) and `/toolset-retro` read against `syncStaleDays`.
  - `targetRefDate` → the ECC commit date of `<target>` (`git -C <ecc> show -s --format=%cs <target>`).
    Information only; it also goes in the log row. A rejected candidate goes to the manifest's `discarded` list
  (`{ source, reason }`).
- **Regenerate the catalog** whenever `targetRef` moves:
  `node scripts/ecc-sync/report.mjs catalog --ecc <ecc>`.
- Re-run the report; everything should be `unchanged` except items deliberately left for review.
- If toolbox membership changed, refresh the tables in `.claude/README.md`.

### 5. Log and commit
- **Append a row to the log in `docs/implemented/processo/ecc-sync.md`**: date (`syncedAt`) · target date
  (`targetRefDate`) · ECC ref from→to · #updated · #reviewed · #adopted · notes. This is the "where to start next
  time" record. **For every reviewed item where nothing was ported**, write in the notes what changed upstream and
  why it was not ported: once `lastSyncedRef` advances, that diff no longer shows in any report.
- Commit (Conventional Commits, e.g. `chore: sync ECC tools <from>..<to>`) only with every gate green, and push.
  **Open a PR only if the human asks.**

---

## Mode: adopt (`--adopt`)

The code delivers the catalog; **you** choose, by reading descriptions; **the human** confirms. Never select by
keyword match in code.

### 1. Know the stack
- Read the `## Stack` section of `CLAUDE.md`. If it is empty or contradicts the repo, **detect the stack from the
  files**: `package.json` (and its dependencies), `go.mod`, `pyproject.toml` / `requirements*.txt`,
  `Cargo.toml`, `pom.xml` / `build.gradle*`, `*.csproj`, `Gemfile`, `composer.json`, `pubspec.yaml`,
  `Package.swift`, `Dockerfile`, `docker-compose*.yml`, CI workflows, database migrations, and the specs in
  `docs/planned/` and `docs/in-progress/`.
- **Propose the text of the `## Stack` section** (languages and versions, frameworks, database, infra, test
  runner) and the matching rows of the **Portões de verificação** table. Do not write them before the human
  confirms.

### 2. Choose from the catalog
- Read `.claude/ecc-sync/catalog.json`. For every item with `adopted: false`, judge by its **description** whether
  it serves this stack and the work planned in `docs/`. Language reviewers, build resolvers, test and pattern
  skills of the stack's language and framework, and rules for the stack's language directory are the usual fits;
  items for other languages, other frameworks and unrelated domains are not.
- Present a **short list** (typically 3 to 12 items), grouped by type, **one line of reason per item**, plus the
  notable items you left out and why. Mention when a candidate overlaps something already adopted.
- **Flag items that cite another AI coding tool.** Every item whose catalog entry has `citesOtherTools` gets the
  marker `cita outra ferramenta: <termos>` on its line (the terms are `OTHER_TOOL_TERMS` in `report.mjs`, the same
  ones the report prints). Nothing is dropped for it: the human decides whether to adopt it as `track` (verbatim)
  or as `adapt` (the mention removed, recorded in `adaptation`). A match can be benign (e.g. "cursor" in pagination);
  say so when it is.
- **WAIT for confirmation.** The human may add, drop or swap items.

### 3. Land the adoption
- **Called from `/k0d3r-task` after its approval stop:** the list the human approved in the spec ("Ferramentas do
  ECC para esta tarefa") is the confirmation of step 2. Do not ask again; cloning ECC is part of what was approved.
- Ensure the ECC clone (ask before cloning, as above). Copy each confirmed item **at the manifest's `targetRef`**
  (`git -C <ecc> show <ref>:<source> > <downstream>`; skills copy the whole dir; rules go to
  `.claude/rules/<dir>/<file>.md`). Never retype.
- Add a manifest entry per item: `policy: track`, `lastSyncedRef: <ref>`. If an item needs a change to run here
  (it cites a tool that is not in the toolset), make the minimal edit, use `policy: adapt` and write the
  `adaptation` note.
- **Every adopted agent gets a level, not its upstream model pin.** Add the agent to `agents` in
  `.claude/model-routing.json` (propose the level with the short list; the human confirms it), run
  `node scripts/model-routing/model-routing.mjs apply`, and record it as `policy: adapt` with the note
  "`model:` e `effort:` vêm do `.claude/model-routing.json`". The `check` gate fails while an agent has no level
  (`.claude/rules/common/model-routing.md`).
- Check that each adopted item cites nothing missing (skills, agents, commands, scripts). Adopt the dependency
  too, with confirmation, or adapt the citation away.
- Regenerate the catalog (`node scripts/ecc-sync/report.mjs catalog --ecc <ecc>`) so the items read
  `adopted: true`.
- Update `.claude/README.md` (the inventory tables) and, if the human confirmed it, the `## Stack` section and the
  gates table of `CLAUDE.md`.
- Commit (`chore(toolset): adopt <items> from ECC`) with every gate green, and push.

## Guardrails
- `adapt` items are **never auto-overwritten** — only hand-ported with approval.
- `local` items are **never** synced.
- New upstream tools are **opt-in**, never bulk-imported: adoption is always the human's decision.
- The helper script never writes `.claude/` content; it only writes the manifest (`bootstrap`) and the catalog
  (`catalog`). All other writes happen here, under approval.
