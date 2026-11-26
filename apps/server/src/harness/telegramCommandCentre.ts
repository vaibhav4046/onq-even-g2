import { TelegramConflictError, TelegramWorkspaceClient } from '../providers/telegramProvider.js';
import type { TelegramDigestMessage, TelegramSeenChat, TelegramUpdateEnvelope } from '../providers/telegramProvider.js';
import type { OsApprovalItem, UnifiedOsHarness } from './unifiedOsHarness.js';

const CONFLICT_BACKOFF_MS = 5 * 60_000;

export interface TelegramCommandCentreDeps {
  osHarness: UnifiedOsHarness;
  getCredentials: () => { botToken?: string; chatId?: string };
  /** Chats the owner picked; only their new messages (plus the owner chat) are kept for the digest. */
  getWatchedChats?: () => string[];
  fetchImpl?: typeof fetch;
  onLog?: (msg: string) => void;
  onError?: (msg: string) => void;
}

/**
 * Real Telegram Bot Command Centre & Inline-Approval Poller.
 * Connects Telegram slash commands & inline keyboard button callbacks directly
 * to the UnifiedOsHarness so Telegram, Web, and Even G2 Glasses share one state.
 */
export class TelegramCommandCentre {
  private timer: NodeJS.Timeout | null = null;
  private pollingInFlight = false;
  private active = false;
  private lastError: string | null = null;
  private processedCount = 0;
  private recentMessages: TelegramDigestMessage[] = [];
  /** Every chat that messaged the bot (id, title, type, last text), so the owner can pick chats before watching any. */
  private seenChats = new Map<string, TelegramSeenChat>();

  /** Newest first; only watched chats and the owner chat are ever stored. */
  getRecentMessages(limit = 6): TelegramDigestMessage[] {
    return this.recentMessages.slice(0, limit).map((m) => ({ ...m }));
  }

  /** Newest first, at most 50, in memory only. */
  getSeenChats(): TelegramSeenChat[] {
    return [...this.seenChats.values()].reverse().map((c) => ({ ...c }));
  }

  private recordSeenChat(msg: NonNullable<TelegramUpdateEnvelope['message']>): void {
    if (!msg.chatId) return;
    this.seenChats.delete(msg.chatId); // re-insert so Map order stays oldest -> newest
    this.seenChats.set(msg.chatId, {
      chatId: msg.chatId,
      title: msg.chatTitle,
      username: msg.chatUsername ?? null,
      type: msg.chatType ?? 'private',
      lastText: msg.text.slice(0, 160),
    });
    if (this.seenChats.size > 50) this.seenChats.delete(this.seenChats.keys().next().value as string);
  }

  /** After a 409 (webhook conflict) we stop hammering Telegram until this timestamp. */
  private conflictBackoffUntilMs = 0;

  constructor(private readonly deps: TelegramCommandCentreDeps) {}

  isPolling(): boolean {
    return this.active;
  }

  getStatus(): { active: boolean; processedCount: number; lastError: string | null } {
    return {
      active: this.active,
      processedCount: this.processedCount,
      lastError: this.lastError,
    };
  }

  private getClient(): TelegramWorkspaceClient | null {
    const { botToken, chatId } = this.deps.getCredentials();
    if (!botToken?.trim()) return null;
    return new TelegramWorkspaceClient(botToken.trim(), chatId?.trim(), this.deps.fetchImpl);
  }

  /** Plain message to the paired owner chat (used when a Telegram-started task finishes). */
  async notifyText(text: string): Promise<void> {
    const client = this.getClient();
    const { chatId } = this.deps.getCredentials();
    if (!client || !chatId?.trim()) return;
    await client.sendMessage(text.slice(0, 3900), chatId).catch(() => undefined);
  }

  async notifyApproval(item: OsApprovalItem): Promise<number | undefined> {
    const client = this.getClient();
    const { chatId } = this.deps.getCredentials();
    if (!client || !chatId?.trim()) return undefined;
    const text = [
      `OnQ L2 Approval Needed (${item.id})`,
      `Destination: ${item.destination} | Agent: ${item.specialistId}`,
      `Title: ${item.title}`,
      `Preview: ${item.payloadPreview.slice(0, 220)}`,
    ].join('\n');
    const sent = await client.sendMessageWithInlineKeyboard(
      text,
      [
        [
          { text: 'Approve Once', callback_data: `approve:${item.id}` },
          { text: 'Reject', callback_data: `reject:${item.id}` },
        ],
      ],
      chatId,
    );
    return sent.messageId;
  }

