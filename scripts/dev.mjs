import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev', '-w', '@onq/server'], { stdio: ['ignore', 'inherit', 'inherit'], shell: true }),
  spawn('npm', ['run', 'dev', '-w', '@onq/web'], { stdio: ['ignore', 'inherit', 'inherit'], shell: true }),
  spawn('npm', ['run', 'dev', '-w', '@onq/glasses'], { stdio: ['ignore', 'inherit', 'inherit'], shell: true }),
];

const names = ['@onq/server', '@onq/web', '@onq/glasses'];
for (const [idx, p] of procs.entries()) {
  const name = names[idx] ?? 'worker';
  p.on('error', (err) => console.error(`[dev:${name}] spawn error:`, err));
  p.on('exit', (code, sig) => console.error(`[dev:${name}] exited (code=${code}, signal=${sig})`));
}

function shutdown() {
  for (const p of procs) {
    try {
      p.kill();
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
