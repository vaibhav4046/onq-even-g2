import { useCallback, useEffect, useState } from 'react';

type BrowserRunStatus = 'RUNNING' | 'AWAITING_APPROVAL' | 'DONE' | 'STOPPED' | 'FAILED';

interface BrowserRun {
  id: string;
  goal: string;
  source: string;
  status: BrowserRunStatus;
  startedAtIso: string;
  finishedAtIso?: string;
  steps: Array<{ n: number; action: string; reason: string; outcome: string }>;
  answer?: string;
  providerLabel?: string;
  approvalId?: string;
  lensLines: string[];
}

interface BrowserAgentCardProps {
  sessionToken: string | null;
  onStatusMsg: (msg: string) => void;
  /** The panel's existing approval decide helper. */
  onDecideApproval: (id: string, decision: 'approve' | 'reject') => Promise<void>;
}

const POLL_MS = 1500;

const EXAMPLES = [
  'Find the cheapest flight to Dubai this Friday',
  'Summarise the top 3 Hacker News posts',
  "Check my Notion page for today's tasks",
] as const;

const STATUS_LABEL: Record<BrowserRunStatus, string> = {
  RUNNING: 'Working',
  AWAITING_APPROVAL: 'Needs your yes',
  DONE: 'Done',
  STOPPED: 'Stopped',
  FAILED: 'Failed',
};

const isActive = (r: BrowserRun) => r.status === 'RUNNING' || r.status === 'AWAITING_APPROVAL';

function StatusBadge({ status }: { status: BrowserRunStatus }) {
  const tone =
    status === 'FAILED'
      ? 'border-[var(--danger)]/50 text-[var(--danger)]'
      : status === 'AWAITING_APPROVAL'
        ? 'border-[#34F57E] bg-[#34F57E]/15 text-[#86FFAF]'
        : 'border-[#34F57E]/35 text-[#86FFAF]';
  return <span className={`px-2 py-0.5 border font-pixel text-[8.5px] uppercase ${tone}`}>{STATUS_LABEL[status]}</span>;
}

function RunSteps({ run }: { run: BrowserRun }) {
  return (
    <>
      {run.steps.length > 0 && (
        <ol className="space-y-1 max-h-[180px] overflow-y-auto pr-1">
          {run.steps.map((s) => (
            <li key={s.n} className="text-[10.5px] leading-snug">
              <span className="text-[#86FFAF]">{s.n}.</span>{' '}
              <span className="text-[var(--bright)]">{s.action}</span>
              {s.outcome && <span className="text-[var(--lightgray)]"> : {s.outcome}</span>}
            </li>
          ))}
        </ol>
      )}
      {run.answer && (
        <div className="border border-[#34F57E]/30 bg-[#041209] p-2 text-[11px] text-[var(--bright)] whitespace-pre-wrap">
          {run.answer}
        </div>
      )}
    </>
  );
}