  async processUpdate(update: TelegramUpdateEnvelope): Promise<{ handled: boolean; reply?: string }> {
    const lastId = this.deps.osHarness.getLastTelegramUpdateId() ?? 0;
    if (update.updateId > lastId) {
      this.deps.osHarness.setLastTelegramUpdateId(update.updateId);
    }

    const client = this.getClient();

    if (update.callbackQuery) {
      const cq = update.callbackQuery;
      const [verb, approvalId] = cq.data.split(':');
      if ((verb === 'approve' || verb === 'reject') && approvalId) {
        const res = await this.deps.osHarness.decideApproval(approvalId, verb, {
          surface: 'telegram',
          chatId: cq.chatId,
        });
        const notice = res.ok
          ? `${verb === 'approve' ? 'Executed' : 'Rejected'} ${approvalId}: ${res.item?.executionDetail ?? 'Done'}`
          : res.error ?? 'Action blocked';
        if (client) {
          await client.answerCallbackQuery(cq.id, notice).catch(() => null);
          // Edit the approval card in place (buttons disappear, no double taps); fall back to a new message.
          const done = cq.messageId
            ? await client.editMessageText(cq.chatId, cq.messageId, `${res.ok ? (verb === 'approve' ? 'APPROVED' : 'REJECTED') : 'BLOCKED'}: ${notice}`).then(() => true, () => false)
            : false;
          if (!done) await client.sendMessage(notice, cq.chatId).catch(() => null);
        }
        this.processedCount += 1;
        return { handled: true, reply: notice };
      }
      if (client) {
        await client.answerCallbackQuery(cq.id, 'Unknown callback action').catch(() => null);
      }
      return { handled: false };
    }

    if (update.message?.text) {
      const msg = update.message;
      this.recordSeenChat(msg);

      // Owner gate: anyone can message a public bot, so only the paired owner chat may run commands.
      // /myid works anywhere so pairing is one paste; everything else from other chats gets a generic refusal.
      const owner = this.deps.getCredentials().chatId?.trim();
      const word = (msg.text.trim().split(/\s+/)[0] ?? '').toLowerCase().split('@')[0];
      const isCommand = word.startsWith('/');
      const watched = this.deps.getWatchedChats?.() ?? [];
      const isGroup = msg.chatType === 'group' || msg.chatType === 'supergroup';
      const isWatchedGroup = isGroup && Boolean(msg.chatId) && watched.includes(msg.chatId);
      const READ_ONLY_GROUP_CMDS = new Set(['/help', '/status', '/brief', '/morning', '/evening', '/recap']);
      // Read side: remember new messages only from chats the owner picked (and the owner chat) for the digest.
      if (!isCommand && msg.chatId && (msg.chatId === owner || watched.includes(msg.chatId))) {
        this.recentMessages = [{ ...msg }, ...this.recentMessages].slice(0, 50);
      }
      // Ordinary chatter in other chats is never answered; the bot stays quiet in groups.
      if (!isCommand && (!owner || msg.chatId !== owner)) {
        return { handled: false };
      }
      if (word === '/myid' || word === '/start') {
        const reply = isGroup
          ? `Group chat ID is ${msg.chatId}. In OnQ -> Connect -> Telegram, click Watch to monitor this group (owner must be a private DM).`
          : `Your chat ID is ${msg.chatId}. In OnQ, open Connectors, Telegram, and paste it as the owner chat.`;
        if (client && msg.chatId) await client.sendMessage(reply, msg.chatId).catch(() => null);
        return { handled: true, reply };
      }
      if (isWatchedGroup && READ_ONLY_GROUP_CMDS.has(word)) {
        const outcome = await this.deps.osHarness.handleCommand({
          text: msg.text,
          surface: 'telegram',
          chatId: msg.chatId,
          chatType: msg.chatType,
        });
        this.processedCount += 1;
        if (client && msg.chatId) await client.sendMessage(outcome.reply, msg.chatId).catch(() => null);
        return { handled: true, reply: outcome.reply };
      }
      if (!owner || msg.chatId !== owner) {
        this.deps.onLog?.(`Ignored Telegram message from unpaired chat ${msg.chatId}`);
        if (isGroup && !isWatchedGroup) {
          // Never spam live unwatched Telegram groups, while still returning the guard reason to webhook-test callers.
          return {
            handled: false,
            reply: 'Group privacy guard: only your owner DM may run OnQ commands.',
          };
        }
        const refusal = isGroup
          ? 'Group privacy guard: OnQ only runs read-only checks (/status, /brief, /evening) in watched groups.'
          : owner
            ? 'This bot is private.'
            : 'Not paired yet. Send /myid and paste the number into OnQ.';
        if (client && msg.chatId) await client.sendMessage(refusal, msg.chatId).catch(() => null);
        return { handled: false, reply: refusal };
      }

      const outcome = await this.deps.osHarness.handleCommand({
        text: msg.text,
        surface: 'telegram',
        chatId: msg.chatId,
        chatType: msg.chatType,
      });
      this.processedCount += 1;
      if (client && msg.chatId) {
        if (outcome.approval && outcome.approval.status === 'PENDING') {
          await client
            .sendMessageWithInlineKeyboard(
              outcome.reply,
              [
                [
                  { text: 'Approve Once', callback_data: `approve:${outcome.approval.id}` },
                  { text: 'Reject', callback_data: `reject:${outcome.approval.id}` },
                ],
              ],
              msg.chatId,
            )
            .catch(() => null);
        } else {
          await client.sendMessage(outcome.reply, msg.chatId).catch(() => null);
        }
      }
      return { handled: true, reply: outcome.reply };
    }

    return { handled: false };
  }

