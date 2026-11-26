import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ActionPreview, AliveMood, LiveUiSurface, NormalizedEvenEvent, VoiceOrbState } from '@onq/core';
import { OnQVoiceOrb } from './OnQVoiceOrb';
const Memory3DGalaxy = lazy(() => import('./Memory3DGalaxy').then((m) => ({ default: m.Memory3DGalaxy })));
import { UnifiedOsPanel } from './UnifiedOsPanel';

export interface AgentTaskDto {
  id: string;
  kind:
    | 'PLAN_PROJECT'
    | 'CODE_DELEGATE'
    | 'COMPUTER_CHECK'
    | 'TELEGRAM_SYNC'
    | 'YOUTUBE_SCOUT'
    | 'WRITE_CODE_BOT'
    | 'OUTREACH_SCHEDULER';
  title: string;
  prompt: string;
  targetTool: string;
  toolUsed: string;
  status: 'STAGED_DEFAULT_NO' | 'RUNNING' | 'DONE' | 'FAILED';
  previewToken: string;
  steps: string[];
  outputLines: string[];
  lensLines: string[];
  artifactPath?: string;
  codeSnippet?: string;
  links?: Array<{ label: string; url: string }>;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UnifiedMemoryDto {
  id: string;
  kind: 'task' | 'meeting' | 'email' | 'telegram' | 'note';
  title: string;
  summary: string;
  source: string;
  createdAtIso: string;
}

export interface SilentQuickChipDto {
  id: string;
  label: string;
  kind: 'command' | 'liveui' | 'telegram' | 'scout';
  payload: string;
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

// Three workspaces, one harness: the wearer's glance, the personal OS, and the meeting scribe.
const WORKSPACES = [
  { id: 'call', label: 'Glasses Live' },
  { id: 'os', label: 'Personal OS' },
  { id: 'notes', label: 'Meeting Scribe' },
] as const;
type StudioTab = (typeof WORKSPACES)[number]['id'];

// Track 04 credits Google Workspace, Notion, Telegram, Claude/ChatGPT/OpenRouter and voice, so quick actions for
// anything else (YouTube scout, market bot, Pomodoro, router matrix, video) are not shown.
const OFF_TRACK_CHIP = /youtube|market|btc|tao|pomodoro|router|python|video|reflex|arena|game/i;
const toStudioTab = (tab: string | undefined): StudioTab | null =>
  tab === 'os' || tab === 'notes' || tab === 'call' ? tab : null;

interface LiveVoiceStudioProps {
  sessionToken: string | null;
  orbState: VoiceOrbState;
  rmsLevel: number;
  activeSpokenWord: string;
  armProgress01: number;
  voiceEngineLabel: string;
  activeLlmProvider?: string;
  micActive: boolean;
  voiceLatencyMs?: number | null;
  backchannelText?: string | null;
  meetingState: MeetingStateDto | null;
  memories?: UnifiedMemoryDto[];
  externalTaskSeq?: number;
  onRefreshMemories?: () => void;
  onToggleMic: () => void;
  onRingEvent: (kind: NormalizedEvenEvent['kind']) => void;
  onRunCommand: (cmd: string) => void;
  onStartMeetingDemo?: () => void;
  onWrapUpMeeting?: () => void;
  onAskMeeting?: (question: string) => void;
  onWipeMeeting?: () => void;
  onPreviewStaged?: (preview: ActionPreview) => void;
  onLiveUiUpdate?: (surface: LiveUiSurface) => void;
  onPlayTts?: (text: string) => void;
}

/**
 * Unified OnQ Companion Studio (Personal AI Partner & Master Orchestrator):
 * 1) Persistent Shonen Monochrome Avatar Orchestrator across ALL workspace & agent tools
 * 2) Multi-Window Task Cards + LiveUI Generative Apps (Timers, Steppers, Tables, Mini-Games)
 * 3) Multi-Agent Kanban Fleet + Watch Agent Screen w/ Glasses Human Takeover
 * 4) Persistent SQLite Unified Memory w/ Cited RAG, Defuddle & 3D Galaxy
 */
export function LiveVoiceStudio({
  sessionToken,
  orbState,
  rmsLevel,
  activeSpokenWord,
  armProgress01,
  voiceEngineLabel,
  activeLlmProvider,
  micActive,
  voiceLatencyMs,
  backchannelText,
  meetingState,
  memories: externalMemories,
  externalTaskSeq = 0,
  onRefreshMemories,
  onToggleMic,
  onRingEvent,
  onRunCommand,
  onStartMeetingDemo,
  onWrapUpMeeting,
  onAskMeeting,
  onWipeMeeting,
  onPreviewStaged,
  onLiveUiUpdate,
  onPlayTts,
}: LiveVoiceStudioProps) {
  const reduced = useReducedMotion();
  const [studioTab, setStudioTab] = useState<StudioTab>('call');
  const [tasks, setTasks] = useState<AgentTaskDto[]>([]);
  const [localMemories, setLocalMemories] = useState<UnifiedMemoryDto[]>([]);
  const [memFilter, setMemFilter] = useState('');
  const [memView, setMemView] = useState<'list' | '3d'>('list');
  const [expandedCodeId, setExpandedCodeId] = useState<string | null>(null);
  const [collapsingId, setCollapsingId] = useState<string | null>(null);
  const [targetTool] = useState<
    'auto' | 'claude_cli' | 'codex_cli' | 'gemini_cli' | 'ollama' | 'openrouter' | 'workspace_test'
  >('auto');
  const [meetingAsk, setMeetingAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [studioMsg, setStudioMsg] = useState<string | null>(null);

  // Unified Personal AI Partner & Master Orchestrator State
  const [partnerInput, setPartnerInput] = useState('');
  const [partnerReply, setPartnerReply] = useState(
    'I am OnQ. Ask me about your calendar, email, Notion or Telegram, or tell me to move a meeting. Anything that sends waits for your approval.',
  );
  const [partnerDomain, setPartnerDomain] = useState<string>('ALL SYSTEMS READY');
  const [partnerWord, setPartnerWord] = useState('');
  const [partnerSpeaking, setPartnerSpeaking] = useState(false);
  const partnerTimerRef = useRef<number[]>([]);

  // LiveUI Micro-App + Read-Speed Pacer State
  const [liveUi, setLiveUi] = useState<LiveUiSurface | null>(null);
  const [aliveMood, setAliveMood] = useState<AliveMood>('neutral');

  // Silent quick-action chips
  const [silentChips, setSilentChips] = useState<SilentQuickChipDto[]>([]);

  // Cited Knowledge RAG + Defuddle + Hermes Taste Profile + Token Savings
  const [ragQuery, setRagQuery] = useState('');
  const [ragUrl, setRagUrl] = useState('');
  const [ragAnswer, setRagAnswer] = useState<{ answer: string; citations: Array<{ ref: string; title: string; source: string; excerpt: string }> } | null>(null);
  const [tasteVerbosity, setTasteVerbosity] = useState<'caveman' | 'concise' | 'detailed'>('caveman');
  const [tokenSavedPct, setTokenSavedPct] = useState<number>(0);
  const [tokenTotalSaved, setTokenTotalSaved] = useState<number>(0);

  useEffect(() => {
    return () => {
      partnerTimerRef.current.forEach((t) => window.clearTimeout(t));
      partnerTimerRef.current = [];
    };
  }, []);

  const memories = externalMemories ?? localMemories;

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) h.Authorization = `Bearer ${sessionToken}`;
    return h;
  }, [sessionToken]);

