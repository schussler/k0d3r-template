#!/usr/bin/env node
// SessionStart do Claude Code: avisa, numa linha, quando o último sync do toolset com o ECC passou do limite.
//
// Lê `syncedAt` (o dia da última conferência contra o ECC; o `targetRefDate`, data do commit do ECC, não
// conta) e `syncStaleDays` de `.claude/ecc-sync/manifest.json`. O limite mora só no manifest, que é o
// mesmo campo que o `/toolset-retro` lê. Em dia, não imprime nada. Sem manifest, manifest ilegível ou
// qualquer erro: sai com 0 em silêncio. Este hook nunca bloqueia a sessão e não usa rede.
//
// Depois, no mesmo padrão, a linha de docs: quantos docs de docs/implemented/ têm código alterado desde a
// última conferência e quantos nunca foram conferidos, contados pela mesma lógica do `docs-check stale`
// (importada, não duplicada). Sem nada a dizer, sem git, com erro ou acima de DOCS_BUDGET_MS: nada.

import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { staleCounts } from '../docs-check/docs-check.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
// Teto da contagem de docs: a abertura da sessão não espera mais que isto por um aviso opcional.
export const DOCS_BUDGET_MS = 2000;

/** Dias inteiros entre a data `YYYY-MM-DD` e `now` (UTC), ou null se a data não for válida. */
export function daysSince(isoDate, now) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / DAY_MS);
}

/** A linha de aviso, ou null quando o sync está em dia. */
export function staleMessage(manifest, now = new Date()) {
  const limit = manifest?.syncStaleDays;
  if (!Number.isInteger(limit) || limit <= 0) {
    return '[toolset] manifest sem `syncStaleDays` válido: não dá para saber se o sync com o ECC está em dia; rode /toolset-retro.';
  }
  const days = daysSince(manifest.syncedAt, now);
  if (days === null) {
    return '[toolset] manifest sem `syncedAt` válido: rode /sync-ecc-tools para registrar o último sync com o ECC.';
  }
  if (days <= limit) return null;
  return `[toolset] último sync com o ECC há ${days} dias (limite ${limit}): rode /sync-ecc-tools ou /toolset-retro.`;
}

/** A linha de docs, ou null quando não há doc desatualizado nem nunca conferido. */
export function docsMessage(counts) {
  if (!counts || (!counts.stale && !counts.never)) return null;
  return `docs: ${counts.stale} com código alterado desde a última conferência, ${counts.never} nunca conferidos (/audit-docs)`;
}

/** Conta os docs dentro do teto de tempo; null em qualquer erro ou estouro. */
export function docsLine(root, budgetMs = DOCS_BUDGET_MS, count = staleCounts) {
  try {
    const started = Date.now();
    const counts = count(root, { timeoutMs: budgetMs });
    if (Date.now() - started > budgetMs) return null;
    return docsMessage(counts);
  } catch {
    // Sem git, sem docs/ ou git lento: a linha de docs é opcional, a sessão não.
    return null;
  }
}

function main() {
  const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, '.claude', 'ecc-sync', 'manifest.json'), 'utf8'));
    const message = staleMessage(manifest);
    if (message) process.stdout.write(`${message}\n`);
  } catch {
    // Sem manifest (projeto que não usa o sync) ou manifest ilegível: o aviso é opcional, a sessão não.
  }
  const docs = docsLine(root);
  if (docs) process.stdout.write(`${docs}\n`);
  process.exit(0);
}

// Os dois lados passam pelo caminho real: chamado por um caminho com link simbólico (um worktree, `/tmp` no
// macOS), `import.meta.url` já vem resolvido e `process.argv[1]` não, e a comparação crua saía com 0 sem rodar.
// Se o caminho real não puder ser lido, roda: não rodar é o lado que deixa um portão verde ou um hook aberto.
function isEntrypoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
}

if (isEntrypoint()) main();
