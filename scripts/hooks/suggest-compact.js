#!/usr/bin/env node
/**
 * Strategic Compact Suggester
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs on PreToolUse or periodically to suggest manual compaction at logical intervals
 *
 * Why manual over auto-compact:
 * - Auto-compact happens at arbitrary points, often mid-task
 * - Strategic compacting preserves context through logical phases
 * - Compact after exploration, before execution
 * - Compact after completing a milestone, before starting next
 *
 * Two signals (#2155):
 * - Tool-call count: first at COMPACT_THRESHOLD (default 50), then every 25.
 * - Context size (primary): the latest assistant `usage` record from the
 *   session transcript, compared against a window-scaled token threshold
 *   (COMPACT_CONTEXT_THRESHOLD; default 160k on a 200k window, 250k on 1M),
 *   re-reminding after every COMPACT_CONTEXT_INTERVAL tokens of growth
 *   (default 60k). Tool count is a weak proxy for window pressure — a few
 *   large reads can fill the window in very few calls, and many tiny calls
 *   can cross 50 while the window is barely used.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Pasted from ECC scripts/lib/utils.js (same ECC ref as this file): only the
// helpers this hook calls, plus ensureDir, which writeFile calls. Kept verbatim so
// the ECC sync can diff them; the template ships no scripts/lib/.
// ---------------------------------------------------------------------------

/**
 * Get the temp directory (cross-platform)
 */
function getTempDir() {
  return os.tmpdir();
}

/**
 * Ensure a directory exists (create if not)
 * @param {string} dirPath - Directory path to create
 * @returns {string} The directory path
 * @throws {Error} If directory cannot be created (e.g., permission denied)
 */
function ensureDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err) {
    // EEXIST is fine (race condition with another process creating it)
    if (err.code !== 'EEXIST') {
      throw new Error(`Failed to create directory '${dirPath}': ${err.message}`);
    }
  }
  return dirPath;
}

/**
 * Read JSON from stdin (for hook input)
 * @param {object} options - Options
 * @param {number} options.timeoutMs - Timeout in milliseconds (default: 5000).
 *   Prevents hooks from hanging indefinitely if stdin never closes.
 * @returns {Promise<object>} Parsed JSON object, or empty object if stdin is empty
 */
async function readStdinJson(options = {}) {
  const { timeoutMs = 5000, maxSize = 1024 * 1024 } = options;

  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    let overflowed = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        // Clean up stdin listeners so the event loop can exit
        process.stdin.removeAllListeners('data');
        process.stdin.removeAllListeners('end');
        process.stdin.removeAllListeners('error');
        if (process.stdin.unref) process.stdin.unref();
        // Oversized input is always rejected. Otherwise, resolve with whatever
        // arrived before the timeout rather than hanging.
        if (overflowed) {
          resolve({});
          return;
        }
        try {
          resolve(data.trim() ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      }
    }, timeoutMs);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      if (settled) return;
      if (overflowed) return;
      // Mark oversized input as rejected and discard the buffered prefix.
      // Continue consuming the stream without retaining later chunks so a
      // finite parent can finish writing without EPIPE. Resolution happens at
      // EOF or the existing timeout, which also bounds never-closing writers.
      if (data.length + chunk.length > maxSize) {
        overflowed = true;
        data = '';
        process.stderr.write(
          `[readStdinJson] stdin exceeded ${maxSize} bytes; input truncated and treated as empty\n`
        );
        return;
      }
      data += chunk;
    });

    process.stdin.on('end', () => {
      if (settled) {
        clearTimeout(timer);
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (overflowed) {
        resolve({});
        return;
      }
      try {
        resolve(data.trim() ? JSON.parse(data) : {});
      } catch {
        // Consistent with timeout path: resolve with empty object
        // so hooks don't crash on malformed input
        resolve({});
      }
    });

    process.stdin.on('error', () => {
      if (settled) {
        clearTimeout(timer);
        return;
      }
      settled = true;
      clearTimeout(timer);
      // Resolve with empty object so hooks don't crash on stdin errors
      resolve({});
    });
  });
}

