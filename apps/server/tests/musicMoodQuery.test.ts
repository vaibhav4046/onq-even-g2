import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOnQServer } from '../src/server.js';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

/** Boots a clean server whose only outbound fetch is a stub iTunes catalog that records its search terms. */
async function startWithItunesSpy() {
  const terms: string[] = [];
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-music-mood-'));
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname === 'itunes.apple.com') {
      terms.push(url.searchParams.get('term') ?? '');
      return new Response(
        JSON.stringify({ resultCount: 1, results: [{ trackId: 1, trackName: 'Lofi Loop', artistName: 'Test', trackTimeMillis: 180_000 }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const srv = await createOnQServer({ port: 0, dataDir, disableProactiveTimer: true, fetchImpl });
  closers.push(async () => {
    await srv.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const { sessionToken } = (await (await fetch(`${srv.url}/api/demo/session`, { method: 'POST' })).json()) as { sessionToken: string };
  return { url: srv.url, sessionToken, terms };
}

describe('Music curator mood queries', () => {
  it('a bare mood from the web route uses the tuned mood query, not the literal mood word', async () => {
    const srv = await startWithItunesSpy();
    const post = (body: Record<string, unknown>) =>
      fetch(`${srv.url}/api/os/music/curate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${srv.sessionToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    expect((await post({ mood: 'coding', durationMin: 45 })).status).toBe(200);
    expect((await post({ mood: 'deep_focus', durationMin: 45 })).status).toBe(200);
    expect(srv.terms).toEqual(['lofi beats', 'ambient study']);
  });

  it('keeps an explicit custom query that goes beyond the mood word', async () => {
    const srv = await startWithItunesSpy();
    await fetch(`${srv.url}/api/os/music/curate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${srv.sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mood: 'coding', query: 'jazz piano', durationMin: 30 }),
    });
    expect(srv.terms).toEqual(['coding jazz piano']);
  });
});
