import { spawn } from 'node:child_process';

/** Runs a local subscription CLI (Claude Code / Codex / OpenCode) with the prompt on stdin. No user text in the command line. */
export function runCliPrompt(binaryPath: string, args: string[], prompt: string, timeoutMs = 90_000): Promise<string> {
  return new Promise((resolve, reject) => {
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
    child.stdout.on('data', (d) => (out += String(d)));
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
  });
}