/**
 * Log to stderr (visible to user in Claude Code)
 */
function log(message) {
  console.error(message);
}

/**
 * Output to stdout (returned to Claude)
 */
function output(data) {
  if (typeof data === 'object') {
    console.log(JSON.stringify(data));
  } else {
    console.log(data);
  }
}

/**
 * Write a text file
 */
function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Pasted from ECC scripts/lib/file-tail.js (whole module, minus its
// `'use strict'`, `require('fs')` and `module.exports`).
// ---------------------------------------------------------------------------

const DEFAULT_TRANSCRIPT_TAIL_BYTES = 256 * 1024;

/** Last `tailBytes` of a file as UTF-8 text, with whether earlier bytes were skipped; null when unreadable. */
function readFileTail(filePath, tailBytes) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    return null;
  }

  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - tailBytes);
    const length = size - start;
    if (length <= 0) {
      return { text: '', truncated: false };
    }

    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, start);
    return {
      text: buffer.toString('utf8', 0, bytesRead),
      truncated: start > 0
    };
  } catch {
    return null;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Pasted from ECC scripts/lib/transcript-context.js (whole module, minus its
// `require('./file-tail')`, now pasted above, and `module.exports`).
// ---------------------------------------------------------------------------

/**
 * Transcript context-size helpers for the strategic-compact hook (#2155).
 *
 * Reads the latest assistant `usage` record from a Claude Code session
 * transcript (JSONL) and derives a context-size signal:
 *
 * - `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`
 *   partition the prompt, so their sum is the true context size of the turn.
 * - The context window is detected from the model id (`[1m]` marker) or from
 *   the observed token count (anything above 200k implies a 1M window even
 *   when logs drop the suffix).
 * - Thresholds are window-scaled and env-overridable; re-reminders fire in
 *   fixed token "buckets" above the threshold so the suggestion only repeats
 *   after real context growth.
 *
 * Only the tail of the transcript is read (latest records live at the end),
 * keeping the PreToolUse hook fast even for very large sessions.
 */

const STANDARD_CONTEXT_WINDOW_TOKENS = 200000;
const LARGE_CONTEXT_WINDOW_TOKENS = 1000000;
const DEFAULT_CONTEXT_THRESHOLD_STANDARD = 160000;
const DEFAULT_CONTEXT_THRESHOLD_LARGE = 250000;
const DEFAULT_CONTEXT_INTERVAL_TOKENS = 60000;
const MAX_TOKEN_SETTING = 10000000;
const LARGE_WINDOW_MODEL_MARKER = '[1m]';

// Known large-window model families whose ids carry no `[1m]` marker (#2461).
// Matched boundary-aware against the model id — covers dated/region-prefixed
// variants (e.g. `us.anthropic.claude-fable-5-20260115-v1:0`) without matching
// hypothetical smaller tiers sharing the prefix (e.g. `claude-fable-5-mini`).
// Checked in order, first match wins. Best-effort and expected to lag new
// releases; the env override remains the escape hatch for unlisted models.
const KNOWN_MODEL_WINDOW_TOKENS = [
  ['claude-opus-5', LARGE_CONTEXT_WINDOW_TOKENS],
  ['claude-fable-5', LARGE_CONTEXT_WINDOW_TOKENS],
  ['claude-mythos-5', LARGE_CONTEXT_WINDOW_TOKENS]
];

/**
 * True when `model` contains `familyId` ending at a token boundary: end of id,
 * a delimiter (`[`, `:`, `.`), or a dated/versioned suffix (`-20260115`).
 * Alphanumeric continuations and letter suffixes (`-mini`) are different
 * models, possibly with smaller windows, and must not match.
 */
function isKnownModelFamilyMatch(model, familyId) {
  const start = model.indexOf(familyId);
  if (start === -1) {
    return false;
  }
  const rest = model.slice(start + familyId.length);
  return !/^[A-Za-z0-9]/.test(rest) && !/^-[A-Za-z]/.test(rest);
}

/**
 * Read the trailing `tailBytes` of a file as UTF-8.
 * Returns null when the file is missing or unreadable.
 */

/**
 * Extract the context token total from a transcript record's usage block.
 * Returns 0 when the record carries no usable usage data.
 */
function extractUsageTokens(record) {
  const usage = record && record.message && record.message.usage;
  if (!usage || typeof usage !== 'object') {
    return 0;
  }

  const total =
    (Number.isFinite(usage.input_tokens) ? usage.input_tokens : 0) +
    (Number.isFinite(usage.cache_read_input_tokens) ? usage.cache_read_input_tokens : 0) +
    (Number.isFinite(usage.cache_creation_input_tokens) ? usage.cache_creation_input_tokens : 0);

  return total > 0 ? total : 0;
}

/**
 * Scan a session transcript (JSONL) backwards for the most recent record with
 * a non-empty `message.usage` block.
 *
 * @param {string} transcriptPath - Absolute path to the transcript JSONL.
 * @param {object} [options]
 * @param {number} [options.tailBytes] - How many trailing bytes to scan.
 * @returns {{ tokens: number, model: string } | null} Latest context size, or
 *   null when the transcript is missing, unreadable, or has no usage records.
 */
function readLatestContextTokens(transcriptPath, options = {}) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) {
    return null;
  }

  const tailBytes = Number.isInteger(options.tailBytes) && options.tailBytes > 0 ? options.tailBytes : DEFAULT_TRANSCRIPT_TAIL_BYTES;

  const tail = readFileTail(transcriptPath, tailBytes);
  if (!tail) {
    return null;
  }

  const lines = tail.text.split('\n');
  // The first line of a truncated tail is almost certainly partial JSON.
  const firstLine = tail.truncated ? 1 : 0;

  for (let i = lines.length - 1; i >= firstLine; i--) {
    const line = lines[i].trim();
    if (!line) continue;

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const tokens = extractUsageTokens(record);
    if (tokens > 0) {
      const model = record.message && typeof record.message.model === 'string' ? record.message.model : '';
      return { tokens, model };
    }
  }

  return null;
}

