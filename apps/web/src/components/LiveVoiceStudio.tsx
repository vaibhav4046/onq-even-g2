import { useCallback, useEffect, useState } from 'react';
import type { NormalizedEvenEvent, VoiceOrbState } from '@onq/core';
import { OnQVoiceOrb } from './OnQVoiceOrb';

export interface LocalToolInfoDto {
  id: string;
  name: string;
  binary: string;
  accountMode: string;
  installed: boolean;
  binaryPath: string | null;
  installHint: string;
  capabilities: string[];
}

export interface AgentTaskDto {
  id: string;
  kind: 'PLAN_PROJECT' | 'CODE_DELEGATE' | 'COMPUTER_CHECK' | 'TELEGRAM_SYNC';
  title: string;
  prompt: string;
  targetTool: string;
  toolUsed: string;
  status: 'STAGED_DEFAULT_NO' | 'RUNNING' | 'DONE' | 'FAILED';
  previewToken: string;
  steps: string[];
  outputLines: string[];
  lensLines: string[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SafeInspectDto {
  kind: 'git_status' | 'git_log' | 'gh_prs' | 'workspace_summary';
  ok: boolean;
  summary: string;
  lines: string[];
  lensLines: string[];
  latencyMs: number;
}

export interface MeetingStateDto {
  active: boolean;
  elapsedSec: number;
  speakerCount: number;
  providerMode: string;
  turns: Array<{ speakerLabel: string; attendeeName: string; text: string }>;
  decisions: Array<{ id: string; summary: string; speaker: string }>;
  actions: Array<{ id: string; title: string; owner: string }>;
}

interface LiveVoiceStudioProps {
  sessionToken: string | null;
  orbState: VoiceOrbState;
  rmsLevel: number;
  activeSpokenWord: string;
  armProgress01: number;
  voiceEngineLabel: string;
  micActive: boolean;
  meetingState: MeetingStateDto | null;
  onToggleMic: () => void;
  onRingEvent: (kind: NormalizedEvenEvent['kind']) => void;
  onRunCommand: (cmd: string) => void;
  onStartMeetingDemo?: () => void;
  onWrapUpMeeting?: () => void;
  onAskMeeting?: (question: string) => void;
  onWipeMeeting?: () => void;
}

/**
 * Unified browser-usable OnQ Studio:
 * 1) Live AssemblyAI Duplex Call + Muse/Duet/Dots Pixel Avatar + R1 Ring Controls
 * 2) Live Diarized Meeting Notetaker & Q&A
 * 3) Zero-API-Key Computer & Coding Agent Delegation Console (Default-NO)
 */
export function LiveVoiceStudio({
  sessionToken,
  orbState,
  rmsLevel,
  activeSpokenWord,
  armProgress01,
  voiceEngineLabel,
  micActive,
  meetingState,
  onToggleMic,
  onRingEvent,
  onRunCommand,
  onStartMeetingDemo,
  onWrapUpMeeting,
  onAskMeeting,
  onWipeMeeting,
}: LiveVoiceStudioProps) {
  const [studioTab, setStudioTab] = useState<'call' | 'notes' | 'computer'>('call');
  const [tools, setTools] = useState<LocalToolInfoDto[]>([]);
  const [tasks, setTasks] = useState<AgentTaskDto[]>([]);
  const [inspectRes, setInspectRes] = useState<SafeInspectDto | null>(null);
  const [taskPrompt, setTaskPrompt] = useState('Plan a 3-step launch sprint for OnQ Even G2 + Telegram');
  const [targetTool, setTargetTool] = useState<'auto' | 'claude_cli' | 'codex_cli' | 'gemini_cli' | 'ollama' | 'openrouter' | 'workspace_test'>('auto');
  const [meetingAsk, setMeetingAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [studioMsg, setStudioMsg] = useState<string | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) h.Authorization = `Bearer ${sessionToken}`;
    return h;
  }, [sessionToken]);

