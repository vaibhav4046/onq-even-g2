import os from 'node:os';
import path from 'node:path';
import { createOnQServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.ONQ_DATA_DIR ?? path.join(os.homedir(), '.onq');

createOnQServer({ port, dataDir }).catch((err) => {
  console.error('Failed to start OnQ server:', err);
  process.exit(1);
});
