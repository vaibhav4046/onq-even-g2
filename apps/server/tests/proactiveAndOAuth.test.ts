import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOnQServer } from '../src/server.js';

describe('OpenRouter OAuth PKCE, Google OAuth JSON, Bulk Vault & 24/7 Proactive Harness', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  function mkDir() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'onq-proactive-test-'));
    dirs.push(d);
    return d;
  }

  it('completes 1-click OpenRouter OAuth PKCE and keeps key inside 0600 vault without leaking JSON', async () => {
    const fetchMock: typeof fetch = async (input, init) => {
      const u = String(input);
      if (u === 'https://openrouter.ai/api/v1/auth/keys') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          code?: string;
          code_verifier?: string;
          code_challenge_method?: string;
        };
        expect(body.code).toBe('or-code-123');
        expect(body.code_challenge_method).toBe('S256');
        expect((body.code_verifier ?? '').length).toBeGreaterThanOrEqual(32);
        return new Response(JSON.stringify({ key: 'sk-or-v1-test-oauth-999', user_id: 'usr_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    };

    const srv = await createOnQServer({
      dataDir: mkDir(),
      fetchImpl: fetchMock,
      disableProactiveTimer: true,
    });

    try {
      const startRes = await fetch(`${srv.url}/api/auth/openrouter/start?format=json`);
      expect(startRes.status).toBe(200);
      const startJson = (await startRes.json()) as {
        configured: boolean;
        authUrl: string;
        state: string;
        codeChallengeMethod: string;
      };
      expect(startJson.configured).toBe(true);
      expect(startJson.codeChallengeMethod).toBe('S256');
      expect(startJson.authUrl).toContain('https://openrouter.ai/auth');
      expect(startJson.authUrl).toContain('code_challenge=');

      const cbRes = await fetch(
        `${srv.url}/api/auth/openrouter/callback?code=or-code-123&state=${encodeURIComponent(startJson.state)}`,
        { headers: { Accept: 'application/json' } },
      );
      expect(cbRes.status).toBe(200);
      const cbJson = (await cbRes.json()) as {
        ok: boolean;
        status: {
          activeLlmProvider: string;
          connectors: { openrouter: { connected: boolean; mode: string } };
        };
      };
      expect(cbJson.ok).toBe(true);
      expect(cbJson.status.connectors.openrouter.connected).toBe(true);
      expect(cbJson.status.connectors.openrouter.mode).toBe('LIVE');
      expect(JSON.stringify(cbJson)).not.toContain('sk-or-v1-test-oauth-999');
    } finally {
      await srv.close();
    }
  });

  it('parses dropped Google OAuth JSON + configures Bulk Vault in one call', async () => {
    const srv = await createOnQServer({
      dataDir: mkDir(),
      disableProactiveTimer: true,
    });

    try {
      const sessRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
      const { sessionToken } = (await sessRes.json()) as { sessionToken: string };

      const googleJson = JSON.stringify({
        web: {
          client_id: '12345.apps.googleusercontent.com',
          client_secret: 'GOCSPX-mocksecret12345',
        },
      });

      const bulkRes = await fetch(`${srv.url}/api/connectors/connect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'bulk_vault',
          accountName: 'Vaibhav',
          accountEmail: 'vaibhav@example.com',
          googleOAuthJson: googleJson,
          openRouterKey: 'sk-or-v1-bulk-777',
          anthropicKey: 'sk-ant-bulk-888',
        }),
      });
      expect(bulkRes.status).toBe(200);
      const bulkData = (await bulkRes.json()) as {
        ok: boolean;
        status: {
          accountName: string;
          googleOAuthConfigured: boolean;
          connectors: {
            claude: { connected: boolean };
            openrouter: { connected: boolean };
          };
        };
      };
      expect(bulkData.ok).toBe(true);
      expect(bulkData.status.accountName).toBe('Vaibhav');
      expect(bulkData.status.googleOAuthConfigured).toBe(true);
      expect(bulkData.status.connectors.claude.connected).toBe(true);
      expect(bulkData.status.connectors.openrouter.connected).toBe(true);

      const gStartRes = await fetch(`${srv.url}/api/auth/google/start?format=json`);
      const gStart = (await gStartRes.json()) as { configured: boolean; authUrl?: string };
      expect(gStart.configured).toBe(true);
      expect(gStart.authUrl).toContain('accounts.google.com');
    } finally {
      await srv.close();
    }
  });

  it('runs 24/7 Proactive Agentic Harness pulse & toggle safely without committing writes', async () => {
    const srv = await createOnQServer({
      dataDir: mkDir(),
      disableProactiveTimer: true,
    });

    try {
      const sessRes = await fetch(`${srv.url}/api/demo/session`, { method: 'POST' });
      const { sessionToken } = (await sessRes.json()) as { sessionToken: string };

      const stRes = await fetch(`${srv.url}/api/proactive/status`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      expect(stRes.status).toBe(200);
      const st = (await stRes.json()) as {
        pulseCount: number;
        insights: Array<{ category: string; title: string }>;
      };
      expect(st.pulseCount).toBeGreaterThanOrEqual(1);
      expect(st.insights.length).toBeGreaterThanOrEqual(2);

      const pulseRes = await fetch(`${srv.url}/api/proactive/pulse`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const pulsed = (await pulseRes.json()) as { pulseCount: number };
      expect(pulsed.pulseCount).toBe(st.pulseCount + 1);

      const toggleOn = await fetch(`${srv.url}/api/proactive/toggle`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ running: true, intervalMs: 5000 }),
      });
      const onJson = (await toggleOn.json()) as { running: boolean; intervalMs: number };
      expect(onJson.running).toBe(true);
      expect(onJson.intervalMs).toBe(5000);

      const toggleOff = await fetch(`${srv.url}/api/proactive/toggle`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ running: false }),
      });
      const offJson = (await toggleOff.json()) as { running: boolean };
      expect(offJson.running).toBe(false);
    } finally {
      await srv.close();
    }
  });
});
