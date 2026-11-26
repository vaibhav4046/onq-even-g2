import { useState } from 'react';
import { callApi, smallBtnClass } from './api';

interface TelegramChat {
  chatId: string;
  title: string;
  username?: string;
  type: string;
  lastText?: string;
}

/** Finds chats the saved bot has seen, with one-click owner and watch picks. */
export function TelegramScan({
  sessionToken,
  tokenSaved,
  onChanged,
}: {
  sessionToken: string | null;
  tokenSaved: boolean;
  onChanged: (message: string) => void;
}) {
  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [watched, setWatched] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const scan = async () => {
    setBusy(true);
    setNote('');
    const [chatOut, watchOut] = await Promise.all([
      callApi<{ chats: TelegramChat[] }>('/api/telegram/scan-chats', sessionToken),
      callApi<{ watchedChats: string[] }>('/api/telegram/watch', sessionToken),
    ]);
    setBusy(false);
    if (watchOut.ok) setWatched((watchOut.data.watchedChats ?? []).map(String));
    if (!chatOut.ok) {
      setChats(null);
      setNote(`Chat scan: ${chatOut.error}`);
      return;
    }
    const list = (chatOut.data.chats ?? []).map((c) => ({ ...c, chatId: String(c.chatId) }));
    setChats(list);
    if (list.length === 0) setNote('No chats yet. Send any message to your bot, then scan again.');
  };

  const setOwner = async (chat: TelegramChat) => {
    setBusy(true);
    const out = await callApi('/api/telegram/set-owner', sessionToken, 'POST', { chatId: chat.chatId });
    setBusy(false);
    if (!out.ok) {
      setNote(`Could not set owner: ${out.error}`);
      return;
    }
    setOwnerId(chat.chatId);
    onChanged(`${chat.title || chat.username || chat.chatId} is now the owner chat.`);
  };

  const toggleWatch = async (chat: TelegramChat) => {
    const next = watched.includes(chat.chatId)
      ? watched.filter((id) => id !== chat.chatId)
      : [...watched, chat.chatId];
    setBusy(true);
    const out = await callApi<{ watchedChats: string[] }>('/api/telegram/watch', sessionToken, 'POST', { chatIds: next });
    setBusy(false);
    if (!out.ok) {
      setNote(`Could not update watched chats: ${out.error}`);
      return;
    }
    setWatched((out.data.watchedChats ?? next).map(String));
  };

  if (!tokenSaved) {
    return (
      <p className="text-[11px] text-[var(--lightgray)]">
        Save your bot token first. Then you can scan chats here instead of copying IDs.
      </p>
    );
  }

  return (
    <div className="space-y-2 min-w-0">
      <button type="button" disabled={busy} onClick={() => void scan()} className={smallBtnClass}>
        {busy && !chats ? 'Scanning...' : 'Scan chats'}
      </button>
      {chats && chats.length > 0 && (
        <ul className="space-y-1.5">
          {chats.map((c) => {
            const isWatched = watched.includes(c.chatId);
            return (
              <li
                key={c.chatId}
                className="border border-[var(--hairline)] bg-black/50 px-3 py-2 flex flex-wrap items-center gap-2 min-w-0"
              >
                <div className="flex-1 basis-48 min-w-0">
                  <div className="text-[var(--bright)] truncate">
                    {c.title || c.username || c.chatId}
                    <span className="text-[10px] text-[var(--lightgray)]">
                      {' '}
                      · {c.type}
                      {c.username ? ` · @${c.username}` : ''}
                    </span>
                  </div>
                  {c.lastText && <div className="text-[10.5px] text-[var(--lightgray)] truncate">{c.lastText}</div>}
                </div>
                <button
                  type="button"
                  disabled={busy || ownerId === c.chatId}
                  onClick={() => void setOwner(c)}
                  className={smallBtnClass}
                >
                  {ownerId === c.chatId ? 'Owner' : 'Set as owner'}
                </button>
                <button
                  type="button"
                  aria-pressed={isWatched}
                  disabled={busy}
                  onClick={() => void toggleWatch(c)}
                  className={`px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer shrink-0 disabled:opacity-50 ${
                    isWatched ? 'bg-[var(--lime)] text-[#0a0a0a]' : 'retro-btn-glass text-[var(--bright)] hover:text-[var(--lime)]'
                  }`}
                >
                  {isWatched ? 'Watching' : 'Watch'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {note && <p className="text-[11px] text-[var(--lightgray)]">{note}</p>}
      <p className="text-[10.5px] text-[var(--lightgray)]">
        Not listed? Send <code className="text-[var(--bright)]">/myid</code> to your bot and paste the number in Chat ID.
      </p>
    </div>
  );
}