/**
 * Detect the context window size for a turn, and report whether that size was
 * positively detected or merely assumed.
 *
 * `inferred: false` means the size came from evidence — an explicit env
 * override, the `[1m]` marker, or a known large-window family. An observed
 * token count above the standard window selects the safer large-window
 * thresholds, but remains inferred because the true denominator could be an
 * unmarked intermediate size such as 400k. Callers must not present inferred
 * windows as fact.
 *
 * @returns {{ windowTokens: number, inferred: boolean }}
 */
function resolveContextWindow(tokens, model) {
  // Explicit window override wins: 400k models (e.g. Opus 4.x) match neither the
  // 200k default nor the 1M marker and would otherwise report ~double usage (#2290).
  // Honor ECC's own knob and Claude Code's native CLAUDE_CODE_AUTO_COMPACT_WINDOW.
  const env = (typeof process !== 'undefined' && process.env) || {};
  const envWindow = Number.parseInt(env.ECC_CONTEXT_WINDOW_TOKENS || env.CLAUDE_CODE_AUTO_COMPACT_WINDOW || '', 10);
  if (Number.isInteger(envWindow) && envWindow > 0) {
    return { windowTokens: envWindow, inferred: false };
  }

  if (typeof model === 'string' && model.includes(LARGE_WINDOW_MODEL_MARKER)) {
    return { windowTokens: LARGE_CONTEXT_WINDOW_TOKENS, inferred: false };
  }

  // Large-window model families without a [1m] marker fall through the checks
  // above and would be misreported against the 200k default (#2461).
  if (typeof model === 'string') {
    const known = KNOWN_MODEL_WINDOW_TOKENS.find(([familyId]) => isKnownModelFamilyMatch(model, familyId));
    if (known) {
      return { windowTokens: known[1], inferred: false };
    }
  }

  if (Number.isFinite(tokens) && tokens > STANDARD_CONTEXT_WINDOW_TOKENS) {
    return { windowTokens: LARGE_CONTEXT_WINDOW_TOKENS, inferred: true };
  }

  return { windowTokens: STANDARD_CONTEXT_WINDOW_TOKENS, inferred: true };
}

