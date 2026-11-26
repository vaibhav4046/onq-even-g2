import { useState, type ReactNode } from 'react';
import { callApi, labelClass, smallBtnClass } from './api';
import {
  MODE_LABEL,
  SOURCE_IDS,
  SOURCE_NAME,
  ageLabel,
  routeLabel,
  sourceWarnings,
  sourcesFromProfile,
  speedLabel,
  type Effective,
  type HostView,
  type SourceId,
  type SourceMode,
  type SourceRow,
} from './hostModel';
import type { Loaded } from './useHostData';

export interface ApiSetupSlot {
  node: ReactNode;
  /** Controlled open state for the "API key setup" details (so other buttons can open it). */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}

const API_BLURB: Record<SourceId, string> = {
  calendar: 'Fastest. Needs a Google sign-in.',
  gmail: 'Fastest. Needs the same Google sign-in as Calendar.',
  notion: 'Fastest. Needs a Notion token.',
  telegram: 'Fastest. Needs a bot token from BotFather.',
};

const CHIP_CLASS: Record<Effective, string> = {
  api: 'border-[var(--g2-phosphor)]/60 text-[var(--g2-phosphor)] bg-[var(--g2-phosphor)]/10',
  browser: 'border-[var(--lime)]/60 text-[var(--lime)] bg-[var(--lime)]/10',
  sample: 'border-white/25 text-[var(--bright)] bg-white/10',
  off: 'border-white/15 text-[var(--lightgray)] bg-white/5',
};

const MODES: SourceMode[] = ['auto', 'computer', 'api'];

function placeholder(id: SourceId): SourceRow {
  return { id, mode: null, effective: 'off', reason: 'The computer has not reported this source yet.', p50Ms: null, lastSyncAt: null, stale: false, staleReason: '', breakerOpen: false };
}

