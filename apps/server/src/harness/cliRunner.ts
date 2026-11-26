import { spawn } from 'node:child_process';
import type { MetricsLedger } from './metricsLedger.js';

export interface CliRunOptions {
  /** Called once when the first stdout byte arrives (real time-to-first-token for a CLI). */
  onFirstByte?: () => void;
  /** Direct callers (no router span) pass a ledger so this run is recorded as one 'llm' step. */
  meter?: { ledger: MetricsLedger; provider: string; model?: string | null };
}

/** Runs a local subscription CLI (Claude Code / Codex / OpenCode) with the prompt on stdin. No user text in the command line. */
export function runCliPrompt(
  binaryPath: string,
  args: string[],
  prompt: string,
  timeoutMs = 90_000,
  opts: CliRunOptions = {},
): Promise<string> {
  const span = opts.meter?.ledger.begin({ kind: 'llm', provider: opts.meter.provider, model: opts.meter.model });
  return new Promise<string>((resolve, reject) => {
    const isShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binaryPath);
    // .cmd shims need a shell on Windows; safe here because the command line is constant and the prompt goes via stdin.
    // args are constant flags or catalog-validated model ids (never user text), so joining them into the command line is safe.
    const child = isShim
      ? spawn(`"${binaryPath}" ${args.map((a) => (a === '' ? '""' : a)).join(' ')}`, { shell: true, windowsHide: true })
      : spawn(binaryPath, args, { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Local AI CLI timed out'));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      if (!out) {
        opts.onFirstByte?.();
        span?.firstToken();
      }
      out += String(d);
    });
    child.stderr.on('data', (d) => (err += String(d)));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`Local AI CLI exited ${code}: ${err.slice(0, 160)}`));
    });
    child.stdin.end(prompt);
  }).then(
    (out) => {
      span?.end({ inputChars: prompt.length, outputChars: out.length });
      return out;
    },
    (e: unknown) => {
      span?.end({ ok: false, error: e instanceof Error ? e.message : 'CLI failed', inputChars: prompt.length });
      throw e;
    },
  );
}