export function BrowserAgentCard({ sessionToken, onStatusMsg, onDecideApproval }: BrowserAgentCardProps) {
  const [runs, setRuns] = useState<BrowserRun[]>([]);
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRuns = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await fetch('/api/browser/runs', {
        headers: { Authorization: `Bearer ${sessionToken}` },
        credentials: 'include',
      });
      if (res.ok) setRuns(((await res.json()) as { runs?: BrowserRun[] }).runs ?? []);
    } catch {
      // Network blip: keep the last known runs, next poll retries.
    }
  }, [sessionToken]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const sorted = runs.toSorted((a, b) => b.startedAtIso.localeCompare(a.startedAtIso));
  const current = sorted[0];
  const anyActive = runs.some(isActive);

  useEffect(() => {
    if (!anyActive) return;
    const t = window.setInterval(() => void loadRuns(), POLL_MS);
    return () => window.clearInterval(t);
  }, [anyActive, loadRuns]);

  const post = async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  };

  const startRun = async (text?: string) => {
    const g = (text ?? goal).trim();
    if (!g || !sessionToken) return;
    setBusy(true);
    try {
      const j = await post('/api/browser/run', { goal: g });
      if (j.ok === false) onStatusMsg(j.error ?? 'Could not start the browser agent.');
      else {
        setGoal('');
        onStatusMsg('Browser agent started in your Chrome.');
      }
      await loadRuns();
    } catch {
      onStatusMsg('Could not reach the browser agent.');
    } finally {
      setBusy(false);
    }
  };

  const stopRun = async (id: string) => {
    setBusy(true);
    try {
      const j = await post(`/api/browser/runs/${encodeURIComponent(id)}/stop`);
      onStatusMsg(j.ok === false ? j.error ?? 'Could not stop the run.' : 'Browser agent stopped.');
      await loadRuns();
    } catch {
      onStatusMsg('Could not reach the browser agent.');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (approvalId: string, decision: 'approve' | 'reject') => {
    setBusy(true);
    try {
      await onDecideApproval(approvalId, decision);
      await loadRuns();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-[#34F57E]/30 bg-black/55 p-3 space-y-2.5">
      <div className="space-y-0.5">
        <div className="font-pixel text-[9px] uppercase tracking-wider text-[var(--g2-phosphor)]">
          Browser agent (your own Chrome)
        </div>
        <p className="text-[10.5px] text-[var(--lightgray)]">
          Works on this PC with your logins. Asks before it buys, sends or submits.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void startRun();
        }}
      >
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Tell OnQ what to do in Chrome"
          aria-label="Browser agent goal"
          className="flex-1 min-w-0 bg-[var(--ink)] border border-[var(--hairline)] px-3 py-1.5 text-[var(--bright)]"
        />
        <button
          type="submit"
          disabled={busy || !goal.trim() || anyActive}
          className="px-3 py-1.5 bg-[var(--lime)] text-[#041209] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Run
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={busy || anyActive}
            onClick={() => setGoal(ex)}
            className="px-2 py-0.5 border border-[#34F57E]/25 bg-[#04140b] text-[10px] text-[#86FFAF] hover:bg-[#34F57E] hover:text-[#041209] cursor-pointer disabled:opacity-40"
          >
            {ex}
          </button>
        ))}
      </div>

      {current && (
        <div className="border border-white/15 bg-[#041209] p-2.5 space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <StatusBadge status={current.status} />
              <span className="font-semibold text-[var(--bright)] truncate">{current.goal}</span>
            </div>
            {isActive(current) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void stopRun(current.id)}
                className="px-2 py-1 border border-[var(--danger)]/50 text-[var(--danger)] font-pixel text-[8px] uppercase cursor-pointer disabled:opacity-40"
              >
                Stop
              </button>
            )}
          </div>
          {current.providerLabel && (
            <div className="text-[10px] text-[var(--lightgray)]">Model: {current.providerLabel}</div>
          )}

          {current.status === 'AWAITING_APPROVAL' && current.approvalId && (
            <div className="flex flex-wrap items-center justify-between gap-2 border border-[#34F57E]/50 bg-[#34F57E]/10 px-2 py-1.5">
              <span className="text-[11px] text-[#86FFAF]">Needs your yes before the next step.</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide(current.approvalId!, 'approve')}
                  className="px-2 py-1 bg-[#34F57E] text-[#041209] font-pixel text-[8px] uppercase cursor-pointer disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide(current.approvalId!, 'reject')}
                  className="px-2 py-1 border border-[var(--danger)]/50 text-[var(--danger)] font-pixel text-[8px] uppercase cursor-pointer disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          <RunSteps run={current} />
        </div>
      )}

      {sorted.length > 1 && (
        <div className="space-y-1">
          {sorted.slice(1, 4).map((r) => (
            <details key={r.id} className="border border-white/10 bg-black/40 px-2 py-1">
              <summary className="cursor-pointer list-none flex items-center gap-2 text-[10.5px]">
                <StatusBadge status={r.status} />
                <span className="text-[var(--bright)] truncate">{r.goal}</span>
              </summary>
              <div className="pt-1.5 space-y-1.5">
                <RunSteps run={r} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
