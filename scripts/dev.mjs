import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev', '-w', '@oncue/server'], { stdio: ['ignore', 'inherit', 'inherit'], shell: true }),
  spawn('npm', ['run', 'dev', '-w', '@oncue/web'], { stdio: ['ignore', 'inherit', 'inherit'], shell: true }),
];

for (const [idx, p] of procs.entries()) {
  const name = idx === 0 ? '@oncue/server' : '@oncue/web';
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