/**
 * Detect the context window size for a turn.
 * 1M when the model id carries the `[1m]` marker, matches a known large-window
 * model family, or when the observed token count already exceeds the standard
 * 200k window (covers logs that drop the suffix); otherwise the standard 200k
 * window.
 */
function resolveContextWindowTokens(tokens, model) {
  return resolveContextWindow(tokens, model).windowTokens;
}

/**
 * True when the resolved window is the assumed 200k default rather than a
 * detected size. Opt-in large-window models that ship no `[1m]` marker in the
 * transcript (e.g. a 1M-context Opus tier, where the base tier is 200k and the
 * two are indistinguishable by model id) land here, so a percentage computed
 * against 200k can be wildly wrong while usage sits below that mark.
 */
function isContextWindowInferred(tokens, model) {
  return resolveContextWindow(tokens, model).inferred;
}

/**
 * Resolve the context-size suggestion threshold (tokens).
 * `COMPACT_CONTEXT_THRESHOLD=0` disables the context signal entirely;
 * other invalid values fall back to the window-scaled default.
 */
function resolveContextThreshold(env, windowTokens) {
  const raw = env && env.COMPACT_CONTEXT_THRESHOLD;
  if (raw !== undefined && raw !== null && raw !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (parsed === 0) {
      return 0;
    }
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_TOKEN_SETTING) {
      return parsed;
    }
  }

  return windowTokens >= LARGE_CONTEXT_WINDOW_TOKENS ? DEFAULT_CONTEXT_THRESHOLD_LARGE : DEFAULT_CONTEXT_THRESHOLD_STANDARD;
}

/**
 * Resolve the re-reminder step (tokens of additional context growth before
 * the suggestion repeats). Invalid values fall back to the default.
 */
function resolveContextInterval(env) {
  const raw = env && env.COMPACT_CONTEXT_INTERVAL;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_TOKEN_SETTING ? parsed : DEFAULT_CONTEXT_INTERVAL_TOKENS;
}

/**
 * Map a context size onto a suggestion bucket.
 * Returns -1 below the threshold; bucket 0 at the threshold; +1 for every
 * `interval` tokens of growth beyond it. The hook fires only when the bucket
 * rises above the last bucket it already fired for.
 */
function computeContextBucket(tokens, threshold, interval) {
  if (!Number.isFinite(tokens) || threshold <= 0 || tokens < threshold) {
    return -1;
  }

  const step = Number.isInteger(interval) && interval > 0 ? interval : DEFAULT_CONTEXT_INTERVAL_TOKENS;
  return Math.floor((tokens - threshold) / step);
}

/**
 * Human-readable label for a context window size (e.g. "200k", "1M").
 */
function formatWindowLabel(windowTokens) {
  return windowTokens >= LARGE_CONTEXT_WINDOW_TOKENS ? '1M' : `${Math.round(windowTokens / 1000)}k`;
}

// ---------------------------------------------------------------------------
// ECC scripts/hooks/suggest-compact.js from here on.
// ---------------------------------------------------------------------------

const COUNTER_FILE_PREFIX = 'claude-tool-count-';
const CONTEXT_BUCKET_FILE_PREFIX = 'claude-context-bucket-';
const STATE_FILE_PREFIXES = [COUNTER_FILE_PREFIX, CONTEXT_BUCKET_FILE_PREFIX];
const DEFAULT_COMPACT_STATE_TTL_DAYS = 14;

function getCounterRetentionDays() {
  const raw = process.env.COMPACT_STATE_TTL_DAYS;
  if (!raw) return DEFAULT_COMPACT_STATE_TTL_DAYS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_COMPACT_STATE_TTL_DAYS;
}

