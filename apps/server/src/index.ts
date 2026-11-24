import os from 'node:os';
import path from 'node:path';
import { createOnCueServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const dataDir = process.env.ONCUE_DATA_DIR ?? path.join(os.homedir(), '.oncue');

createOnCueServer({ port, dataDir }).catch((err) => {
  console.error('Failed to start OnCue server:', err);
  process.exit(1);
});