  async pollOnce(): Promise<number> {
    if (this.pollingInFlight) return 0;
    if (Date.now() < this.conflictBackoffUntilMs) return 0;
    const client = this.getClient();
    if (!client) return 0;
    this.pollingInFlight = true;
    try {
      const lastId = this.deps.osHarness.getLastTelegramUpdateId();
      const updates = await client.getUpdatesRaw(typeof lastId === 'number' ? lastId + 1 : undefined, 15);
      for (const upd of updates) {
        await this.processUpdate(upd);
      }
      this.lastError = null;
      this.conflictBackoffUntilMs = 0;
      if (updates.length > 0) {
        this.deps.onLog?.(`Processed ${updates.length} live Telegram update(s)`);
      }
      return updates.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Telegram poll failed';
      if (err instanceof TelegramConflictError) {
        this.conflictBackoffUntilMs = Date.now() + CONFLICT_BACKOFF_MS;
      }
      this.lastError = msg;
      this.deps.onError?.(msg);
      return 0;
    } finally {
      this.pollingInFlight = false;
    }
  }

  /** Puts the "/" menu in Telegram once per run. Best effort: a failure must never stop polling. */
  private menuRegistered = false;
  private async registerMenu(): Promise<void> {
    if (this.menuRegistered) return;
    const client = this.getClient();
    if (!client) return;
    this.menuRegistered = true;
    await client
      .setMyCommands([
        { command: 'status', description: 'OnQ status and pending approvals' },
        { command: 'calendar', description: 'Your next meetings' },
        { command: 'inbox', description: 'Email that needs you' },
        { command: 'task', description: 'Stage a task (waits for your approval)' },
        { command: 'approve', description: 'Approve the waiting item' },
        { command: 'reject', description: 'Reject the waiting item' },
        { command: 'pause', description: 'Kill switch: pause everything' },
        { command: 'resume', description: 'Resume after a pause' },
        { command: 'myid', description: 'Show this chat ID for pairing' },
        { command: 'help', description: 'All commands' },
      ])
      .catch((err: unknown) => this.deps.onLog?.(`Telegram menu not set: ${err instanceof Error ? err.message : 'error'}`));
  }

  startPolling(intervalMs = 5000): void {
    this.stopPolling();
    if (!this.getClient()) return;
    this.active = true;
    void this.registerMenu();
    void this.pollOnce();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, Math.max(2500, intervalMs));
    this.timer.unref?.();
  }

  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.active = false;
  }
}
