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

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramCallbackQuery {
  id: string;
  chatId: string;
  fromName: string;
  data: string;
  messageId?: number;
}

export interface TelegramUpdateEnvelope {
  updateId: number;
  message?: TelegramDigestMessage & { chatType?: string; chatUsername?: string };
  callbackQuery?: TelegramCallbackQuery;
}

/** getUpdates answered HTTP 409: an active webhook (or a second poller) owns this bot token. */
export class TelegramConflictError extends Error {
  constructor() {
    super('Webhook active on Telegram bot. Clear the webhook (deleteWebhook) or use the webhook endpoint instead of polling. HTTP 409');
    this.name = 'TelegramConflictError';
  }
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
    fromName: 'Investor contact',
    text: 'Can you share Q4 metrics + OnQ .ehpk build before 14:15 Dubai?',
    atIso: '2026-11-24T13:42:00.000Z',
    mode: 'SANDBOX',
  },
  {
    updateId: 8402,
    chatId: 'tg-grp-tvm',
    chatTitle: 'TVM Ventures · Demo Day',
    fromName: 'Group member',
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

  async getUpdatesRaw(offset?: number, limit = 20): Promise<TelegramUpdateEnvelope[]> {
    const clamped = Math.min(50, Math.max(1, limit));
    const offsetParam = typeof offset === 'number' && Number.isFinite(offset) ? `&offset=${Math.trunc(offset)}` : '';
    const allowed = encodeURIComponent(JSON.stringify(['message', 'callback_query']));
    const res = await this.fetchImpl(
      `${this.endpoint('getUpdates')}?limit=${clamped}${offsetParam}&allowed_updates=${allowed}`,
    );
    if (res.status === 409) {
      // Telegram returns 409 when a webhook is set on the bot or another getUpdates consumer is running.
      throw new TelegramConflictError();
    }
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
          chat?: {
            id: number | string;
            type?: string;
            title?: string;
            username?: string;
            first_name?: string;
          };
          from?: { first_name?: string; username?: string };
        };
        callback_query?: {
          id: string;
          data?: string;
          from?: { first_name?: string; username?: string };
          message?: { message_id?: number; chat?: { id: number | string } };
        };
      }>;
    };
    const envelopes: TelegramUpdateEnvelope[] = [];
    for (const upd of json.result ?? []) {
      const env: TelegramUpdateEnvelope = { updateId: upd.update_id };
      const msgObj = upd.message as
        | {
            date: number;
            text?: string;
            caption?: string;
            voice?: { duration?: number };
            reply_to_message?: { text?: string };
            chat?: { id: number | string; type?: string; title?: string; username?: string; first_name?: string };
            from?: { first_name?: string; username?: string };
          }
        | undefined;
      const bodyText =
        msgObj?.text ??
        msgObj?.caption ??
        (msgObj?.voice ? `[Voice note ${msgObj.voice.duration ?? 0}s]` : undefined);
      if (msgObj && bodyText) {
        const replyPrefix = msgObj.reply_to_message?.text
          ? `[Re: ${msgObj.reply_to_message.text.slice(0, 40)}] `
          : '';
        env.message = {
          updateId: upd.update_id,
          chatId: String(msgObj.chat?.id ?? this.defaultChatId ?? ''),
          chatType: msgObj.chat?.type ?? 'private',
          chatUsername: msgObj.chat?.username,
          chatTitle: msgObj.chat?.title ?? msgObj.chat?.first_name ?? msgObj.chat?.username ?? 'Telegram Chat',
          fromName: msgObj.from?.first_name ?? msgObj.from?.username ?? 'Contact',
          text: `${replyPrefix}${bodyText}`.slice(0, 500),
          atIso: new Date((msgObj.date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
          mode: 'LIVE',
        };
      }
      if (upd.callback_query?.id) {
        const cq = upd.callback_query;
        env.callbackQuery = {
          id: cq.id,
          chatId: String(cq.message?.chat?.id ?? this.defaultChatId ?? ''),
          fromName: cq.from?.first_name ?? cq.from?.username ?? 'Wearer',
          data: cq.data ?? '',
          messageId: cq.message?.message_id,
        };
      }
      if (env.message || env.callbackQuery) {
        envelopes.push(env);
      }
    }
    return envelopes;
  }

  async getRecentMessages(limit = 5): Promise<TelegramDigestMessage[]> {
    const raw = await this.getUpdatesRaw(undefined, Math.max(20, Math.min(50, limit * 5)));
    const items = raw
      .map((u) => u.message)
      .filter((m): m is TelegramDigestMessage & { chatType?: string; chatUsername?: string } => Boolean(m))
      .map(({ chatType: _ignored, chatUsername: _alsoIgnored, ...rest }) => rest);
    return items.slice(-limit).reverse();
  }

  async discoverLatestChat(): Promise<{ chatId: string; chatTitle: string; fromName: string } | null> {
    const recent = await this.getRecentMessages(5).catch(() => []);
    const found = recent.find((m) => m.chatId && m.chatId.trim().length > 0);
    if (!found) return null;
    return { chatId: found.chatId, chatTitle: found.chatTitle, fromName: found.fromName };
  }

  async sendMessage(text: string, chatId?: string): Promise<{ messageId: number; chatId: string }> {
    return this.postTelegramMessage({ text, chatId });
  }

  async sendMessageWithInlineKeyboard(
    text: string,
    rows: TelegramInlineButton[][],
    chatId?: string,
  ): Promise<{ messageId: number; chatId: string }> {
    return this.postTelegramMessage({ text, chatId, inlineKeyboard: rows });
  }

  async answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
    const res = await this.fetchImpl(this.endpoint('answerCallbackQuery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text.slice(0, 180),
        show_alert: false,
      }),
    });
    if (!res.ok) {
      throw new Error(`Telegram answerCallbackQuery failed: HTTP ${res.status}`);
    }
  }

  /** Replaces a sent message's text and (by omitting reply_markup) removes its buttons, so a decision can't be tapped twice. */
  async editMessageText(chatId: string, messageId: number, text: string): Promise<void> {
    const res = await this.fetchImpl(this.endpoint('editMessageText'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text.slice(0, 3900) }),
    });
    if (!res.ok) {
      throw new Error(`Telegram editMessageText failed: HTTP ${res.status}`);
    }
  }

  /** Registers the "/" menu inside Telegram. */
  async setMyCommands(commands: Array<{ command: string; description: string }>): Promise<void> {
    const res = await this.fetchImpl(this.endpoint('setMyCommands'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands }),
    });
    if (!res.ok) {
      throw new Error(`Telegram setMyCommands failed: HTTP ${res.status}`);
    }
  }

  private async postTelegramMessage(params: {
    text: string;
    chatId?: string;
    inlineKeyboard?: TelegramInlineButton[][];
  }): Promise<{ messageId: number; chatId: string }> {
    const targetChat = (params.chatId ?? this.defaultChatId ?? '').trim();
    if (!targetChat) {
      throw new Error('Telegram Chat ID is required to send verified replies');
    }
    const payload: Record<string, unknown> = {
      chat_id: targetChat,
      text: params.text,
      disable_notification: false,
    };
    if (params.inlineKeyboard && params.inlineKeyboard.length > 0) {
      payload.reply_markup = { inline_keyboard: params.inlineKeyboard };
    }
    const res = await this.fetchImpl(this.endpoint('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { ok?: boolean; result?: { message_id?: number } };
    if (!json.ok) throw new Error('Telegram sendMessage rejected');
    return { messageId: json.result?.message_id ?? 0, chatId: targetChat };
  }
}

export interface TelegramSeenChat {
  chatId: string;
  title: string;
  username: string | null;
  type: string;
  lastText: string;
}

/** Chats found in raw updates (newest message per chat first). Reads only; never confirms an offset. */
export function seenChatsFromUpdates(updates: TelegramUpdateEnvelope[]): TelegramSeenChat[] {
  const byChat = new Map<string, TelegramSeenChat>();
  for (const u of [...updates].reverse()) {
    const m = u.message;
    if (!m?.chatId || byChat.has(m.chatId)) continue;
    byChat.set(m.chatId, { chatId: m.chatId, title: m.chatTitle, username: m.chatUsername ?? null, type: m.chatType ?? 'private', lastText: m.text.slice(0, 160) });
  }
  return [...byChat.values()];
}

export function getSandboxTelegramDigest(): TelegramDigestMessage[] {
  return [...SANDBOX_TELEGRAM_DIGEST];
}
