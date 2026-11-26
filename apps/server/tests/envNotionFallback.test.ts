import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withEnvNotionFallback } from '../src/env.js';
import { createOnQServer } from '../src/server.js';

const ENV_TOKEN = 'ntn_env_fallback_token_0001';
const VAULT_TOKEN = 'ntn_vault_primary_token_0002';
const ENV_DB = 'envdb0000000000000000000000000a1';

describe('withEnvNotionFallback (pure)', () => {
  it('fills a missing Notion token and database id from env, vault values stay primary', () => {
    const env = { NOTION_TOKEN: ENV_TOKEN, NOTION_DATABASE_ID: ENV_DB } as NodeJS.ProcessEnv;
    expect(withEnvNotionFallback({}, env)).toEqual({ notionToken: ENV_TOKEN, notionDatabaseId: ENV_DB });
    const vaulted = { notionToken: VAULT_TOKEN, notionDatabaseId: 'vaultdb' };
    expect(withEnvNotionFallback(vaulted, env)).toBe(vaulted); // untouched
    // vault has a database id but no token: env token joins the vault id, never the env id
    expect(withEnvNotionFallback({ notionDatabaseId: 'vaultdb' }, env)).toEqual({ notionToken: ENV_TOKEN, notionDatabaseId: 'vaultdb' });
    // blank env values are ignored
    expect(withEnvNotionFallback({}, { NOTION_TOKEN: '  ' } as NodeJS.ProcessEnv)).toEqual({});
  });
});

describe('Notion env fallback through the server', () => {
  const saved = { token: process.env.NOTION_TOKEN, db: process.env.NOTION_DATABASE_ID };
  const closers: Array<() => Promise<void>> = [];

  beforeEach(() => {
    process.env.NOTION_TOKEN = ENV_TOKEN;
    process.env.NOTION_DATABASE_ID = ENV_DB;
  });
  afterEach(async () => {
    if (saved.token === undefined) delete process.env.NOTION_TOKEN;
    else process.env.NOTION_TOKEN = saved.token;
    if (saved.db === undefined) delete process.env.NOTION_DATABASE_ID;
    else process.env.NOTION_DATABASE_ID = saved.db;
    while (closers.length) await closers.pop()?.();
  });

  async function boot() {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === 'https://api.notion.com/v1/search') {
        seen.push(new Headers(init?.headers).get('Authorization') ?? '');
        return new Response(JSON.stringify({ results: [{ object: 'database', id: ENV_DB, title: [{ plain_text: 'Tasks' }] }] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-notion-env-'));
    const srv = await createOnQServer({ port: 0, dataDir, disableProactiveTimer: true, fetchImpl });
    closers.push(async () => {
      await srv.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    });
    const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
    const h = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
    return { srv, h, seen };
  }

  it('empty vault: Notion shows LIVE from the environment and its token is used, without being copied into the vault', async () => {
    const { srv, h, seen } = await boot();
    expect(srv.vault.load().notionToken).toBeUndefined();

    const status = (await (await fetch(`${srv.url}/api/connectors/status`, { headers: h })).json()) as {
      connectors: { notion: { connected: boolean; mode: string } };
    };
    expect(status.connectors.notion).toMatchObject({ connected: true, mode: 'LIVE' });

    const dbs = await fetch(`${srv.url}/api/connectors/notion/databases`, { method: 'POST', headers: h, body: '{}' });
    expect(dbs.status).toBe(200);
    expect(seen).toEqual([`Bearer ${ENV_TOKEN}`]);
    expect(srv.vault.load().notionToken).toBeUndefined(); // env secret is never persisted
  });

  it('vault stays primary: a saved Notion token wins over NOTION_TOKEN', async () => {
    const { srv, h, seen } = await boot();
    srv.vault.save({ notionToken: VAULT_TOKEN, notionDatabaseId: 'vaultdb' });
    const dbs = await fetch(`${srv.url}/api/connectors/notion/databases`, { method: 'POST', headers: h, body: '{}' });
    expect(dbs.status).toBe(200);
    expect(seen).toEqual([`Bearer ${VAULT_TOKEN}`]);
  });

  it('with neither vault nor env value Notion stays SANDBOX', async () => {
    delete process.env.NOTION_TOKEN;
    delete process.env.NOTION_DATABASE_ID;
    const { srv, h } = await boot();
    const status = (await (await fetch(`${srv.url}/api/connectors/status`, { headers: h })).json()) as {
      connectors: { notion: { connected: boolean; mode: string } };
    };
    expect(status.connectors.notion).toMatchObject({ connected: false, mode: 'SANDBOX' });
    const dbs = await fetch(`${srv.url}/api/connectors/notion/databases`, { method: 'POST', headers: h, body: '{}' });
    expect(dbs.status).toBe(400);
  });
});