function ModeControl({ row, disabled, onPick }: { row: SourceRow; disabled: boolean; onPick: (m: SourceMode) => void }) {
  return (
    <div role="radiogroup" aria-label={`Where ${SOURCE_NAME[row.id]} gets its data`} className="inline-flex border border-[var(--hairline)]">
      {MODES.map((m) => {
        const on = row.mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onPick(m)}
            className={`px-3 py-1.5 text-[11px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 border-b-2 ${
              on ? 'border-[var(--lime)] bg-[var(--lime)]/10 text-[var(--lime)] font-semibold' : 'border-transparent text-[var(--lightgray)] hover:text-[var(--bright)]'
            }`}
          >
            {MODE_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}

function SourceCard({
  row,
  controlsLive,
  measured,
  slot,
  busy,
  note,
  onMode,
  onSync,
}: {
  row: SourceRow;
  controlsLive: boolean;
  measured: boolean;
  slot: ApiSetupSlot | undefined;
  busy: boolean;
  note: string;
  onMode: (m: SourceMode) => void;
  onSync: () => void;
}) {
  const warnings = sourceWarnings(row);
  const name = SOURCE_NAME[row.id];
  return (
    <li id={`source-card-${row.id}`} className="retro-glass-card p-4 space-y-3 min-w-0 list-none">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-display text-lg font-bold text-[var(--bright)] leading-tight">{name}</h4>
        <span className={`font-pixel text-[9px] uppercase tracking-[0.14em] px-2.5 py-0.5 rounded-full border whitespace-nowrap ${CHIP_CLASS[row.effective]}`}>
          Now: {routeLabel(row.effective)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ModeControl row={row} disabled={!controlsLive || busy} onPick={onMode} />
          <button type="button" disabled={!controlsLive || busy} onClick={onSync} className={smallBtnClass}>
            Sync now
          </button>
        </div>
      </div>

      <p className="text-[11px] text-[var(--lightgray)]">
        Speed: {speedLabel(row.p50Ms)} · Last sync: {ageLabel(row.lastSyncAt, Date.now(), measured ? 'never' : 'not reported')}
      </p>
      {row.reason && <p className="text-[11px] text-[var(--bright)]/80 break-words">{row.reason}</p>}
      {warnings.map((w) => (
        <p key={w} className="text-[11px] text-[var(--warning)]" role="status">
          {w}
        </p>
      ))}
      {!controlsLive && <p className="text-[10.5px] text-[var(--lightgray)]">Switching the route is not available yet on this server.</p>}
      {note && (
        <p className="text-[11px] text-[var(--verified)]" role="status">
          {note}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="border border-[var(--hairline)] bg-black/40 p-3 space-y-2">
          <span className={labelClass}>Use this computer</span>
          <p className="text-[11px] text-[var(--lightgray)] leading-relaxed">
            No keys. OnQ uses the Chrome you are signed in to on this computer. Slower. It asks you to approve risky steps.
          </p>
          <button type="button" disabled={!controlsLive || busy || row.mode === 'computer'} onClick={() => onMode('computer')} className={smallBtnClass}>
            {row.mode === 'computer' ? 'Selected' : 'Use this computer'}
          </button>
        </div>
        <div className="border border-[var(--hairline)] bg-black/40 p-3 space-y-2 min-w-0">
          <span className={labelClass}>Use API key</span>
          <p className="text-[11px] text-[var(--lightgray)] leading-relaxed">{API_BLURB[row.id]}</p>
          <button type="button" disabled={!controlsLive || busy || row.mode === 'api'} onClick={() => onMode('api')} className={smallBtnClass}>
            {row.mode === 'api' ? 'Selected' : 'Use API'}
          </button>
          {slot && (
            <details
              open={slot.open}
              onToggle={slot.onToggle ? (e) => slot.onToggle?.((e.currentTarget as HTMLDetailsElement).open) : undefined}
              className="border-t border-dashed border-white/10 pt-2"
            >
              <summary className="cursor-pointer text-[11px] text-[var(--bright)]">API key setup</summary>
              <div className="mt-2 space-y-3 text-xs min-w-0">{slot.node}</div>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}

/** The sync endpoint answers 202 started, 202 already_running, or 200 off with a reason. Say exactly that. */
function syncNote(d: { status?: string; reason?: string | null }): string {
  if (d.status === 'started') return 'Sync started.';
  if (d.status === 'already_running') return 'Already syncing.';
  if (d.status === 'off') return `Nothing to sync: ${d.reason ?? 'this source is off.'}`;
  return d.status ? `Sync: ${d.status}.` : 'Sync requested.';
}

interface SourceCardsProps {
  sources: Loaded<SourceRow[]>;
  profile: Loaded<HostView | null>;
  apiSetup: Partial<Record<SourceId, ApiSetupSlot>>;
  sessionToken: string | null;
  onChanged: () => void;
}

/** Calendar, Mail, Notion, Telegram: how each is reached (Auto, This computer, API), what is really in use, and set-up for both paths. */
export function SourceCards({ sources, profile, apiSetup, sessionToken, onChanged }: SourceCardsProps) {
  const [busyId, setBusyId] = useState<SourceId | null>(null);
  const [notes, setNotes] = useState<Partial<Record<SourceId, string>>>({});
  const measured = sources.available && sources.data.length > 0;
  const base = measured ? sources.data : sourcesFromProfile(profile.data);
  const rows = SOURCE_IDS.map((id) => base.find((r) => r.id === id) ?? placeholder(id));

  const act = async (id: SourceId, path: 'mode' | 'sync', body: unknown, okNote: string) => {
    setBusyId(id);
    const out = await callApi<{ status?: string; reason?: string | null }>(`/api/sources/${id}/${path}`, sessionToken, 'POST', body ?? {});
    setBusyId(null);
    setNotes((prev) => ({ ...prev, [id]: out.ok ? (path === 'sync' ? syncNote(out.data) : okNote) : `${path === 'mode' ? 'Route' : 'Sync'}: ${out.error}` }));
    if (out.ok) onChanged();
  };

  return (
    <section aria-labelledby="sources-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="sources-heading" className="font-pixel text-[11px] uppercase tracking-[0.2em] text-[var(--g2-phosphor)]">
          Your sources
        </h3>
        <p className="text-[11px] text-[var(--lightgray)]">
          {measured ? 'Route and speed come from this computer.' : 'Route comes from the host profile. Nothing is measured yet.'}
        </p>
      </div>
      <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3 p-0 m-0">
        {rows.map((row) => (
          <SourceCard
            key={row.id}
            row={row}
            controlsLive={sources.available}
            measured={measured}
            slot={apiSetup[row.id]}
            busy={busyId === row.id}
            note={notes[row.id] ?? ''}
            onMode={(m) => void act(row.id, 'mode', { mode: m }, `${SOURCE_NAME[row.id]} now uses: ${MODE_LABEL[m]}.`)}
            onSync={() => void act(row.id, 'sync', {}, `${SOURCE_NAME[row.id]} sync started.`)}
          />
        ))}
      </ul>
    </section>
  );
}
