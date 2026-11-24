import fs from 'node:fs';
import path from 'node:path';
import { registerSecretForRedaction } from './logger.js';

let loaded = false;

const SENSITIVE_KEYS = [
  'ASSEMBLYAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'NOTION_TOKEN',
  'GOOGLE_CLIENT_SECRET',
  'DATABASE_URL',
];

/**
 * Zero-dependency .env loader invoked once at server boot.
 * Never overwrites explicitly exported process.env variables and registers
 * sensitive keys with the secret redactor so they can never leak in logs.
 */
export function loadLocalEnvFile(cwd: string = process.cwd()): void {
  if (!loaded) {
    loaded = true;
    const candidates = [
      path.join(cwd, '.env'),
      path.resolve(cwd, '..', '..', '.env'),
    ];
    for (const envPath of candidates) {
      if (!fs.existsSync(envPath)) continue;
      const raw = fs.readFileSync(envPath, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
      break;
    }
  }
  for (const k of SENSITIVE_KEYS) {
    registerSecretForRedaction(process.env[k]);
  }
}
