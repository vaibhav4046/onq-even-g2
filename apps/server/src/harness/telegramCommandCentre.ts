import { TelegramConflictError, TelegramWorkspaceClient } from '../providers/telegramProvider.js';
import type { TelegramUpdateEnvelope } from '../providers/telegramProvider.js';
import type { OsApprovalItem, UnifiedOsHarness } from './unifiedOsHarness.js';

const CONFLICT_BACKOFF_MS = 5 * 60_000;

export interface TelegramCommandCentreDeps {
  osHarness: UnifiedOsHarness;
  getCredentials: () => { botToken?: string; chatId?: string };
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
          await client.sendMessage(notice, cq.chatId).catch(() => null);
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

  startPolling(intervalMs = 5000): void {
    this.stopPolling();
    if (!this.getClient()) return;
    this.active = true;
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