  const loadComputerTools = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await fetch('/api/computer/tools', {
        headers: { Authorization: `Bearer ${sessionToken}` },
        credentials: 'include',
      });
      if (res.ok) {
        const j = (await res.json()) as {
          tools: LocalToolInfoDto[];
          tasks: AgentTaskDto[];
          lastInspect?: SafeInspectDto | null;
        };
        setTools(j.tools ?? []);
        setTasks(j.tasks ?? []);
        if (j.lastInspect) setInspectRes(j.lastInspect);
      }
    } catch {
      // ignore offline
    }
  }, [sessionToken]);

  useEffect(() => {
    void loadComputerTools();
  }, [loadComputerTools]);

  const runInspect = async (kind: 'git_status' | 'git_log' | 'gh_prs' | 'workspace_summary') => {
    if (!sessionToken) return;
    setBusy(true);
    setStudioMsg(null);
    try {
      const res = await fetch('/api/computer/inspect', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ kind }),
      });
      const j = (await res.json()) as { inspect?: SafeInspectDto; error?: string };
      if (j.inspect) {
        setInspectRes(j.inspect);
        setStudioMsg(`${kind.replace('_', ' ')}: ${j.inspect.summary}`);
      } else if (j.error) {
        setStudioMsg(j.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const stageDelegatedTask = async () => {
    if (!sessionToken || !taskPrompt.trim()) return;
    setBusy(true);
    setStudioMsg(null);
    try {
      const res = await fetch('/api/agent/tasks/stage', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          kind: targetTool === 'workspace_test' ? 'COMPUTER_CHECK' : 'PLAN_PROJECT',
          title: taskPrompt.trim().slice(0, 48),
          prompt: taskPrompt.trim(),
          targetTool,
        }),
      });
      const j = (await res.json()) as { task?: AgentTaskDto; error?: string };
      if (j.task) {
        setTasks((prev) => [j.task!, ...prev]);
        setStudioMsg(`Staged "${j.task.title}" behind Default-NO confirm gate.`);
      } else if (j.error) {
        setStudioMsg(j.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const commitDelegatedTask = async (task: AgentTaskDto) => {
    if (!sessionToken) return;
    setBusy(true);
    setStudioMsg(null);
    try {
      const res = await fetch('/api/agent/tasks/commit', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ taskId: task.id, previewToken: task.previewToken }),
      });
      const j = (await res.json()) as { task?: AgentTaskDto; error?: string };
      if (j.task) {
        setTasks((prev) => prev.map((t) => (t.id === j.task!.id ? j.task! : t)));
        setStudioMsg(`Executed via ${j.task.toolUsed}: ${j.task.outputLines[0] ?? 'Done'}`);
      } else if (j.error) {
        setStudioMsg(j.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="retro-glass-well p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-pixel text-[10px] uppercase tracking-[0.18em] text-[var(--g2-phosphor)]">
            GLASSES + COMPUTER STUDIO
          </span>
          <span className="font-pixel text-[9px] uppercase px-2 py-0.5 rounded-full border border-white/15 text-[var(--lightgray)]">
            {tools.filter((t) => t.installed).length}/{tools.length || 8} LOCAL TOOLS DETECTED
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-white/10 bg-black/70 p-1 text-[10px] font-pixel uppercase">
          {(
            [
              ['call', 'Voice Call · Avatar'],
              ['notes', 'Live Scribe'],
              ['computer', 'Computer Agent'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStudioTab(id)}
              className={`px-2.5 py-1 rounded-[7px] cursor-pointer transition-colors ${
                studioTab === id
                  ? 'bg-[var(--lime)] text-[#0a0a0a] font-bold'
                  : 'text-[var(--lightgray)] hover:text-[var(--bright)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {studioTab === 'call' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-4">
            <OnQVoiceOrb
              state={orbState}
              rmsLevel={rmsLevel}
              activeWord={activeSpokenWord}
              armProgress01={armProgress01}
              engineLabel={voiceEngineLabel}
            />
          </div>
          <div className="lg:col-span-8 space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onToggleMic}
                className={`px-4 py-2 font-semibold cursor-pointer ${
                  micActive
                    ? 'bg-[var(--danger)] text-[#0a0a0a]'
                    : 'bg-[var(--g2-phosphor)] text-[#0a0a0a]'
                }`}
              >
                {micActive ? 'End Live Voice Call' : 'Call OnQ (AssemblyAI Duplex)'}
              </button>

              <div
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-2 py-1"
                role="group"
                aria-label="Even R1 smart ring controls"
              >
                <span className="font-pixel text-[8.5px] text-[var(--lightgray)] px-1">R1 RING:</span>
                <button
                  type="button"
                  onClick={() => onRingEvent('SCROLL_UP')}
                  className="px-2 py-0.5 text-[10px] hover:text-[var(--lime)] cursor-pointer"
                >
                  Scroll ↑
                </button>
                <button
                  type="button"
                  onClick={() => onRingEvent('CLICK')}
                  className="px-2 py-0.5 text-[10px] bg-white/10 rounded text-[var(--bright)] hover:text-[var(--lime)] cursor-pointer"
                >
                  Tap
                </button>
                <button
                  type="button"
                  onClick={() => onRingEvent('SCROLL_DOWN')}
                  className="px-2 py-0.5 text-[10px] hover:text-[var(--lime)] cursor-pointer"
                >
                  Scroll ↓
                </button>
                <button
                  type="button"
                  onClick={() => onRingEvent('DOUBLE_CLICK')}
                  className="px-2 py-0.5 text-[10px] text-[var(--danger)] hover:underline cursor-pointer"
                >
                  2xTap
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="font-pixel text-[9px] uppercase tracking-[0.14em] text-[var(--lightgray)]">
                INSTANT GLASSES VOICE COMMANDS (CLICK TO RUN END-TO-END)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Push 15m and tell Priya',
                  'Reply on Telegram: joining in 5m',
                  'Plan project roadmap for Even G2',
                  'Check git status and open GitHub PRs',
                  'Add task review metrics deck Friday 4pm',
                ].map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => onRunCommand(cmd)}
                    className="retro-btn-glass px-2.5 py-1 text-[11px] text-[var(--bright)] hover:text-[var(--lime)] cursor-pointer"
                  >
                    &ldquo;{cmd}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {studioTab === 'notes' && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {onStartMeetingDemo && (
              <button
                type="button"
                onClick={onStartMeetingDemo}
                className="px-3.5 py-1.5 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
              >
                Start Live Meeting Scribe
              </button>
            )}
            {onWrapUpMeeting && (
              <button
                type="button"
                onClick={onWrapUpMeeting}
                className="px-3.5 py-1.5 border border-[var(--g2-phosphor)] text-[var(--g2-phosphor)] font-semibold hover:bg-[var(--g2-phosphor)] hover:text-[#0a0a0a] cursor-pointer"
              >
                Wrap Up -&gt; Stage Action Pack (Default-NO)
              </button>
            )}
            {meetingState?.active && onWipeMeeting && (
              <button
                type="button"
                onClick={onWipeMeeting}
                className="px-3 py-1.5 border border-[var(--danger)] text-[var(--danger)] cursor-pointer"
              >
                Wipe RAM Transcript
              </button>
            )}
          </div>

          {onAskMeeting && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!meetingAsk.trim()) return;
                onAskMeeting(meetingAsk.trim());
                setMeetingAsk('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="Ask OnQ about live meeting notes (e.g. Who owns Q4 metrics?)"
                value={meetingAsk}
                onChange={(e) => setMeetingAsk(e.target.value)}
                className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-3 py-1.5 text-[var(--bright)]"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-[var(--bright)] text-[#0a0a0a] font-semibold cursor-pointer"
              >
                Ask
              </button>
            </form>
          )}

          {meetingState && meetingState.turns.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-dashed border-white/10 pt-2.5">
              <div className="space-y-1">
                <div className="font-pixel text-[9px] text-[var(--g2-phosphor)]">DIARIZED RAM STREAM</div>
                {meetingState.turns.slice(-4).map((t, i) => (
                  <div key={i} className="text-[11px] text-[var(--bright)]">
                    <span className="text-[var(--lime)]">[{t.attendeeName}]</span> {t.text}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="font-pixel text-[9px] text-[var(--lime)]">EXTRACTED DECISIONS &amp; ACTIONS</div>
                {meetingState.decisions.map((d) => (
                  <div key={d.id} className="text-[11px] text-[var(--bright)]">
                    • {d.summary}
                  </div>
                ))}
                {meetingState.actions.map((a) => (
                  <div key={a.id} className="text-[11px] text-[var(--verified)]">
                    + {a.title} ({a.owner})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {studioTab === 'computer' && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['git_status', 'Inspect Git Status'],
                ['git_log', 'Latest Commits'],
                ['gh_prs', 'Check GitHub PRs'],
                ['workspace_summary', 'List Project Files'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() => void runInspect(k)}
                className="retro-btn-glass px-3 py-1.5 text-[11px] text-[var(--bright)] hover:text-[var(--lime)] cursor-pointer"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {tools.map((t) => (
              <div
                key={t.id}
                className={`border px-2.5 py-2 bg-black/50 space-y-0.5 ${
                  t.installed ? 'border-[var(--g2-phosphor)]/45' : 'border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-[var(--bright)] truncate">{t.name}</span>
                  <span
                    className={`font-pixel text-[8px] px-1.5 py-0.5 rounded ${
                      t.installed
                        ? 'bg-[var(--g2-phosphor)]/15 text-[var(--g2-phosphor)]'
                        : 'bg-white/5 text-[var(--lightgray)]'
                    }`}
                  >
                    {t.installed ? 'READY' : 'SETUP'}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--lightgray)] truncate">{t.accountMode}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              aria-label="Project plan or computer task prompt"
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
            />
            <select
              aria-label="Target local AI or tool"
              value={targetTool}
              onChange={(e) => setTargetTool(e.target.value as typeof targetTool)}
              className="bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-2 text-[var(--bright)]"
            >
              <option value="auto">Auto (Local Account CLI / OpenRouter)</option>
              <option value="openrouter">OpenRouter LIVE</option>
              <option value="workspace_test">Git Workspace Verify</option>
              <option value="claude_cli">Claude Code CLI (Account)</option>
              <option value="codex_cli">Codex CLI (ChatGPT Account)</option>
              <option value="gemini_cli">Gemini CLI (Google Account)</option>
              <option value="ollama">Ollama Local LLM</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void stageDelegatedTask()}
              className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer whitespace-nowrap"
            >
              Stage Task (Default-NO)
            </button>
          </div>

          {inspectRes && (
            <div className="border border-dashed border-[var(--hairline)] bg-[var(--ink)] p-3 space-y-1">
              <div className="font-pixel text-[9px] text-[var(--g2-phosphor)]">
                INSPECT ({inspectRes.kind.toUpperCase()}) · {inspectRes.latencyMs}MS
              </div>
              <div className="text-[var(--bright)]">{inspectRes.summary}</div>
              {inspectRes.lines.slice(0, 4).map((l, i) => (
                <div key={i} className="font-plex text-[10.5px] text-[var(--lightgray)] truncate">
                  {l}
                </div>
              ))}
            </div>
          )}

          {tasks.slice(0, 3).map((tk) => (
            <div
              key={tk.id}
              className="border border-white/10 bg-black/50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-pixel text-[9px] text-[var(--lime)]">{tk.status}</span>
                  <span className="font-semibold text-[var(--bright)] truncate">{tk.title}</span>
                </div>
                <div className="text-[11px] text-[var(--lightgray)] truncate">
                  {tk.toolUsed} · {tk.outputLines[0]}
                </div>
              </div>
              {tk.status === 'STAGED_DEFAULT_NO' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void commitDelegatedTask(tk)}
                  className="px-3 py-1.5 bg-[var(--g2-phosphor)] text-[#0a0a0a] font-pixel text-[9px] uppercase cursor-pointer shrink-0"
                >
                  Confirm &amp; Execute
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {studioMsg && (
        <p className="text-[11px] text-[var(--verified)] border-t border-dashed border-white/10 pt-2" role="status">
          {studioMsg}
        </p>
      )}
    </div>
  );
}
