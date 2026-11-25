import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOnQServer } from '../src/server.js';

describe('OnQ LiveUI Apps, Multi-Agent Kanban, Watch Screen & Pacing Endpoints', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  function mkDir() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-fleet-test-'));
    dirs.push(d);
    return d;
  }

  it('generates/interacts/pins LiveUI micro-apps, manages Kanban fleet + human screen takeover, and paces display tags', async () => {
    const srv = await createOnQServer({
      dataDir: mkDir(),
      disableProactiveTimer: true,
    });

    try {
      const sessRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
      const { sessionToken } = (await sessRes.json()) as { sessionToken: string };
      const auth = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };

      // 1. Generate LiveUI Split Bill app + nudge stepper
      const genRes = await fetch(`${srv.url}/api/liveui/generate`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ prompt: 'Split the bill 4 ways', pin: true }),
      });
      expect(genRes.status).toBe(200);
      const genJson = (await genRes.json()) as {
        surface: { id: string; components: Array<{ value?: number }> };
        g2: { lines: string[] };
      };
      expect(genJson.surface.components[0]?.value).toBe(15);
      expect(genJson.g2.lines.length).toBeLessThanOrEqual(7);

      const stepRes = await fetch(`${srv.url}/api/liveui/interact`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ type: 'step', delta: 5 }),
      });
      expect(stepRes.status).toBe(200);
      const stepJson = (await stepRes.json()) as {
        surface: { components: Array<{ value?: number }> };
      };
      expect(stepJson.surface.components[0]?.value).toBe(20);

      // 2. Pin to Quick Apps & SQLite Memory
      const pinRes = await fetch(`${srv.url}/api/liveui/pin`, {
        method: 'POST',
        headers: auth,
        body: '{}',
      });
      expect(pinRes.status).toBe(200);

      // 3. Multi-agent Kanban create + complete + Watch Screen takeover/click/release
      const kbCreate = await fetch(`${srv.url}/api/kanban/create`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ title: 'Audit OpenClaw PR', lane: 'needs_you', agentName: 'CodeBot' }),
      });
      expect(kbCreate.status).toBe(200);
      const created = (await kbCreate.json()) as { card: { id: string; lane: string } };
      expect(created.card.lane).toBe('needs_you');

      const kbComplete = await fetch(`${srv.url}/api/kanban/action`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ id: created.card.id, action: 'complete' }),
      });
      expect(kbComplete.status).toBe(200);
      const doneJson = (await kbComplete.json()) as { card: { lane: string } };
      expect(doneJson.card.lane).toBe('done');

      const takeRes = await fetch(`${srv.url}/api/screen/control`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ action: 'takeover' }),
      });
      expect(takeRes.status).toBe(200);
      const takeJson = (await takeRes.json()) as { screen: { holder: string; leaseEpoch: number } };
      expect(takeJson.screen.holder).toBe('human');
      expect(takeJson.screen.leaseEpoch).toBeGreaterThan(1);

      const badCtrl = await fetch(`${srv.url}/api/screen/control`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ action: 'rm_rf' }),
      });
      expect(badCtrl.status).toBe(400);

      // 4. Display Pace endpoint
      const paceRes = await fetch(`${srv.url}/api/pace`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          text: '<mood:determined/>Deploy ready.<beat/><dwell>Tap ring to ship.</dwell>',
          wpm: 220,
        }),
      });
      expect(paceRes.status).toBe(200);
      const paceJson = (await paceRes.json()) as { parsed: { plainText: string; moods: string[] } };
      expect(paceJson.parsed.plainText).toBe('Deploy ready. Tap ring to ship.');
      expect(paceJson.parsed.moods).toEqual(['determined']);
    } finally {
      await srv.close();
    }
  });
});
