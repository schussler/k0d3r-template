---
name: pr-body
description: Writes the body of a pull request in pt-BR — the smallest visual of the change, red-to-green evidence, the merge danger (one-way or two-way door, blast radius), what the deploy needs, docs and whose decisions, and what is left. Use whenever a PR is opened or its body is rewritten. It does not decide WHEN to open one (only on the human's explicit request, git-workflow.md).
---

# PR body

Adapted from Matt Pocock's `pr` skill (`mattpocock/skills`, MIT), whose Summary menu comes from Dex Horthy's
`show-me` (`humanlayer`, MIT); notice in [`LICENSE.upstream`](LICENSE.upstream). Kept: the three sections and the
"smallest visual" rule. Added: what the deploy needs, docs and whose decisions, and what is left. Changed: pt-BR
headings, matching the language of this project's docs.

**When:** only after the human asked for that PR in the conversation (`.claude/rules/common/git-workflow.md`). This
skill writes the body; it never opens a PR on its own.

**Rules:** skip preambles, keep prose short, use the project's own vocabulary. Every claim is something you ran or
read in this session; a gate you did not run is written as "não rodado", never left out. No secrets, tokens or
personal data in the body (ids are fine). End with the attribution line the session gives you.

## Template

```markdown
## Resumo

<one visual (diff-sketch, call tree, file tree, pseudocode or Mermaid) + one or two lines per item>

## Evidência

- **Antes:** <the test that failed, or the measurement that showed the defect>
  **Depois:** <the same test passing / the same measurement fixed>
- Portões: <command → exit code, one line>

## Risco do merge

**Porta:** <mão dupla | mão única> — <why, one line>

**Raio de impacto:** <who and what can break: users, money, access, personal data, external services>

## Deploy

- O que sobe: <services, jobs, migrations, config — or "nada além do merge">
- Infra / esquema / configuração: <none, or which>
- Sondas pós-deploy: <how to prove it is live without touching real users' data>

## Docs e decisões

- <one line per doc listed by `node scripts/docs-check/docs-check.mjs diff`: "atualizado" or
  "conferido, sem mudança: <what was looked at>">
- <lifecycle moves>
- <decision → whose: humano (date) or proposta do agente>

## Pendências

- <limitations, accepted risks, open questions, follow-up PRs>
```

## Resumo — pick the smallest view

Use one, sometimes two; never all. Keep only the calls, files, states and boundaries the reviewer needs.

- **Diff-sketch** when the surrounding shape exists and the point is what changes:

  ```diff
   decide(order)
     failed
  +    isPending(order)?          # read BEFORE claiming the delivery
  +      publishFailed → release coupon → leave the pending list
  ```

- **Call tree** for runtime flow, **file tree** for a layout change or refactor, **pseudocode** for a rule,
  **Mermaid** (`sequenceDiagram`) when several units or services talk.
- Show a whole code block only when most of it is new or the reviewer needs a copyable target shape.
- Several items (A, B, C…): one line each with the commit sha, then the visual for the one that is hardest to read
  from the diff.

## Evidência — before and after

1. **Execution (default):** the exact test that failed before and passes now, named as it is in the code, plus
   the gates with their exit codes (`verification.md`: never piped). If a test was written after the code, say so and
   say how you proved it fails against the old code.
2. **Measured in an environment:** what you read in a deployed environment (bundle grep, stored record, log line),
   with the time. Say what the probe cannot distinguish (`verification.md`, "qual outro estado produziria a mesma
   resposta?").
3. **Screenshot:** strongest for a visual change, when a browser ran in the session. If none ran, write "sem
   navegador nesta sessão" and what still needs a look.

## Docs e decisões — from the docs-check diff

Run `node scripts/docs-check/docs-check.mjs diff` (never piped) and write **one line per doc it lists**, with what
happened to it: "atualizado" or "conferido, sem mudança: <what was looked at>" (`.claude/rules/common/docs-writing.md`).
A doc it lists as unresolved means the PR is not ready. Then add the lifecycle moves and, for each decision, whose
it is.

## Risco do merge — door and blast radius

- **Mão dupla:** reverting the deploy undoes it (code paths, UI, logs).
- **Mão única:** something written by the first use survives a revert — a permission granted, a charge, an e-mail
  sent, a data migration, a deleted record, an object created in an external service. Name the first irreversible
  step.
- **Raio de impacto:** be concrete about money, access, personal data and external services.

## Deploy — what the person who presses the button needs

- Which deployable pieces change, and whether one piece needs another in the same deploy (a UI that calls a new
  endpoint needs the service that owns it).
- Say explicitly when infrastructure, a schema, an index, configuration or a secret changed.
- Post-deploy probes that touch no real user data: a literal snippet in the deployed artifact (with the negative
  control before the deploy), an unauthenticated call answering 401/403, a log line, a read of the record the fix
  writes.

## Example (shape only)

```markdown
## Resumo

- **A** `fe7a8e8`: o pedido pendente é gravado com a conta.
- **B** `e64ee3e`: a recusa depois da análise manda e-mail, pelo webhook ou pela reconciliação.

(diff-sketch of B)

## Evidência

- **Antes:** `repassa a conta do pedido em análise até o registro gravado` falhava (`accountRef` ausente).
  **Depois:** passa.
- Portões: `<comando de teste>` 0 · `<comando de build>` 0 · `<comando de lint>` não rodado (o lint não cobre os arquivos mudados).

## Risco do merge

**Porta:** mão dupla — só código; reverter o deploy volta o comportamento.

**Raio de impacto:** contas com pedido em análise (tela, trava, e-mail de recusa). Sem efeito no caminho pago.
```
