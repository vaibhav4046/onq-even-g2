import { useCallback, useEffect, useState } from 'react';
import type { LiveUiSurface } from '@onq/core';

export interface UnifiedOsStateDto {
  killSwitch: { paused: boolean; reason?: string; updatedAtIso: string };
  autonomyScale: Array<{ level: string; label: string; policy: string }>;
  roster: Array<{
    id: string;
    name: string;
    roleTitle: string;
    maxAutonomy: string;
    allowedTools: string[];
    summary: string;
  }>;
  skills: Array<{
    id: string;
    name: string;
    triggerCommand: string;
    specialistId: string;
    description: string;
    steps: string[];
    approvalRule: string;
  }>;
  routines: Array<{
    id: string;
    title: string;
    skillId: string;
    specialistId: string;
    scheduleLabel: string;
    paused: boolean;
    lastRunAtIso: string | null;
    lastStatus: string;
    lastSummary: string;
  }>;
  approvals: Array<{
    id: string;
    title: string;
    destination: string;
    specialistId: string;
    summary: string;
    payloadPreview: string;
    status: string;
    executionDetail?: string;
    expiresAtIso: string;
    sourceSurface: string;
  }>;
  pendingApprovalCount: number;
  recentPipelines: Array<{
    runId: string;
    preset: string;
    goal: string;
    status: string;
    auditorVerdict: string;
    steps: Array<{
      specialistId: string;
      specialistName: string;
      status: string;
      latencyMs: number;
      evidenceSummary: string;
    }>;
  }>;
  activeMusicSession: {
    sessionId: string;
    mood: string;
    query: string;
    durationMin: number;
    catalogStatus: string;
    spotifyNote: string;
    autoPlayBlocked: boolean;
    tracks: Array<{
      trackId: string;
      title: string;
      artist: string;
      album: string;
      durationSec: number;
      previewUrl?: string;
      trackViewUrl?: string;
    }>;
  } | null;
  recentCommands: Array<{
    id: string;
    atIso: string;
    surface: string;
    command: string;
    domain: string;
    summary: string;
  }>;
  integrations: Array<{
    id: string;
    name: string;
    status: 'LIVE' | 'LOCAL_FREE' | 'SANDBOX' | 'CONNECT_TO_ENABLE';
    detail: string;
  }>;
  telegramPoller?: { active: boolean; processedCount: number; lastError: string | null };
}

interface UnifiedOsPanelProps {
  sessionToken: string | null;
  onStatusMsg: (msg: string) => void;
  onLiveUiUpdate?: (surface: LiveUiSurface) => void;
  onRefreshState?: () => void;
}

const SLASH_CHIPS = [
  '/help',
  '/status',
  '/calendar',
  '/inbox',
  '/research btc market',
  '/jobs',
  '/code',
  '/project software_delivery',
  '/music coding 45m',
  '/task Send pitch update to Telegram',
] as const;