  const loadStudioState = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const headers = { Authorization: `Bearer ${sessionToken}` };
      const [compRes, memRes, liveRes, tokRes, prefRes] = await Promise.all([
        fetch('/api/computer/tools', { headers, credentials: 'include' }),
        fetch('/api/memory', { headers, credentials: 'include' }),
        fetch('/api/liveui', { headers, credentials: 'include' }),
        fetch('/api/harness/tokens', { headers, credentials: 'include' }),
        fetch('/api/preferences', { headers, credentials: 'include' }),
      ]);
      if (compRes.ok) {
        const j = (await compRes.json()) as {
          tasks: AgentTaskDto[];
        };
        setTasks(j.tasks ?? []);
      }
      if (memRes.ok) {
        const mj = (await memRes.json()) as { memories?: UnifiedMemoryDto[] };
        setLocalMemories(mj.memories ?? []);
      }
      if (liveRes.ok) {
        const lj = (await liveRes.json()) as {
          surface?: LiveUiSurface;
          silentChips?: SilentQuickChipDto[];
        };
        if (lj.surface) setLiveUi(lj.surface);
        if (lj.silentChips) setSilentChips(lj.silentChips);
      }
      if (tokRes.ok) {
        const tj = (await tokRes.json()) as {
          summary?: { estimatedSavedTokens?: number; reductionPct?: number };
        };
        setTokenTotalSaved(tj.summary?.estimatedSavedTokens ?? 0);
        setTokenSavedPct(tj.summary?.reductionPct ?? 0);
      }
      if (prefRes.ok) {
        const pj = (await prefRes.json()) as { taste?: { verbosity?: 'caveman' | 'concise' | 'detailed' } };
        if (pj.taste?.verbosity) setTasteVerbosity(pj.taste.verbosity);
      }
    } catch {
      // ignore offline
    }
  }, [sessionToken]);

  useEffect(() => {
    void loadStudioState();
  }, [loadStudioState, externalTaskSeq]);

  // Live countdown ticker when LiveUI has an active running timer
  const hasRunningTimer = Boolean(
    liveUi?.components.some((c) => c.kind === 'timer' && c.timer?.status === 'running'),
  );
  useEffect(() => {
    if (!hasRunningTimer || !sessionToken) return;
    const id = setInterval(() => {
      void fetch('/api/liveui/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        credentials: 'include',
        body: JSON.stringify({ type: 'tick', elapsedSec: 1 }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { surface?: LiveUiSurface } | null) => {
          if (j?.surface) {
            setLiveUi(j.surface);
            onLiveUiUpdate?.(j.surface);
          }
        })
        .catch(() => null);
    }, 1000);
    return () => clearInterval(id);
  }, [hasRunningTimer, sessionToken, onLiveUiUpdate]);

  const triggerAutonomousTask = async (kind: AgentTaskDto['kind'], prompt: string) => {
    if (!sessionToken || !prompt.trim()) return;
    setBusy(true);
    setStudioMsg(null);
    setAliveMood('focused');
    try {
      const stageRes = await fetch('/api/agent/tasks/stage', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          kind,
          title: prompt.trim().slice(0, 48),
          prompt: prompt.trim(),
          targetTool,
        }),
      });
      const sj = (await stageRes.json()) as { task?: AgentTaskDto; error?: string };
      if (sj.task) {
        setTasks((prev) => [sj.task!, ...prev]);
        setStudioMsg(`Task ready — tap Run to execute "${sj.task.title}".`);
      } else if (sj.error) {
        setStudioMsg(sj.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const commitDelegatedTask = async (task: AgentTaskDto) => {
    if (!sessionToken) return;
    setBusy(true);
    setStudioMsg(null);
    setAliveMood('determined');
    try {
      const res = await fetch('/api/agent/tasks/commit', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ taskId: task.id, previewToken: task.previewToken }),
      });
      const j = (await res.json()) as { task?: AgentTaskDto; error?: string };
      if (j.task) {
        setCollapsingId(j.task.id);
        setAliveMood('proud');
        setTimeout(() => setCollapsingId(null), 900);
        setTasks((prev) => prev.map((t) => (t.id === j.task!.id ? j.task! : t)));
        setStudioMsg(`Done (${j.task.toolUsed}): ${j.task.outputLines[0] ?? 'Saved to memory'}`);
        onRefreshMemories?.();
        void loadStudioState();
      } else if (j.error) {
        setStudioMsg(j.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const archiveTaskToMemory = async (task: AgentTaskDto) => {
    if (!sessionToken) return;
    setCollapsingId(task.id);
    await fetch('/api/memory', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        kind: 'task',
        title: task.title,
        summary: task.outputLines[0] ?? task.prompt,
        source: task.toolUsed,
      }),
    }).catch(() => null);
    setTimeout(() => {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setCollapsingId(null);
      onRefreshMemories?.();
      void loadStudioState();
    }, 380);
  };

  const deleteMemoryItem = async (id: string) => {
    if (!sessionToken) return;
    await fetch(`/api/memory/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
      credentials: 'include',
    });
    setLocalMemories((prev) => prev.filter((m) => m.id !== id));
    onRefreshMemories?.();
  };

  const generateLiveUiApp = async (input: { prompt?: string; presetKey?: string }) => {
    if (!sessionToken) return;
    setBusy(true);
    setAliveMood('excited');
    try {
      const res = await fetch('/api/liveui/generate', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ ...input, pin: true }),
      });
      const j = (await res.json()) as { surface?: LiveUiSurface; error?: string };
      if (j.surface) {
        setLiveUi(j.surface);
        onLiveUiUpdate?.(j.surface);
        setStudioMsg(`LiveUI "${j.surface.title}" pushed straight to your G2 glasses.`);
      } else if (j.error) {
        setStudioMsg(j.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const makeG2TextSurface = (id: string, title: string, lines: string[]): LiveUiSurface => ({
    id,
    title,
    frame: 'full',
    repairedCodes: [],
    vars: {},
    updatedAtIso: new Date().toISOString(),
    components: lines.slice(0, 4).map((line, idx) => ({
      id: `${id}_${idx}`,
      kind: 'text',
      region: 'main',
      text: line,
    })),
  });

  const runCitedRagQuery = async () => {
    if (!sessionToken || !ragQuery.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/rag/query', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ query: ragQuery.trim() }),
      });
      const j = (await res.json()) as {
        answer?: string;
        citations?: Array<{ index?: number; ref?: string; title: string; source: string; excerpt: string }>;
        g2Lines?: string[];
        tokenSummary?: { estimatedSavedTokens?: number; reductionPct?: number };
      };
      if (j.answer) {
        const normalizedCites = (j.citations ?? []).map((c, idx) => ({
          ref: c.ref ?? `[${c.index ?? idx + 1}]`,
          title: c.title,
          source: c.source,
          excerpt: c.excerpt,
        }));
        setRagAnswer({ answer: j.answer, citations: normalizedCites });
        setStudioMsg(`RAG answer grounded across ${normalizedCites.length} citation(s).`);
      }
      if (j.tokenSummary) {
        setTokenTotalSaved(j.tokenSummary.estimatedSavedTokens ?? 0);
        setTokenSavedPct(j.tokenSummary.reductionPct ?? 0);
      }
      if (j.g2Lines?.length && onLiveUiUpdate) {
        onLiveUiUpdate(makeG2TextSurface('rag_cite', 'Cited RAG Brief', j.g2Lines));
      }
    } finally {
      setBusy(false);
    }
  };

  const ingestDefuddleUrl = async () => {
    if (!sessionToken || !ragUrl.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/rag/ingest-url', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ url: ragUrl.trim() }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        doc?: { title: string };
        error?: string;
        tokenSummary?: { estimatedSavedTokens?: number; reductionPct?: number };
      };
      if (!res.ok) {
        setStudioMsg(j.error ?? 'URL blocked by security policy.');
        return;
      }
      if (j.tokenSummary) {
        setTokenTotalSaved(j.tokenSummary.estimatedSavedTokens ?? 0);
        setTokenSavedPct(j.tokenSummary.reductionPct ?? 0);
      }
      setRagUrl('');
      onRefreshMemories?.();
      setStudioMsg(`Added "${j.doc?.title ?? 'document'}" to memory.`);
      void loadStudioState();
    } finally {
      setBusy(false);
    }
  };

  const updateTastePreference = async (verbosity: 'caveman' | 'concise' | 'detailed') => {
    setTasteVerbosity(verbosity);
    if (!sessionToken) return;
    await fetch('/api/preferences', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({ verbosity }),
    });
    setStudioMsg(`Response style updated: ${verbosity === 'caveman' ? 'SHORT' : verbosity.toUpperCase()}.`);
  };

  const triggerSilentChip = async (chip: SilentQuickChipDto) => {
    setAliveMood('amused');
    if (chip.kind === 'liveui') {
      setStudioTab('call');
      await generateLiveUiApp({ prompt: chip.payload });
      return;
    }
    if (chip.kind === 'scout') {
      await triggerAutonomousTask('YOUTUBE_SCOUT', chip.payload);
      return;
    }
    if (chip.kind === 'telegram') {
      onRunCommand('Send daily Telegram brief');
      return;
    }
    onRunCommand(chip.payload);
  };

  const filteredMemories = memFilter.trim()
    ? memories.filter(
        (m) =>
          m.title.toLowerCase().includes(memFilter.toLowerCase()) ||
          m.summary.toLowerCase().includes(memFilter.toLowerCase()),
      )
    : memories;

  const runPartnerOrchestration = async (customText?: string) => {
    const message = (customText ?? partnerInput).trim();
    if (!message || !sessionToken) return;
    partnerTimerRef.current.forEach((t) => window.clearTimeout(t));
    partnerTimerRef.current = [];
    setBusy(true);
    setPartnerSpeaking(false);
    setPartnerWord('');
    setAliveMood('focused');
    try {
      const res = await fetch('/api/agent/orchestrate', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ message }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        domain?: string;
        recommendedTab?: 'call' | 'os' | 'apps' | 'fleet' | 'market' | 'explainer' | 'notes' | 'computer';
        reply?: string;
        spokenText?: string;
        preview?: ActionPreview;
        surface?: LiveUiSurface;
        g2Lines?: string[];
        tokenSummary?: { estimatedSavedTokens?: number; reductionPct?: number };
        error?: string;
      };
      if (j.error) {
        setPartnerReply(j.error);
        setStudioMsg(j.error);
        return;
      }
      if (j.domain) setPartnerDomain(j.domain.replace(/_/g, ' '));
      if (j.reply) {
        setPartnerReply(j.reply);
        setStudioMsg(j.reply);
      }
      if (j.preview && onPreviewStaged) {
        onPreviewStaged(j.preview);
      }
      if (j.surface) setLiveUi(j.surface);
      if (j.tokenSummary) {
        setTokenTotalSaved(j.tokenSummary.estimatedSavedTokens ?? 0);
        setTokenSavedPct(j.tokenSummary.reductionPct ?? 0);
      }
      if (j.g2Lines?.length && onLiveUiUpdate && !j.preview) {
        onLiveUiUpdate(makeG2TextSurface('partner_g2', 'OnQ Partner', j.g2Lines));
      }
      // Other recommended tabs (market, apps, fleet...) no longer exist; keep the current workspace for those.
      const nextTab = toStudioTab(j.recommendedTab);
      if (nextTab) setStudioTab(nextTab);
      if (!customText) setPartnerInput('');

      const spokenLine = (j.spokenText ?? j.reply ?? '').trim();
      if (spokenLine && onPlayTts) {
        void onPlayTts(spokenLine);
      }
      const words = spokenLine.split(/\s+/).filter(Boolean).slice(0, 18);
      if (words.length > 0 && !reduced) {
        setPartnerSpeaking(true);
        words.forEach((w, idx) => {
          const timerId = window.setTimeout(() => {
            setPartnerWord(w);
          }, idx * 165);
          partnerTimerRef.current.push(timerId);
        });
        const doneId = window.setTimeout(() => {
          setPartnerWord('');
          setPartnerSpeaking(false);
        }, words.length * 165 + 240);
        partnerTimerRef.current.push(doneId);
      }
      onRefreshMemories?.();
      void loadStudioState();
    } finally {
      setBusy(false);
    }
  };

  const companionOrbState: VoiceOrbState = partnerSpeaking ? 'speaking' : busy ? 'thinking' : orbState;

  return (
    <div className="retro-glass-well p-4 sm:p-5 space-y-4">
      {/* Persistent Personal AI Partner & Overall Orchestrator Avatar Dock (Always Visible Across Every Tab) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch border border-[#34F57E]/25 bg-black/45 p-3.5 rounded-[12px]">
        <div className="lg:col-span-4 flex flex-col justify-between">
          <OnQVoiceOrb
            state={companionOrbState}
            rmsLevel={rmsLevel}
            activeWord={partnerWord || activeSpokenWord}
            armProgress01={armProgress01}
            engineLabel={voiceEngineLabel}
            latencyMs={voiceLatencyMs}
            backchannelText={backchannelText}
            aliveMood={aliveMood}
            orchestratorLabel={activeLlmProvider || 'Auto Router'}
          />
        </div>

        <div className="lg:col-span-8 flex flex-col justify-between gap-3 text-xs">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]">
                  ONQ PARTNER
                </span>
                <span className="font-plex text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#34F57E]/40 bg-[#34F57E]/10 text-[#86FFAF]">
                  {partnerDomain}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 font-plex text-[10px]">
                <span className="px-2 py-0.5 rounded-full border border-[#86FFAF]/35 text-[#86FFAF] bg-[#86FFAF]/5">
                  {tokenSavedPct > 0 ? `Context trimmed ${tokenSavedPct}% (${tokenTotalSaved} tokens)` : 'Context trim ready'}
                </span>
              </div>
            </div>

            <div className="border border-dashed border-[#34F57E]/30 bg-[#041209] px-3 py-2 text-[12px] leading-relaxed text-[var(--bright)]" role="status">
              {partnerReply}
            </div>
          </div>

          <div className="space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runPartnerOrchestration();
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                aria-label="Ask or tell your OnQ Partner anything"
                placeholder="Ask OnQ anything: calendar, email, Notion, Telegram..."
                value={partnerInput}
                onChange={(e) => setPartnerInput(e.target.value)}
                className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] focus:border-[#34F57E] px-3 py-2 text-[var(--bright)] text-xs"
              />
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="submit"
                  disabled={busy}
                  className="retro-btn-primary px-3.5 py-2 font-semibold cursor-pointer"
                >
                  {busy ? 'Working...' : 'Run Agent'}
                </button>
                <button
                  type="button"
                  onClick={onToggleMic}
                  className={`px-3 py-2 font-semibold cursor-pointer ${
                    micActive
                      ? 'bg-[var(--danger)] text-[#0a0a0a]'
                      : 'retro-btn-glass text-[var(--g2-phosphor)]'
                  }`}
                >
                  {micActive ? 'End Call' : 'Talk Hands-Free'}
                </button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {[
                  'What is our safety rule for G2 glasses?',
                  'What is on my calendar today?',
                  'Summarize my unread email',
                  'Push my next meeting 15m and tell Investor',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    disabled={busy}
                    onClick={() => void runPartnerOrchestration(sample)}
                    className="px-2 py-1 border border-[#34f57e]/25 bg-[#04140b] text-[10.5px] text-[#86FFAF] hover:bg-[#34F57E] hover:text-[#041209] cursor-pointer transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              <div
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-2 py-1 text-[10px]"
                role="group"
                aria-label="Even R1 ring controls"
              >
                <button type="button" onClick={() => onRingEvent('SCROLL_UP')} className="px-1.5 hover:text-[var(--g2-phosphor)] cursor-pointer">
                  Up
                </button>
                <button type="button" onClick={() => onRingEvent('CLICK')} className="px-1.5 bg-white/10 rounded text-[var(--bright)] hover:text-[var(--g2-phosphor)] cursor-pointer">
                  Tap
                </button>
                <button type="button" onClick={() => onRingEvent('SCROLL_DOWN')} className="px-1.5 hover:text-[var(--g2-phosphor)] cursor-pointer">
                  Down
                </button>
                <button type="button" onClick={() => onRingEvent('DOUBLE_CLICK')} className="px-1.5 text-[var(--danger)] hover:underline cursor-pointer">
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="OnQ workspaces"
          className="flex flex-wrap gap-1 rounded-[10px] border border-white/10 bg-black/70 p-1 text-xs font-semibold"
        >
          {WORKSPACES.map(({ id, label }) => {
            const selected = studioTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setStudioTab(id)}
                className={`px-3.5 py-1.5 rounded-[7px] cursor-pointer transition-colors border-b-2 ${
                  selected
                    ? 'bg-[var(--lime)] text-[#041209] border-[#041209]'
                    : 'text-[var(--lightgray)] hover:text-[var(--bright)] border-transparent'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

      </div>

      {studioTab === 'os' && (
        <UnifiedOsPanel
          sessionToken={sessionToken}
          onStatusMsg={(msg) => setStudioMsg(msg)}
          onLiveUiUpdate={onLiveUiUpdate}
          onRefreshState={() => {
            onRefreshMemories?.();
            void loadStudioState();
          }}
        />
      )}

      {studioTab === 'call' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Col 1: Quiet Room Quick Actions & Companion Mood Controls */}
          <div className="lg:col-span-4 space-y-2.5 text-xs">
            <div className="border border-white/10 bg-black/50 p-3 space-y-2">
              <div className="font-pixel text-[9px] uppercase tracking-wider text-[var(--g2-phosphor)]">
                QUIET ROOM ONE-TAP CONTROLS
              </div>
              <p className="text-[11px] text-[var(--lightgray)]">
                Trigger glasses workflows without speaking aloud:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {silentChips.filter((chip) => !OFF_TRACK_CHIP.test(chip.label)).slice(0, 6).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => void triggerSilentChip(chip)}
                    className="px-2.5 py-1 border border-[#34f57e]/25 bg-[#04140b] text-[10.5px] text-[#86FFAF] hover:bg-[#34F57E] hover:text-[#041209] cursor-pointer transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-white/10 bg-black/50 p-3 space-y-2">
              <div className="font-pixel text-[9px] uppercase tracking-wider text-[#86FFAF]">
                AVATAR MOOD
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['neutral', 'amused', 'focused', 'curious'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAliveMood(m)}
                    className={`px-2 py-0.5 border text-[10px] capitalize cursor-pointer ${
                      aliveMood === m
                        ? 'border-[#34F57E] bg-[#34F57E] text-[#041209] font-semibold'
                        : 'border-white/15 text-[var(--lightgray)] hover:text-[var(--bright)]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[var(--lightgray)]">
                Your partner avatar lip-syncs while OnQ speaks.
              </p>
            </div>
          </div>

          {/* Col 2: Multi-Window Task Cards (separate boxes + dot collapse animation) */}
          <div className="lg:col-span-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-pixel text-[9px] uppercase tracking-[0.14em] text-[var(--g2-phosphor)]">
                TASK WINDOWS ({tasks.length})
              </span>
              <span className="text-[10px] text-[var(--lightgray)]">Run -&gt; Save</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['OUTREACH_SCHEDULER', 'Outreach follow-ups', 'Prepare lead outreach follow-ups and free schedule slots'],
                ] as const
              ).map(([kind, label, prompt]) => (
                <button
                  key={kind}
                  type="button"
                  disabled={busy}
                  onClick={() => void triggerAutonomousTask(kind, prompt)}
                  className="retro-btn-glass px-2.5 py-1 text-[10.5px] text-[var(--bright)] hover:text-[var(--g2-phosphor)] cursor-pointer"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onRunCommand('Push 15m and tell Investor')}
                className="retro-btn-glass px-2.5 py-1 text-[10.5px] text-[var(--bright)] hover:text-[var(--g2-phosphor)] cursor-pointer"
              >
                Push meeting +15m
              </button>
            </div>

            <div className="space-y-2 max-h-[290px] overflow-y-auto pr-0.5">
              <AnimatePresence>
                {tasks.length === 0 ? (
                  <div className="border border-dashed border-white/10 p-3 text-[11px] text-[var(--lightgray)]">
                    Pick a quick task above or speak from your glasses. Each task opens its own window here.
                  </div>
                ) : (
                  tasks.slice(0, 3).map((tk) => (
                    <motion.div
                      key={tk.id}
                      layout
                      initial={reduced ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
                      animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? undefined : { opacity: 0, x: 24, scale: 0.92 }}
                      transition={{ duration: 0.22 }}
                      className="relative border border-[#34f57e]/30 bg-black/60 p-3 space-y-2 overflow-hidden"
                    >
                      {collapsingId === tk.id && !reduced && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-end pr-1" aria-hidden="true">
                          {[0, 1, 2, 3, 4].map((dotIdx) => (
                            <motion.span
                              key={dotIdx}
                              className="w-1.5 h-1.5 rounded-full bg-[#34F57E] mx-0.5"
                              initial={{ x: -90, opacity: 1, scale: 1 }}
                              animate={{ x: 26, y: (dotIdx - 2) * 3, opacity: 0, scale: 0.4 }}
                              transition={{ duration: 0.42, delay: dotIdx * 0.04 }}
                            />
                          ))}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--bright)] truncate">{tk.title}</div>
                          <div className="text-[10px] text-[var(--g2-phosphor)] truncate">
                            {tk.status === 'STAGED_DEFAULT_NO' ? 'Waiting confirm' : tk.toolUsed}
                          </div>
                        </div>
                        {tk.status === 'STAGED_DEFAULT_NO' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void commitDelegatedTask(tk)}
                            className="px-2.5 py-1 bg-[#34F57E] text-[#041209] font-pixel text-[8.5px] uppercase cursor-pointer shrink-0"
                          >
                            Confirm &amp; Run
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void archiveTaskToMemory(tk)}
                            className="px-2 py-0.5 border border-[#34f57e]/40 text-[#86FFAF] hover:bg-[#34F57E] hover:text-[#041209] font-pixel text-[8px] uppercase cursor-pointer shrink-0"
                          >
                            Collapse -&gt; Mem
                          </button>
                        )}
                      </div>

                      {tk.outputLines[0] && (
                        <div className="text-[11px] text-[var(--lightgray)] leading-snug">
                          {tk.outputLines[0]}
                        </div>
                      )}

                      {tk.links && tk.links.length > 0 && (
                        <div className="space-y-1 border-t border-dashed border-white/10 pt-1.5">
                          {tk.links.slice(0, 3).map((lnk) => (
                            <a
                              key={lnk.url}
                              href={lnk.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-[10.5px] text-[#86FFAF] hover:underline truncate"
                            >
                              -&gt; {lnk.label}
                            </a>
                          ))}
                        </div>
                      )}

                      {tk.codeSnippet && (
                        <div className="border-t border-dashed border-white/10 pt-1.5 space-y-1">
                          <button
                            type="button"
                            onClick={() => setExpandedCodeId(expandedCodeId === tk.id ? null : tk.id)}
                            className="text-[10px] text-[#34F57E] hover:underline cursor-pointer"
                          >
                            {expandedCodeId === tk.id
                              ? 'Hide script'
                              : tk.kind === 'WRITE_CODE_BOT' || tk.toolUsed.toLowerCase().includes('python')
                                ? 'View generated automation script'
                                : 'View generated snippet'}
                          </button>
                          {expandedCodeId === tk.id && (
                            <pre className="max-h-28 overflow-auto bg-[#030a06] border border-white/10 p-2 text-[9.5px] text-[#86FFAF]">
                              {tk.codeSnippet}
                            </pre>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Col 3: Unified Memory Rail (2D Feed <-> Interactive Three.js 3D Map) */}
          <div className="lg:col-span-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-pixel text-[9px] uppercase tracking-[0.14em] text-[#86FFAF]">
                UNIFIED MEMORY ({memories.length})
              </span>
              <div className="inline-flex rounded border border-white/15 bg-black/70 p-0.5 text-[9px] font-pixel uppercase">
                <button
                  type="button"
                  onClick={() => setMemView('list')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    memView === 'list' ? 'bg-[#34F57E] text-[#041209]' : 'text-[var(--lightgray)]'
                  }`}
                >
                  Feed
                </button>
                <button
                  type="button"
                  onClick={() => setMemView('3d')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    memView === '3d' ? 'bg-[#34F57E] text-[#041209]' : 'text-[var(--lightgray)]'
                  }`}
                >
                  3D Map
                </button>
              </div>
            </div>

            {memView === '3d' ? (
              <Suspense fallback={<div role="status" className="p-6 text-center text-xs text-[var(--lightgray)]">Loading 3D map...</div>}>
                <Memory3DGalaxy memories={memories as Array<{ id: string; kind: 'task' | 'meeting' | 'email' | 'telegram' | 'note'; title: string; summary: string; source: string; createdAtIso: string }>} />
              </Suspense>
            ) : (
              <>
                <div className="flex items-center justify-between gap-1.5 border border-white/10 bg-black/50 px-2 py-1 text-[10px]">
                  <span className="font-pixel text-[8px] uppercase text-[var(--lightgray)]">ANSWER STYLE:</span>
                  <div className="flex gap-1">
                    {(['caveman', 'concise', 'detailed'] as const).map((modeOption) => (
                      <button
                        key={modeOption}
                        type="button"
                        onClick={() => void updateTastePreference(modeOption)}
                        className={`px-1.5 py-0.5 rounded font-pixel text-[8px] uppercase cursor-pointer ${
                          tasteVerbosity === modeOption
                            ? 'bg-[#34F57E] text-[#041209]'
                            : 'text-[var(--lightgray)] hover:text-[var(--bright)]'
                        }`}
                      >
                        {modeOption === 'caveman' ? 'short' : modeOption}
                      </button>
                    ))}
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runCitedRagQuery();
                  }}
                  className="flex gap-1"
                >
                  <input
                    type="text"
                    aria-label="Ask your notes"
                    placeholder="Ask your notes (answers cite sources)..."
                    value={ragQuery}
                    onChange={(e) => setRagQuery(e.target.value)}
                    className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--bright)] focus:border-[#34F57E]"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-2 py-1 bg-[#34F57E] text-[#041209] font-pixel text-[8.5px] cursor-pointer"
                  >
                    Ask
                  </button>
                </form>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ingestDefuddleUrl();
                  }}
                  className="flex gap-1"
                >
                  <input
                    type="url"
                    aria-label="Add a web page to memory"
                    placeholder="Paste a URL to add it to memory..."
                    value={ragUrl}
                    onChange={(e) => setRagUrl(e.target.value)}
                    className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--bright)] focus:border-[#86FFAF]"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-2 py-1 border border-[#86FFAF]/40 text-[#86FFAF] font-pixel text-[8.5px] cursor-pointer"
                  >
                    Add
                  </button>
                </form>

                {ragAnswer && (
                  <div className="border border-[#34F57E]/45 bg-[#041209] p-2 space-y-1 text-[10.5px]">
                    <div className="text-[var(--bright)] leading-snug">{ragAnswer.answer}</div>
                    {ragAnswer.citations.slice(0, 2).map((c) => (
                      <div key={c.ref} className="text-[9.5px] text-[#86FFAF] truncate">
                        {c.ref} {c.title} ({c.source})
                      </div>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  aria-label="Search unified memory"
                  placeholder="Filter memory feed..."
                  value={memFilter}
                  onChange={(e) => setMemFilter(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--bright)] focus:border-[#34F57E]"
                />

                <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-0.5">
                  {filteredMemories.length === 0 ? (
                    <div className="border border-dashed border-white/10 p-3 text-[11px] text-[var(--lightgray)]">
                      Completed tasks, voice replies, Telegram messages, and meeting notes appear here automatically.
                    </div>
                  ) : (
                    filteredMemories.slice(0, 6).map((mem) => (
                      <motion.div
                        key={mem.id}
                        initial={reduced ? undefined : { opacity: 0, x: -8 }}
                        animate={reduced ? undefined : { opacity: 1, x: 0 }}
                        className="border border-white/10 bg-black/55 px-2.5 py-2 space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-pixel text-[8px] uppercase text-[#34F57E]">{mem.kind}</span>
                          <button
                            type="button"
                            onClick={() => void deleteMemoryItem(mem.id)}
                            className="text-[10px] text-[var(--lightgray)] hover:text-[var(--danger)] cursor-pointer"
                            aria-label={`Remove memory ${mem.title}`}
                          >
                            x
                          </button>
                        </div>
                        <div className="font-medium text-[11px] text-[var(--bright)] truncate">{mem.title}</div>
                        <div className="text-[10px] text-[var(--lightgray)] truncate">{mem.summary}</div>
                      </motion.div>
                    ))
                  )}
                </div>
              </>
            )}
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
                className="px-3.5 py-1.5 bg-[var(--lime)] text-[#041209] font-semibold cursor-pointer"
              >
                Start Live Meeting Scribe
              </button>
            )}
            {onWrapUpMeeting && (
              <button
                type="button"
                onClick={onWrapUpMeeting}
                className="px-3.5 py-1.5 border border-[var(--g2-phosphor)] text-[var(--g2-phosphor)] font-semibold hover:bg-[var(--g2-phosphor)] hover:text-[#041209] cursor-pointer"
              >
                Wrap Up -&gt; Ask Before Sending
              </button>
            )}
            {meetingState?.active && onWipeMeeting && (
              <button
                type="button"
                onClick={onWipeMeeting}
                className="px-3 py-1.5 border border-[var(--danger)] text-[var(--danger)] cursor-pointer"
              >
                Clear Notes
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
                placeholder="Ask about this meeting or past memory (e.g. Who owns Q4 metrics?)"
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
                <div className="font-pixel text-[9px] text-[var(--g2-phosphor)]">LIVE SPEAKERS (MEMORY ONLY)</div>
                {meetingState.turns.slice(-4).map((t, i) => (
                  <div key={i} className="text-[11px] text-[var(--bright)]">
                    <span className="text-[var(--lime)]">[{t.attendeeName}]</span> {t.text}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="font-pixel text-[9px] text-[var(--lime)]">DECISIONS &amp; ACTIONS</div>
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

      {studioMsg && (
        <p className="text-[11px] text-[var(--verified)] border-t border-dashed border-white/10 pt-2" role="status">
          {studioMsg}
        </p>
      )}
    </div>
  );
}
