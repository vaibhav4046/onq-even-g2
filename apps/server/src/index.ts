import { createOnQServer } from './server.js';
import { resolveDefaultDataDir } from './tokenVault.js';

const port = Number(process.env.PORT ?? 8787);
const dataDir = resolveDefaultDataDir();

createOnQServer({ port, dataDir }).catch((err) => {
  console.error('Failed to start OnQ server:', err);
  process.exit(1);
});
