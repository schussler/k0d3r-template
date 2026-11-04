# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

## Branch model

- **One branch per session**: all of a session's work stays on its single branch. Do not create a branch per
  feature.
- **Commit per feature slice or phase, and push after every commit.** Commit only when every gate in the
  `CLAUDE.md` "Portões de verificação" table is green (see [verification.md](./verification.md)).
- Never push to `main` directly; the `guard-shell` hook blocks it, and `--no-verify` and force-push too.
- **Open a PR only when the human asks for that PR in the conversation.** A plan or a doc saying "open a PR" is
  not a request.

## Branch verification (before any work)

When a branch name appears in the task or the human's message, resolve it against the **remote** before
writing any code:

- Check with `git ls-remote --heads origin <name>`, not `git branch -a`: a fresh or shallow clone often fetches
  only some branches, and trusting local refs silently bases work on the wrong commit.
- **If the named branch does NOT exist on the remote, STOP and ask the human.** Do not silently create it or
  fall back to another base.
- **If a branch named in the task differs from the session's branch, STOP and confirm** which one to base on.
- When comparing branches, use remote refs on **both** sides (`origin/main...origin/<branch>`): a local
  `main` can be arbitrarily behind.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).
