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
  'TELEGRAM_BOT_TOKEN',
  'XAI_API_KEY',
  'OMNIROUTE_API_KEY',
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

/**
 * Notion fallback: the vault stays primary. Only when it holds no Notion token do NOTION_TOKEN /
 * NOTION_DATABASE_ID from the environment fill in (a vault database id still wins over the env one).
 * Read-only view: never pass the result to vault.save(), or the env secret would be copied into the vault.
 */
export function withEnvNotionFallback<T extends { notionToken?: string; notionDatabaseId?: string }>(
  creds: T,
  env: NodeJS.ProcessEnv = process.env,
): T {
  if (creds.notionToken?.trim()) return creds;
  const token = env.NOTION_TOKEN?.trim();
  if (!token) return creds;
  const databaseId = creds.notionDatabaseId?.trim() || env.NOTION_DATABASE_ID?.trim();
  return { ...creds, notionToken: token, ...(databaseId ? { notionDatabaseId: databaseId } : {}) };
}
