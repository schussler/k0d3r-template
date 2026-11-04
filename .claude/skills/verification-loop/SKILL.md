---
name: verification-loop
description: Run a six-phase verification of a Claude Code session's work — build, type check, lint, tests with coverage, security grep, and diff review — then produce a PASS/FAIL verification report. Use when verifying work after completing a feature or refactor, before creating a PR, or when quality gates must pass.
license: MIT
metadata:
  origin: ECC
---

# Verification Loop Skill

A comprehensive verification system for Claude Code sessions.

## When to Use

Invoke this skill:
- After completing a feature or significant code change
- Before creating a PR
- When you want to ensure quality gates pass
- After refactoring

## Verification Phases

Every gate command comes from the **Portões de verificação** table in `CLAUDE.md`. Never pipe a gate into
`tail`, `head` or `grep`: the pipe replaces the gate's exit code with its own, and a red gate reads green.
Redirect to a file, print the exit code, then read the log:

```bash
<gate command> > "$TMPDIR/verify-<phase>.log" 2>&1; echo "EXIT: $?"; tail -30 "$TMPDIR/verify-<phase>.log"
```

If the table is still a placeholder, stop and ask the human for the commands; do not guess them.

### Phase 1: Build Verification
```bash
<comando de build> > "$TMPDIR/verify-build.log" 2>&1; echo "EXIT: $?"; tail -20 "$TMPDIR/verify-build.log"
```

If build fails, STOP and fix before continuing.

### Phase 2: Type Check
```bash
<comando de typecheck> > "$TMPDIR/verify-typecheck.log" 2>&1; echo "EXIT: $?"; tail -30 "$TMPDIR/verify-typecheck.log"
```

Report all type errors. Fix critical ones before continuing. Skip this phase only when the table marks the
typecheck gate as not applicable for the stack.

### Phase 3: Lint Check
```bash
<comando de lint> > "$TMPDIR/verify-lint.log" 2>&1; echo "EXIT: $?"; tail -30 "$TMPDIR/verify-lint.log"
```

### Phase 4: Test Suite
```bash
<comando de teste> > "$TMPDIR/verify-test.log" 2>&1; echo "EXIT: $?"; tail -50 "$TMPDIR/verify-test.log"

# Check coverage threshold with the project's coverage variant of the test gate
# Target: 80% minimum
```

Report:
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

### Phase 5: Security Scan
```bash
<auditoria de dependências> > "$TMPDIR/verify-audit.log" 2>&1; echo "EXIT: $?"; tail -30 "$TMPDIR/verify-audit.log"

# Check for secrets (a search, not a gate: read the whole output)
grep -rnE "sk-[A-Za-z0-9]{20,}|api_key|BEGIN [A-Z ]*PRIVATE KEY" --exclude-dir=.git .

# Check for leftover debug output, using the stack's debug-print pattern
grep -rn "<debug-print pattern>" --exclude-dir=.git .
```

### Phase 6: Diff Review
```bash
# Show what changed
git diff --stat
git diff HEAD~1 --name-only
```

Review each changed file for:
- Unintended changes
- Missing error handling
- Potential edge cases

## Output Format

After running all phases, produce a verification report:

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for PR

Issues to Fix:
1. ...
2. ...
```

## Continuous Mode

For long sessions, run verification every 15 minutes or after major changes:

```markdown
Set a mental checkpoint:
- After completing each function
- After finishing a component
- Before moving to next task

Run: this skill (verification-loop)
```

## Integration with Hooks

This skill complements PostToolUse hooks but provides deeper verification.
Hooks catch issues immediately; this skill provides comprehensive review.
