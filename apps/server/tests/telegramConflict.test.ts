import { describe, expect, it, vi } from 'vitest';
import { TelegramCommandCentre } from '../src/harness/telegramCommandCentre.js';
import type { UnifiedOsHarness } from '../src/harness/unifiedOsHarness.js';

function makeCentre(fetchImpl: typeof fetch) {
  const osHarness = { getLastTelegramUpdateId: () => undefined } as unknown as UnifiedOsHarness;
  return new TelegramCommandCentre({
    osHarness,
    getCredentials: () => ({ botToken: '123:test-token', chatId: '1' }),
    fetchImpl,
  });
}

describe('Telegram getUpdates HTTP 409 (webhook conflict)', () => {
  it('reports an actionable webhook message and backs off instead of re-polling every tick', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":false}', { status: 409 })) as unknown as typeof fetch;
    const centre = makeCentre(fetchImpl);

    expect(await centre.pollOnce()).toBe(0);
    expect(centre.getStatus().lastError).toMatch(/Webhook active on Telegram bot/);
    expect(centre.getStatus().lastError).toMatch(/409/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Second tick lands inside the backoff window: no new network call.
    expect(await centre.pollOnce()).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the plain error path for other HTTP failures (no long backoff)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const centre = makeCentre(fetchImpl);

    await centre.pollOnce();
    expect(centre.getStatus().lastError).toBe('Telegram getUpdates failed: HTTP 500');
    await centre.pollOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
