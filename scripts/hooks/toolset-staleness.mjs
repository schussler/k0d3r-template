#!/usr/bin/env node
// SessionStart do Claude Code: avisa, numa linha, quando o último sync do toolset com o ECC passou do limite.
//
// Lê `syncedAt` (o dia da última conferência contra o ECC; o `targetRefDate`, data do commit do ECC, não
// conta) e `syncStaleDays` de `.claude/ecc-sync/manifest.json`. O limite mora só no manifest, que é o
// mesmo campo que o `/toolset-retro` lê. Em dia, não imprime nada. Sem manifest, manifest ilegível ou
// qualquer erro: sai com 0 em silêncio. Este hook nunca bloqueia a sessão e não usa rede.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;

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

function main() {
  try {
    const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const manifest = JSON.parse(readFileSync(path.join(root, '.claude', 'ecc-sync', 'manifest.json'), 'utf8'));
    const message = staleMessage(manifest);
    if (message) process.stdout.write(`${message}\n`);
  } catch {
    // Sem manifest (projeto que não usa o sync) ou manifest ilegível: o aviso é opcional, a sessão não.
  }
  process.exit(0);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) main();