/**
 * Sweep stale per-session state files from the temp dir.
 *
 * Each session writes `claude-tool-count-<sessionId>` (and, with the context
 * signal, `claude-context-bucket-<sessionId>`) into the OS temp dir; nothing
 * else removes them. Without a sweep these files accumulate one-per-session
 * forever. This helper removes state files whose mtime is older than
 * `retentionDays`, while preserving the active session's files (which are
 * about to be re-written by the caller).
 *
 * The helper never throws; per the always-exit-0 hook contract any
 * filesystem failure is swallowed and logged to stderr.
 *
 * @param {string} tempDir - The temp directory to sweep.
 * @param {number} retentionDays - Files older than this many days are removed.
 * @param {string[]} currentStateFiles - Absolute paths of the active session's
 *   state files; preserved unconditionally.
 */
function cleanupOldCounters(tempDir, retentionDays, currentStateFiles) {
  let entries;
  try {
    entries = fs.readdirSync(tempDir, { withFileTypes: true });
  } catch (err) {
    log(`[StrategicCompact] Skipping counter sweep; readdir failed: ${err.message}`);
    return;
  }

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const currentBasenames = new Set(currentStateFiles.map(filePath => path.basename(filePath)));

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!STATE_FILE_PREFIXES.some(prefix => entry.name.startsWith(prefix))) continue;
    if (currentBasenames.has(entry.name)) continue;

    const fullPath = path.join(tempDir, entry.name);
    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch {
      continue;
    }

    // Strict "older than" semantics per the docstring: a file whose mtime
    // sits exactly on the cutoff boundary has age == retentionDays, which
    // is not *older than* retentionDays, so preserve it. Use >= so only
    // strictly older files (mtimeMs < cutoffMs) fall through to deletion.
    if (stats.mtimeMs >= cutoffMs) continue;

    try {
      fs.rmSync(fullPath, { force: true });
    } catch (err) {
      log(`[StrategicCompact] Warning: failed to prune stale counter ${fullPath}: ${err.message}`);
    }
  }
}

/**
 * Increment and persist the per-session tool-call counter.
 * Uses fd-based read+write to reduce (but not eliminate) the race window
 * between concurrent hook invocations.
 */
function incrementToolCallCount(counterFile) {
  let count = 1;

  try {
    const fd = fs.openSync(counterFile, 'a+');
    try {
      const buf = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, buf, 0, 64, 0);
      if (bytesRead > 0) {
        const parsed = parseInt(buf.toString('utf8', 0, bytesRead).trim(), 10);
        // Clamp to reasonable range — corrupted files could contain huge values
        // that pass Number.isFinite() (e.g., parseInt('9'.repeat(30)) => 1e+29)
        count = (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000000)
          ? parsed + 1
          : 1;
      }
      // Truncate and write new value
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, String(count), 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Fallback: just use writeFile if fd operations fail
    writeFile(counterFile, String(count));
  }

  return count;
}

/**
 * Read the last context bucket this session already fired for (-1 when the
 * suggestion has not fired yet or the state file is unreadable/corrupted).
 */
