import { registerSecretForRedaction } from '../logger.js';

export interface TelegramDigestMessage {
  updateId: number;
  chatId: string;
  chatTitle: string;
  fromName: string;
  text: string;
  atIso: string;
  mode: 'LIVE' | 'SANDBOX';
}

export interface TelegramProbeResult {
  ok: boolean;
  botUsername?: string;
  botName?: string;
  latencyMs: number;
  detail: string;
}

const SANDBOX_TELEGRAM_DIGEST: TelegramDigestMessage[] = [
  {
    updateId: 8401,
    chatId: 'tg-grp-even',
    chatTitle: 'Even G2 Builders',
    fromName: 'Priya Nair',
    text: 'Can you share Q4 metrics + OnQ .ehpk build before 14:15 Dubai?',
    atIso: '2026-11-24T13:42:00.000Z',
    mode: 'SANDBOX',
  },
  {
    updateId: 8402,
    chatId: 'tg-grp-tvm',
    chatTitle: 'TVM Ventures · Demo Day',
    fromName: 'Samir K',
    text: 'Track 04 + Best Telegram integration slot confirmed for 3m pitch.',
    atIso: '2026-11-24T13:45:00.000Z',
    mode: 'SANDBOX',
  },
];

/**
 * Zero-dependency Telegram Bot API client supporting Track 01 + Best Telegram
 * prize integrations alongside Track 04 Workspace automation.
 */
export class TelegramWorkspaceClient {
  constructor(
    private readonly botToken: string,
    private readonly defaultChatId?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    registerSecretForRedaction(botToken);
  }

  private endpoint(method: string): string {
    return `https://api.telegram.org/bot${encodeURIComponent(this.botToken)}/${method}`;
  }

  async ping(): Promise<TelegramProbeResult> {
    const t0 = Date.now();
    try {
      const res = await this.fetchImpl(this.endpoint('getMe'));
      const latencyMs = Math.max(1, Date.now() - t0);
      if (!res.ok) {
        return {
          ok: false,
          latencyMs,
          detail: `Telegram API rejected token: HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as {
        ok?: boolean;
        result?: { username?: string; first_name?: string };
      };
      if (!data.ok || !data.result) {
        return { ok: false, latencyMs, detail: 'Telegram getMe returned not ok' };
      }
      return {
        ok: true,
        botUsername: data.result.username,
        botName: data.result.first_name,
        latencyMs,
        detail: `Telegram @${data.result.username ?? 'bot'} verified (${latencyMs}ms)`,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Math.max(1, Date.now() - t0),
        detail: err instanceof Error ? err.message : 'Telegram network check failed',
      };
    }
  }

  async getRecentMessages(limit = 5): Promise<TelegramDigestMessage[]> {
    const res = await this.fetchImpl(`${this.endpoint('getUpdates')}?limit=${Math.min(20, Math.max(1, limit))}`);
    if (!res.ok) {
      throw new Error(`Telegram getUpdates failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      ok?: boolean;
      result?: Array<{
        update_id: number;
        message?: {
          date: number;
          text?: string;
          chat?: { id: number | string; title?: string; username?: string; first_name?: string };
          from?: { first_name?: string; username?: string };
        };
      }>;
    };
    const items: TelegramDigestMessage[] = [];
    for (const upd of json.result ?? []) {
      const msg = upd.message;
      if (!msg?.text) continue;
      items.push({
        updateId: upd.update_id,
        chatId: String(msg.chat?.id ?? this.defaultChatId ?? ''),
        chatTitle: msg.chat?.title ?? msg.chat?.first_name ?? msg.chat?.username ?? 'Telegram Chat',
        fromName: msg.from?.first_name ?? msg.from?.username ?? 'Contact',
        text: msg.text.slice(0, 240),
        atIso: new Date((msg.date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        mode: 'LIVE',
      });
    }
    return items.slice(-limit).reverse();
  }

  async sendMessage(text: string, chatId?: string): Promise<{ messageId: number; chatId: string }> {
    const targetChat = (chatId ?? this.defaultChatId ?? '').trim();
    if (!targetChat) {
      throw new Error('Telegram Chat ID is required to send verified replies');
    }
    const res = await this.fetchImpl(this.endpoint('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChat,
        text,
        disable_notification: false,
      }),
    });
    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { ok?: boolean; result?: { message_id?: number } };
    if (!json.ok) throw new Error('Telegram sendMessage rejected');
    return { messageId: json.result?.message_id ?? 0, chatId: targetChat };
  }
}

export function getSandboxTelegramDigest(): TelegramDigestMessage[] {
  return [...SANDBOX_TELEGRAM_DIGEST];
}
