import { useState } from 'react';
import { callApi, labelClass, smallBtnClass } from './api';
import type { OutboxRow } from './hostModel';
import type { Loaded } from './useHostData';

const STATUS_CLASS: Record<string, string> = {
  queued: 'text-[var(--lightgray)] border-white/20',
  running: 'text-[var(--lime)] border-[var(--lime)]/50',
  failed: 'text-[var(--danger)] border-[var(--danger)]/50',
};

/** Writes waiting to go out. Only queued, running and failed rows are listed; failed ones can be retried. */
export function OutboxStrip({ outbox, sessionToken, onChanged }: { outbox: Loaded<OutboxRow[]>; sessionToken: string | null; onChanged: () => void }) {
  const [note, setNote] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  const pending = outbox.data.filter((o) => o.status === 'queued' || o.status === 'running' || o.status === 'failed');
  const finished = outbox.data.length - pending.length;

  const retry = async (id: string) => {
    setRetrying(id);
    const out = await callApi(`/api/outbox/${encodeURIComponent(id)}/retry`, sessionToken, 'POST', {});
    setRetrying(null);
    setNote(out.ok ? 'Retry queued.' : `Retry: ${out.error}`);
    onChanged();
  };

  return (
    <section aria-labelledby="outbox-heading" className="retro-glass-panel px-4 py-3 space-y-2 text-xs min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="outbox-heading" className={labelClass}>
          Outbox
        </h3>
        <span className="text-[10.5px] text-[var(--lightgray)]">
          {outbox.available ? `${pending.length} waiting${finished ? ` · ${finished} finished` : ''}` : 'Not available yet.'}
        </span>
      </div>
      {outbox.available && pending.length === 0 && <p className="text-[11px] text-[var(--lightgray)]">Nothing is waiting to be sent.</p>}
      {pending.length > 0 && (
        <ul className="space-y-1.5" aria-live="polite">
          {pending.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <span className={`font-pixel text-[9px] uppercase px-2 py-0.5 border ${STATUS_CLASS[o.status] ?? ''}`}>{o.status}</span>
              <span className="text-[var(--bright)] truncate min-w-0">{o.label}</span>
              {o.attempts > 1 && <span className="text-[10px] text-[var(--lightgray)]">attempt {o.attempts}</span>}
              {o.error && (
                <span className={`text-[10.5px] break-words min-w-0 ${o.status === 'failed' ? 'text-[var(--danger)]' : 'text-[var(--lightgray)]'}`}>{o.error}</span>
              )}
              {o.status === 'failed' && (
                <button type="button" disabled={retrying === o.id} onClick={() => void retry(o.id)} className={`${smallBtnClass} ml-auto`}>
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="text-[11px] text-[var(--verified)]" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