function readLastContextBucket(bucketFile) {
  try {
    const parsed = parseInt(fs.readFileSync(bucketFile, 'utf8').trim(), 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000000 ? parsed : -1;
  } catch {
    return -1;
  }
}

/**
 * Build the context-size suggestion when the transcript shows the session has
 * crossed into a new context bucket. Returns null when the signal is silent
 * (no transcript, below threshold, disabled, or already fired for the bucket).
 *
 * Never throws — any transcript or state-file failure silently disables the
 * signal so the hook keeps its always-exit-0 contract.
 */
function buildContextSuggestion(transcriptPath, bucketFile, env) {
  try {
    const usage = readLatestContextTokens(transcriptPath);
    if (!usage) return null;

    const { windowTokens, inferred } = resolveContextWindow(usage.tokens, usage.model);
    const threshold = resolveContextThreshold(env, windowTokens);
    if (threshold <= 0) return null; // COMPACT_CONTEXT_THRESHOLD=0 disables

    const interval = resolveContextInterval(env);
    const bucket = computeContextBucket(usage.tokens, threshold, interval);
    if (bucket < 0) return null;

    const lastBucket = readLastContextBucket(bucketFile);
    if (bucket <= lastBucket) return null;

    writeFile(bucketFile, String(bucket));

    const approxTokens = `${Math.round(usage.tokens / 1000)}k`;
    // Only quote a percentage when the window size was actually detected.
    // Against an assumed 200k default the denominator is a guess, and a
    // "97% of 200k window" line on a 1M session triggers needless compaction.
    const scale = inferred
      ? ''
      : ` (${Math.round((usage.tokens / windowTokens) * 100)}% of ${formatWindowLabel(windowTokens)} window)`;
    return `[StrategicCompact] Context ~${approxTokens} tokens${scale} - consider /compact at the next logical boundary`;
  } catch (err) {
    log(`[StrategicCompact] Context signal skipped: ${err.message}`);
    return null;
  }
}

async function main() {
  // Claude Code passes hook input via stdin JSON; session_id is the
  // canonical field (legacy env var, then 'default', as fallbacks) and
  // transcript_path points at the session transcript JSONL used by the
  // context-size signal.
  let input = {};
  try {
    input = await readStdinJson({ timeoutMs: 1000 });
  } catch {
    input = {};
  }

  const rawSessionId = (input && typeof input.session_id === 'string' && input.session_id)
    ? input.session_id
    : (process.env.CLAUDE_SESSION_ID || 'default');
  const sessionId = rawSessionId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const transcriptPath = (input && typeof input.transcript_path === 'string') ? input.transcript_path : '';

  const tempDir = getTempDir();
  const counterFile = path.join(tempDir, `${COUNTER_FILE_PREFIX}${sessionId}`);
  const bucketFile = path.join(tempDir, `${CONTEXT_BUCKET_FILE_PREFIX}${sessionId}`);

  // Sweep stale state files (concern 1 of #2156). Cheap, swallows errors,
  // skips the active session's files. See cleanupOldCounters for details.
  cleanupOldCounters(tempDir, getCounterRetentionDays(), [counterFile, bucketFile]);

  const rawThreshold = parseInt(process.env.COMPACT_THRESHOLD || '50', 10);
  const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 10000
    ? rawThreshold
    : 50;

  const count = incrementToolCallCount(counterFile);

  const messages = [];

  // Primary signal (#2155): real context size from the transcript's latest
  // usage record. Fires at a window-scaled token threshold and re-fires only
  // after the context grows by another interval step.
  const contextSuggestion = buildContextSuggestion(transcriptPath, bucketFile, process.env);
  if (contextSuggestion) {
    messages.push(contextSuggestion);
  }

  // Secondary signal: tool-call count at threshold, then every 25 calls.
  if (count === threshold) {
    messages.push(`[StrategicCompact] ${threshold} tool calls reached - consider /compact if transitioning phases`);
  } else if (count > threshold && (count - threshold) % 25 === 0) {
    messages.push(`[StrategicCompact] ${count} tool calls - good checkpoint for /compact if context is stale`);
  }

  // log() writes to stderr (debug log). Per the Claude Code hooks guide,
  // non-blocking PreToolUse stderr (exit 0) is only written to the debug log;
  // it does not reach the model. To inject a user-facing suggestion without
  // blocking the tool call, emit structured JSON to stdout with
  // hookSpecificOutput.additionalContext — the documented mechanism for
  // PreToolUse hooks to add context to the next model turn. Hooks must emit
  // at most one stdout JSON payload per run, so both signals share it.
  if (messages.length > 0) {
    for (const msg of messages) {
      log(msg);
    }
    output({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: messages.join('\n')
      }
    });
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[StrategicCompact] Error:', err.message);
  process.exit(0);
});
