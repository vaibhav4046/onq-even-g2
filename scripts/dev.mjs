import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev', '-w', '@oncue/server'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev', '-w', '@oncue/web'], { stdio: 'inherit', shell: true }),
];

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