export function UnifiedOsPanel({
  sessionToken,
  onStatusMsg,
  onLiveUiUpdate,
  onRefreshState,
}: UnifiedOsPanelProps) {
  const [osState, setOsState] = useState<UnifiedOsStateDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [cmdInput, setCmdInput] = useState('/status');
  const [cmdOutput, setCmdOutput] = useState<string | null>(null);
  const [musicMood, setMusicMood] = useState<'deep_focus' | 'coding' | 'gym' | 'commute' | 'wind_down'>('deep_focus');
  const [musicQuery, setMusicQuery] = useState('');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillSpecialist, setNewSkillSpecialist] = useState('researcher');
  const [newSkillCmd, setNewSkillCmd] = useState('/digest');

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) h.Authorization = `Bearer ${sessionToken}`;
    return h;
  }, [sessionToken]);

  const loadOsState = useCallback(async () => {
    if (!sessionToken) return;
    const res = await fetch('/api/os/state', {
      headers: { Authorization: `Bearer ${sessionToken}` },
      credentials: 'include',
    });
    if (res.ok) {
      setOsState((await res.json()) as UnifiedOsStateDto);
    }
  }, [sessionToken]);

  useEffect(() => {
    void loadOsState();
  }, [loadOsState]);

  const runKillSwitch = async (paused: boolean) => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const res = await fetch('/api/os/killswitch', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ paused, reason: paused ? 'Paused by operator in Web OS' : 'Resumed by operator' }),
      });
      const j = (await res.json()) as { state?: UnifiedOsStateDto };
      if (j.state) setOsState(j.state);
      onStatusMsg(paused ? 'Global Kill Switch engaged — all routines/pipelines paused.' : 'Unified OS resumed cleanly.');
      onRefreshState?.();
    } finally {
      setBusy(false);
    }
  };

  const runCommand = async (rawText?: string) => {
    const text = (rawText ?? cmdInput).trim();
    if (!text || !sessionToken) return;
    setBusy(true);
    try {
      const res = await fetch('/api/os/command', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ text, surface: 'web' }),
      });
      const j = (await res.json()) as {
        reply?: string;
        liveUiSurface?: LiveUiSurface;
        state?: UnifiedOsStateDto;
      };
      if (j.state) setOsState(j.state);
      if (j.reply) {
        setCmdOutput(j.reply);
        onStatusMsg(j.reply);
      }
      if (j.liveUiSurface && onLiveUiUpdate) {
        onLiveUiUpdate(j.liveUiSurface);
      }
      onRefreshState?.();
    } finally {
      setBusy(false);
    }
  };

  const runPipeline = async (preset: string) => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const res = await fetch('/api/os/pipeline/run', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ preset }),
      });
      const j = (await res.json()) as {
        run?: { auditorVerdict: string; status: string };
        surface?: LiveUiSurface;
        state?: UnifiedOsStateDto;
      };
      if (j.state) setOsState(j.state);
      if (j.surface && onLiveUiUpdate) onLiveUiUpdate(j.surface);
      if (j.run) onStatusMsg(`${j.run.status}: ${j.run.auditorVerdict}`);
      onRefreshState?.();
    } finally {
      setBusy(false);
    }
  };

  const decideApproval = async (id: string, decision: 'approve' | 'reject') => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/os/approvals/${id}/decide`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ decision, surface: 'web' }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; item?: { executionDetail?: string }; state?: UnifiedOsStateDto };
      if (j.state) setOsState(j.state);
      onStatusMsg(j.item?.executionDetail ?? j.error ?? `Approval ${decision}`);
      onRefreshState?.();
    } finally {
      setBusy(false);
    }
  };

  const runRoutineNow = async (routineId: string) => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const res = await fetch('/api/os/routines/run', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ routineId }),
      });
      const j = (await res.json()) as { detail?: string; state?: UnifiedOsStateDto };
      if (j.state) setOsState(j.state);
      if (j.detail) onStatusMsg(j.detail);
      onRefreshState?.();
    } finally {
      setBusy(false);
    }
  };

  const toggleRoutine = async (routineId: string, paused: boolean) => {
    if (!sessionToken) return;
    const res = await fetch('/api/os/routines/toggle', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({ routineId, paused }),
    });
    const j = (await res.json()) as { state?: UnifiedOsStateDto };
    if (j.state) setOsState(j.state);
  };

  const createSkill = async () => {
    if (!sessionToken || !newSkillName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/os/skills/create', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          name: newSkillName.trim(),
          triggerCommand: newSkillCmd.trim(),
          specialistId: newSkillSpecialist,
        }),
      });
      const j = (await res.json()) as { skill?: { name: string }; state?: UnifiedOsStateDto };
      if (j.state) setOsState(j.state);
      if (j.skill) onStatusMsg(`Saved reusable Grok-Bot skill "${j.skill.name}".`);
      setNewSkillName('');
    } finally {
      setBusy(false);
    }
  };

  const curateMusic = async () => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const res = await fetch('/api/os/music/curate', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ mood: musicMood, query: musicQuery.trim() || undefined, durationMin: 45 }),
      });
      const j = (await res.json()) as {
        surface?: LiveUiSurface;
        session?: UnifiedOsStateDto['activeMusicSession'];
        state?: UnifiedOsStateDto;
      };
      if (j.state) setOsState(j.state);
      if (j.surface && onLiveUiUpdate) onLiveUiUpdate(j.surface);
      if (j.session) {
        onStatusMsg(
          `Curated ${j.session.tracks.length} real tracks (${j.session.catalogStatus}) + pushed Focus HUD to G2.`,
        );
      }
      onRefreshState?.();
    } finally {
      setBusy(false);
    }
  };

  if (!osState) {
    return (
      <div className="border border-white/10 bg-black/50 p-4 text-xs text-[var(--lightgray)]">
        Initializing Unified Personal OS Supervisor...
      </div>
    );
  }

  const pendingApprovals = osState.approvals.filter((a) => a.status === 'PENDING');
  const paused = osState.killSwitch.paused;

  return (
    <div className="space-y-4 text-xs">
      {/* Top Supervisor Safety & Kill-Switch Header */}
      <div className="border border-[#34F57E]/30 bg-black/60 p-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-pixel text-[10px] uppercase tracking-[0.14em] text-[var(--g2-phosphor)]">
              UNIFIED PERSONAL OS · SINGLE SUPERVISOR HARNESS
            </span>
            <span
              className={`px-2 py-0.5 font-pixel text-[9px] rounded ${
                paused ? 'bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/50' : 'bg-[#34F57E]/15 text-[#86FFAF] border border-[#34F57E]/40'
              }`}
            >
              {paused ? 'KILL SWITCH PAUSED' : 'OS ACTIVE (L0-L5)'}
            </span>
            {osState.telegramPoller?.active && (
              <span className="px-2 py-0.5 font-pixel text-[9px] rounded bg-[#34F57E]/10 text-[#86FFAF] border border-[#34F57E]/30">
                TG LIVE POLLING
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--lightgray)]">
            Shared brain across Web Companion, Even G2 Glasses (Card 4), and live Telegram Bot — free AI cascade + single-use L2 approval inbox.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runKillSwitch(!paused)}
            className={`px-3.5 py-2 font-pixel text-[9px] uppercase cursor-pointer border ${
              paused
                ? 'bg-[#34F57E] text-[#041209] border-[#34F57E]'
                : 'bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/60 hover:bg-[var(--danger)] hover:text-[#041209]'
            }`}
          >
            {paused ? 'Resume All OS Loops' : 'Global Kill Switch (Pause All)'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadOsState()}
            className="retro-btn-glass px-3 py-2 text-[11px] text-[var(--bright)] cursor-pointer"
          >
            Refresh OS
          </button>
        </div>
      </div>

      {/* Autonomy Scale L0-L5 + Honest Live Integration Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-6 border border-white/10 bg-black/50 p-3 space-y-2">
          <div className="font-pixel text-[9px] uppercase tracking-wider text-[var(--g2-phosphor)]">
            AUTONOMY SCALE (L0 - L5 HARD GATES)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {osState.autonomyScale.map((lvl) => (
              <div key={lvl.level} className="border border-white/10 bg-[#041209] px-2.5 py-1.5">
                <div className="font-semibold text-[var(--bright)]">{lvl.label}</div>
                <div className="text-[10px] text-[var(--lightgray)] leading-snug">{lvl.policy}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 border border-white/10 bg-black/50 p-3 space-y-2">
          <div className="font-pixel text-[9px] uppercase tracking-wider text-[#86FFAF]">
            REAL INTEGRATION STATUS (HONEST LIVE VS CONNECT TO ENABLE)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {osState.integrations.map((intg) => (
              <div key={intg.id} className="border border-white/10 bg-black/40 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-[var(--bright)] truncate">{intg.name}</span>
                  <span
                    className={`font-pixel text-[8px] px-1.5 py-0.5 rounded shrink-0 ${
                      intg.status === 'LIVE'
                        ? 'bg-[#34F57E]/20 text-[#86FFAF]'
                        : intg.status === 'LOCAL_FREE'
                          ? 'bg-white/10 text-[var(--bright)]'
                          : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {intg.status === 'CONNECT_TO_ENABLE' ? 'CONNECT' : intg.status}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--lightgray)] truncate">{intg.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Unified L2 Approval Inbox + Telegram / Slash Command Centre */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-6 border border-[#34F57E]/30 bg-black/55 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[9px] uppercase tracking-wider text-[var(--g2-phosphor)]">
              UNIFIED L2 APPROVAL INBOX ({pendingApprovals.length} PENDING)
            </span>
            <span className="text-[10px] text-[var(--lightgray)]">Web · G2 · Telegram synced</span>
          </div>

          {osState.approvals.length === 0 ? (
            <div className="border border-dashed border-white/15 p-3 text-[11px] text-[var(--lightgray)]">
              Zero queued L2 approvals. Try <code className="text-[#86FFAF]">/task Send brief</code> or run Inbox Triage.
            </div>
          ) : (
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {osState.approvals.slice(0, 6).map((apr) => (
                <div key={apr.id} className="border border-white/15 bg-[#041209] p-2.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--bright)] truncate">
                        {apr.title} <span className="text-[10px] text-[#86FFAF]">({apr.id})</span>
                      </div>
                      <div className="text-[10px] text-[var(--lightgray)]">
                        To: {apr.destination} · Agent: {apr.specialistId} · Via: {apr.sourceSurface} · Status: {apr.status}
                      </div>
                    </div>
                    {apr.status === 'PENDING' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void decideApproval(apr.id, 'approve')}
                          className="px-2 py-1 bg-[#34F57E] text-[#041209] font-pixel text-[8px] uppercase cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void decideApproval(apr.id, 'reject')}
                          className="px-2 py-1 border border-[var(--danger)]/50 text-[var(--danger)] font-pixel text-[8px] uppercase cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-[10.5px] text-[var(--lightgray)]">{apr.executionDetail ?? apr.payloadPreview}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 border border-white/10 bg-black/55 p-3 space-y-2.5">
          <div className="font-pixel text-[9px] uppercase tracking-wider text-[var(--g2-phosphor)]">
            TELEGRAM &amp; OS SLASH COMMAND CONSOLE
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runCommand();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              aria-label="OS or Telegram slash command"
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              placeholder="/help, /status, /music gym 30m, /project ..."
              className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-3 py-1.5 text-[var(--bright)]"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-3 py-1.5 bg-[var(--lime)] text-[#041209] font-semibold cursor-pointer"
            >
              Run Cmd
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {SLASH_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy}
                onClick={() => {
                  setCmdInput(c);
                  void runCommand(c);
                }}
                className="px-2 py-0.5 border border-[#34F57E]/25 bg-[#04140b] text-[10px] text-[#86FFAF] hover:bg-[#34F57E] hover:text-[#041209] cursor-pointer"
              >
                {c}
              </button>
            ))}
          </div>

          {cmdOutput && (
            <pre className="whitespace-pre-wrap border border-dashed border-[#34F57E]/30 bg-[#041209] p-2 text-[10.5px] text-[var(--bright)] max-h-28 overflow-auto">
              {cmdOutput}
            </pre>
          )}
        </div>
      </div>

      {/* Row 3: 10 Specialist Roster & L4 Parallel Pipelines */}
      <div className="border border-white/10 bg-black/55 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-pixel text-[9px] uppercase tracking-wider text-[var(--g2-phosphor)]">
            10 SPECIALIST AGENTS &amp; L4 PARALLEL CREWS
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['morning_os', 'Morning OS Crew'],
                ['software_delivery', 'Software Delivery Crew'],
                ['market_research', 'Market Research Crew'],
                ['career_pack', 'Career Pack Crew'],
                ['music_focus_flow', 'Focus + Music Crew'],
              ] as const
            ).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                disabled={busy}
                onClick={() => void runPipeline(preset)}
                className="px-2.5 py-1 border border-[#34F57E]/35 bg-[#04140b] text-[10px] text-[#86FFAF] hover:bg-[#34F57E] hover:text-[#041209] cursor-pointer"
              >
                Run {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {osState.roster.map((agent) => (
            <div key={agent.id} className="border border-white/10 bg-[#041209] p-2 space-y-0.5">
              <div className="font-semibold text-[var(--bright)] truncate">{agent.name}</div>
              <div className="text-[9.5px] text-[#86FFAF] truncate">{agent.roleTitle}</div>
              <div className="text-[9px] text-[var(--lightgray)]">{agent.maxAutonomy}</div>
            </div>
          ))}
        </div>

        {osState.recentPipelines[0] && (
          <div className="border border-[#34F57E]/30 bg-black/60 p-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[#86FFAF]">
                Latest L4 Run: {osState.recentPipelines[0].preset} ({osState.recentPipelines[0].status})
              </span>
              <span className="text-[10px] text-[var(--lightgray)]">
                {osState.recentPipelines[0].auditorVerdict}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {osState.recentPipelines[0].steps.map((st, idx) => (
                <div key={idx} className="border border-white/10 bg-[#041209] px-2 py-1 text-[10px]">
                  <div className="font-semibold text-[var(--bright)]">
                    {st.specialistName} · {st.status} ({st.latencyMs}ms)
                  </div>
                  <div className="text-[var(--lightgray)] truncate">{st.evidenceSummary}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Row 4: Reusable Grok-Bot Skills/Routines + Real Free Music Curator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-6 border border-white/10 bg-black/55 p-3 space-y-2.5">
          <div className="font-pixel text-[9px] uppercase tracking-wider text-[var(--g2-phosphor)]">
            GROK-BOT SKILLS &amp; 24/7 ROUTINES ({osState.routines.length})
          </div>
          <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1">
            {osState.routines.map((rtn) => (
              <div key={rtn.id} className="border border-white/10 bg-[#041209] p-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--bright)] truncate">
                    {rtn.title} <span className="text-[9.5px] text-[#86FFAF]">({rtn.scheduleLabel})</span>
                  </div>
                  <div className="text-[10px] text-[var(--lightgray)] truncate">
                    {rtn.lastStatus} · {rtn.lastSummary}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runRoutineNow(rtn.id)}
                    className="px-2 py-1 bg-[#34F57E]/20 border border-[#34F57E]/40 text-[#86FFAF] text-[9.5px] cursor-pointer"
                  >
                    Run
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleRoutine(rtn.id, !rtn.paused)}
                    className="px-2 py-1 border border-white/20 text-[var(--lightgray)] text-[9.5px] cursor-pointer"
                  >
                    {rtn.paused ? 'Resume' : 'Pause'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-dashed border-white/10">
            <input
              type="text"
              placeholder="New Grok-Bot skill name..."
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              className="flex-1 min-w-[140px] bg-[var(--ink)] border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--bright)]"
            />
            <input
              type="text"
              placeholder="/cmd"
              value={newSkillCmd}
              onChange={(e) => setNewSkillCmd(e.target.value)}
              className="w-24 bg-[var(--ink)] border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--bright)]"
            />
            <select
              aria-label="Specialist owner for new skill"
              value={newSkillSpecialist}
              onChange={(e) => setNewSkillSpecialist(e.target.value)}
              className="bg-[var(--ink)] border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--bright)]"
            >
              {osState.roster.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void createSkill()}
              className="px-2.5 py-1 bg-[#34F57E] text-[#041209] font-semibold text-[10.5px] cursor-pointer"
            >
              Add Skill
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 border border-white/10 bg-black/55 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-pixel text-[9px] uppercase tracking-wider text-[var(--g2-phosphor)]">
              MUSIC CURATOR &amp; FOCUS BLOCK (FREE LIVE ITUNES + NO AUTO-PLAY)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <select
              aria-label="Music focus mood"
              value={musicMood}
              onChange={(e) => setMusicMood(e.target.value as typeof musicMood)}
              className="bg-[var(--ink)] border border-[var(--hairline)] px-2 py-1.5 text-[11px] text-[var(--bright)]"
            >
              <option value="deep_focus">Deep Focus (45m)</option>
              <option value="coding">Coding Flow</option>
              <option value="gym">Gym / Workout</option>
              <option value="commute">Commute Chill</option>
              <option value="wind_down">Wind Down</option>
            </select>
            <input
              type="text"
              aria-label="Custom artist or vibe"
              placeholder="Optional artist or vibe (e.g. synthwave, Hans Zimmer)"
              value={musicQuery}
              onChange={(e) => setMusicQuery(e.target.value)}
              className="flex-1 min-w-[140px] bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--bright)]"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void curateMusic()}
              className="px-3 py-1.5 bg-[var(--lime)] text-[#041209] font-semibold text-[11px] cursor-pointer"
            >
              Curate + Push G2
            </button>
          </div>

          {osState.activeMusicSession ? (
            <div className="space-y-1.5">
              <div className="text-[10px] text-[#86FFAF]">
                {osState.activeMusicSession.catalogStatus} · {osState.activeMusicSession.spotifyNote}
              </div>
              <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
                {osState.activeMusicSession.tracks.map((trk) => (
                  <div key={trk.trackId} className="border border-white/10 bg-[#041209] px-2.5 py-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--bright)] truncate">
                        {trk.title} — {trk.artist}
                      </div>
                      <div className="text-[9.5px] text-[var(--lightgray)] truncate">
                        {trk.album} · {Math.floor(trk.durationSec / 60)}m {trk.durationSec % 60}s
                      </div>
                    </div>
                    {trk.previewUrl && (
                      <button
                        type="button"
                        onClick={() => setPlayingTrackId(playingTrackId === trk.trackId ? null : trk.trackId)}
                        className="px-2 py-0.5 border border-[#34F57E]/40 text-[#86FFAF] text-[9.5px] cursor-pointer shrink-0"
                      >
                        {playingTrackId === trk.trackId ? 'Hide Audio' : 'Confirm & Preview'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {playingTrackId && (
                <audio
                  controls
                  src={osState.activeMusicSession.tracks.find((t) => t.trackId === playingTrackId)?.previewUrl}
                  className="w-full h-8"
                />
              )}
            </div>
          ) : (
            <div className="border border-dashed border-white/15 p-3 text-[11px] text-[var(--lightgray)]">
              Click <strong>Curate + Push G2</strong> to fetch live iTunes tracks and stream a 45m Focus timer straight to your Even G2 simulator lens.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
