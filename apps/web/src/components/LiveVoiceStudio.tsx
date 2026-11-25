import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { formatLiveUiForG2, evaluateSafeFormula, formatFormulaValue, buildSurfaceEnv, parseDisplayMarkup, stepPacedReveal } from '@onq/core';
import type { AliveMood, LiveUiInteraction, LiveUiSurface, NormalizedEvenEvent, VoiceOrbState } from '@onq/core';
import { OnQVoiceOrb } from './OnQVoiceOrb';
import { Memory3DGalaxy } from './Memory3DGalaxy';
import { ExplainerStudio } from './ExplainerStudio';

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

export interface KanbanCardDto {
  id: string;
  lane: 'needs_you' | 'running' | 'scheduled' | 'done';
  title: string;
  agentName: string;
  model: string;
  summary: string;
  cronSpec?: string;
  updatedAtIso: string;
  canApprove?: boolean;
  actionCommand?: string;
}

export interface WatchScreenDto {
  active: boolean;
  appName: string;
  holder: 'agent' | 'human';
  leaseEpoch: number;
  resolution: { w: number; h: number };
  cursor: { x: number; y: number; targetLabel: string };
  lines: string[];
  actionPending?: string;
  lastControl?: string;
  updatedAtIso: string;
}

export interface SilentQuickChipDto {
  id: string;
  label: string;
  kind: 'command' | 'liveui' | 'telegram' | 'scout';
  payload: string;
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
  onLiveUiUpdate?: (surface: LiveUiSurface) => void;
}

/**
 * Unified OnQ Companion Studio (ahead of OcuClaw v2.2.1):
 * 1) JJK Six-Eyes Alive Engine w/ live word lip-sync, mood expressions & Quiet-Mode Silent Chips
 * 2) Multi-Window Task Cards + LiveUI Generative Apps (Timers, Steppers, Tables, Mini-Games)
 * 3) Multi-Agent Kanban Fleet + Watch Agent Screen w/ Glasses Human Takeover
 * 4) Persistent SQLite Unified Memory w/ 2D Feed <-> Interactive 3D WebGL Galaxy toggle
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
  onLiveUiUpdate,
}: LiveVoiceStudioProps) {
  const reduced = useReducedMotion();
  const [studioTab, setStudioTab] = useState<'call' | 'apps' | 'fleet' | 'market' | 'explainer' | 'notes' | 'computer'>('call');
  const [tools, setTools] = useState<LocalToolInfoDto[]>([]);
  const [tasks, setTasks] = useState<AgentTaskDto[]>([]);
  const [localMemories, setLocalMemories] = useState<UnifiedMemoryDto[]>([]);
  const [memFilter, setMemFilter] = useState('');
  const [memView, setMemView] = useState<'list' | '3d'>('list');
  const [expandedCodeId, setExpandedCodeId] = useState<string | null>(null);
  const [collapsingId, setCollapsingId] = useState<string | null>(null);
  const [inspectRes, setInspectRes] = useState<SafeInspectDto | null>(null);
  const [taskPrompt, setTaskPrompt] = useState('Plan a 3-step launch sprint for Even G2 + Telegram');
  const [targetTool, setTargetTool] = useState<
    'auto' | 'claude_cli' | 'codex_cli' | 'gemini_cli' | 'ollama' | 'openrouter' | 'workspace_test'
  >('auto');
  const [meetingAsk, setMeetingAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [studioMsg, setStudioMsg] = useState<string | null>(null);

  // LiveUI Micro-App + Read-Speed Pacer State
  const [liveUi, setLiveUi] = useState<LiveUiSurface | null>(null);
  const [pinnedApps, setPinnedApps] = useState<LiveUiSurface[]>([]);
  const [liveUiPrompt, setLiveUiPrompt] = useState('');
  const [readWpm, setReadWpm] = useState(220);
  const [aliveMood, setAliveMood] = useState<AliveMood>('neutral');
  const [pacedPreview, setPacedPreview] = useState<string>('');

  // Kanban Fleet + Watch Agent Screen + Silent Input + Specialist Role
  const [kanbanCards, setKanbanCards] = useState<KanbanCardDto[]>([]);
  const [watchScreen, setWatchScreen] = useState<WatchScreenDto | null>(null);
  const [silentChips, setSilentChips] = useState<SilentQuickChipDto[]>([]);
  const [newKanbanTitle, setNewKanbanTitle] = useState('');
  const [kanbanRole, setKanbanRole] = useState<'architect' | 'market_analyst' | 'bot_engineer' | 'security_auditor'>('architect');

  // Cited Knowledge RAG + Defuddle + Hermes Taste Profile + TOON/RTK Token Savings
  const [ragQuery, setRagQuery] = useState('');
  const [ragUrl, setRagUrl] = useState('');
  const [ragAnswer, setRagAnswer] = useState<{ answer: string; citations: Array<{ ref: string; title: string; source: string; excerpt: string }> } | null>(null);
  const [tasteVerbosity, setTasteVerbosity] = useState<'caveman' | 'concise' | 'detailed'>('caveman');
  const [tokenSavedPct, setTokenSavedPct] = useState<number>(0);
  const [tokenTotalSaved, setTokenTotalSaved] = useState<number>(0);

  // Market Research & Paper-Trading Bot State (research/paper only, Default-NO Telegram alert)
  const [marketSignals, setMarketSignals] = useState<Array<{
    symbol: string;
    name: string;
    priceUsd: number;
    change24hPct: number;
    rsiProxy: number;
    regime: string;
    suggestedAction: string;
    g2Line: string;
    source: string;
  }>>([]);
  const [marketBotCode, setMarketBotCode] = useState<string>('');
  const [selectedSymbol, setSelectedSymbol] = useState<'BTC' | 'ETH' | 'SOL' | 'TAO' | 'FET'>('BTC');

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
      const [compRes, memRes, liveRes, kbRes, tokRes, mktRes, prefRes] = await Promise.all([
        fetch('/api/computer/tools', { headers, credentials: 'include' }),
        fetch('/api/memory', { headers, credentials: 'include' }),
        fetch('/api/liveui', { headers, credentials: 'include' }),
        fetch('/api/kanban', { headers, credentials: 'include' }),
        fetch('/api/harness/tokens', { headers, credentials: 'include' }),
        fetch('/api/market/signals', { headers, credentials: 'include' }),
        fetch('/api/preferences', { headers, credentials: 'include' }),
      ]);
      if (compRes.ok) {
        const j = (await compRes.json()) as {
          tools: LocalToolInfoDto[];
          tasks: AgentTaskDto[];
          lastInspect?: SafeInspectDto | null;
        };
        setTools(j.tools ?? []);
        setTasks(j.tasks ?? []);
        if (j.lastInspect) setInspectRes(j.lastInspect);
      }
      if (memRes.ok) {
        const mj = (await memRes.json()) as { memories?: UnifiedMemoryDto[] };
        setLocalMemories(mj.memories ?? []);
      }
      if (liveRes.ok) {
        const lj = (await liveRes.json()) as {
          surface?: LiveUiSurface;
          pinned?: LiveUiSurface[];
          silentChips?: SilentQuickChipDto[];
        };
        if (lj.surface) setLiveUi(lj.surface);
        if (lj.pinned) setPinnedApps(lj.pinned);
        if (lj.silentChips) setSilentChips(lj.silentChips);
      }
      if (kbRes.ok) {
        const kj = (await kbRes.json()) as {
          cards?: KanbanCardDto[];
          screen?: WatchScreenDto;
          silentChips?: SilentQuickChipDto[];
        };
        if (kj.cards) setKanbanCards(kj.cards);
        if (kj.screen) setWatchScreen(kj.screen);
        if (kj.silentChips) setSilentChips(kj.silentChips);
      }
      if (tokRes.ok) {
        const tj = (await tokRes.json()) as {
          summary?: { estimatedSavedTokens?: number; reductionPct?: number };
        };
        setTokenTotalSaved(tj.summary?.estimatedSavedTokens ?? 0);
        setTokenSavedPct(tj.summary?.reductionPct ?? 0);
      }
      if (mktRes.ok) {
        const mkj = (await mktRes.json()) as { signals?: typeof marketSignals };
        if (mkj.signals) setMarketSignals(mkj.signals);
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
        setStudioMsg(j.inspect.summary);
      } else if (j.error) {
        setStudioMsg(j.error);
      }
    } finally {
      setBusy(false);
    }
  };

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
      const j = (await res.json()) as { surface?: LiveUiSurface; pinned?: LiveUiSurface[]; error?: string };
      if (j.surface) {
        setLiveUi(j.surface);
        if (j.pinned) setPinnedApps(j.pinned);
        onLiveUiUpdate?.(j.surface);
        setStudioMsg(`LiveUI "${j.surface.title}" pushed straight to your G2 glasses.`);
      } else if (j.error) {
        setStudioMsg(j.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const interactLiveUi = async (action: LiveUiInteraction) => {
    if (!sessionToken) return;
    const res = await fetch('/api/liveui/interact', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify(action),
    });
    const j = (await res.json()) as { surface?: LiveUiSurface };
    if (j.surface) {
      setLiveUi(j.surface);
      onLiveUiUpdate?.(j.surface);
    }
  };

  const pinCurrentLiveUi = async () => {
    if (!sessionToken) return;
    const res = await fetch('/api/liveui/pin', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: '{}',
    });
    const j = (await res.json()) as { pinned?: LiveUiSurface[] };
    if (j.pinned) setPinnedApps(j.pinned);
    onRefreshMemories?.();
    setStudioMsg('App pinned to G2 quick-launch & archived to Unified Memory.');
  };

  const runPacedDemo = () => {
    const sample =
      '<mood:confident/>Checking corridor now.<beat/><skim>Calendar and Telegram are clear.</skim><mood:curious/> <dwell>Ready to stage your next move whenever you tap.</dwell>';
    const parsed = parseDisplayMarkup(sample, readWpm);
    let elapsed = 0;
    const stepMs = 85;
    setPacedPreview('');
    const iv = setInterval(() => {
      elapsed += stepMs;
      const frame = stepPacedReveal(parsed, elapsed, readWpm);
      setPacedPreview(frame.visibleText);
      setAliveMood(frame.mood);
      if (frame.done) clearInterval(iv);
    }, stepMs);
  };

  const actOnKanban = async (id: string, action: 'approve' | 'retry' | 'schedule' | 'complete' | 'archive') => {
    if (!sessionToken) return;
    const res = await fetch('/api/kanban/action', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({ id, action }),
    });
    const j = (await res.json()) as { cards?: KanbanCardDto[] };
    if (j.cards) setKanbanCards(j.cards);
    if (action === 'complete') onRefreshMemories?.();
    void loadStudioState();
  };

  const addKanbanCard = async () => {
    if (!sessionToken || !newKanbanTitle.trim()) return;
    const res = await fetch('/api/kanban/create', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        title: newKanbanTitle.trim(),
        lane: 'needs_you',
        roleTemplate: kanbanRole,
      }),
    });
    const j = (await res.json()) as { cards?: KanbanCardDto[] };
    if (j.cards) setKanbanCards(j.cards);
    setNewKanbanTitle('');
  };

  const controlAgentScreen = async (
    action: 'takeover' | 'release' | 'click' | 'scroll_up' | 'scroll_down' | 'enter' | 'tab',
  ) => {
    if (!sessionToken) return;
    const res = await fetch('/api/screen/control', {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({ action }),
    });
    const j = (await res.json()) as { screen?: WatchScreenDto };
    if (j.screen) setWatchScreen(j.screen);
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
      setStudioMsg(`Defuddle ingested "${j.doc?.title ?? 'document'}" cleanly into RAG index.`);
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
    setStudioMsg(`Hermes Taste Profile updated: ${verbosity.toUpperCase()}.`);
  };

  const runMarketPaperTrade = async (symbol: 'BTC' | 'ETH' | 'SOL' | 'TAO' | 'FET') => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const res = await fetch('/api/market/paper-trade', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ symbol, notionalUsd: 500 }),
      });
      const j = (await res.json()) as { ok?: boolean; result?: { summary?: string; g2Line?: string } };
      if (j.result?.summary) setStudioMsg(j.result.summary);
      if (j.result?.g2Line && onLiveUiUpdate) {
        onLiveUiUpdate(makeG2TextSurface('mkt_paper', `${symbol} Paper Watch`, [j.result.g2Line]));
      }
      onRefreshMemories?.();
    } finally {
      setBusy(false);
    }
  };

  const generateMarketBot = async (symbol: 'BTC' | 'ETH' | 'SOL' | 'TAO' | 'FET') => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const res = await fetch('/api/market/bot-script', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ symbol }),
      });
      const j = (await res.json()) as { scriptPath?: string; code?: string; cards?: KanbanCardDto[] };
      if (j.code) setMarketBotCode(j.code);
      if (j.cards) setKanbanCards(j.cards);
      setStudioMsg(`Generated Python Signal Watcher -> ${j.scriptPath ?? `data/bots/market_${symbol.toLowerCase()}_bot.py`}`);
      void loadStudioState();
    } finally {
      setBusy(false);
    }
  };

  const stageMarketTelegramAlert = async (symbol: 'BTC' | 'ETH' | 'SOL' | 'TAO' | 'FET') => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const sig = marketSignals.find((s) => s.symbol === symbol);
      const res = await fetch('/api/telegram/automate', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          action: 'market_alert',
          text: sig ? `${sig.symbol} $${sig.priceUsd} · RSI ${sig.rsiProxy} · ${sig.suggestedAction}` : `${symbol} Signal Watch`,
        }),
      });
      const j = (await res.json()) as { generatedText?: string };
      setStudioMsg(`Default-NO Telegram market alert staged (Hold YES to send): ${j.generatedText ?? symbol}`);
    } finally {
      setBusy(false);
    }
  };

  const triggerSilentChip = async (chip: SilentQuickChipDto) => {
    setAliveMood('amused');
    if (chip.kind === 'liveui') {
      setStudioTab('apps');
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

  const liveUiEnv = liveUi ? buildSurfaceEnv(liveUi) : {};
  const g2Preview = liveUi ? formatLiveUiForG2(liveUi) : null;

  return (
    <div className="retro-glass-well p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-pixel text-[10px] uppercase tracking-[0.18em] text-[var(--g2-phosphor)]">
            VOICE · LIVE APPS · FLEET
          </span>
          <span className="font-pixel text-[9px] uppercase px-2 py-0.5 rounded-full border border-white/15 text-[var(--lightgray)]">
            {tools.filter((t) => t.installed).length}/{tools.length || 8} PC TOOLS
          </span>
          <span className="font-pixel text-[9px] uppercase px-2 py-0.5 rounded-full border border-[var(--g2-phosphor)]/40 text-[var(--g2-phosphor)] bg-[var(--g2-phosphor)]/5">
            AI: {activeLlmProvider || 'Auto'}
          </span>
          <span className="font-pixel text-[9px] uppercase px-2 py-0.5 rounded-full border border-[#86FFAF]/40 text-[#86FFAF] bg-[#86FFAF]/5">
            TOON/RTK: {tokenSavedPct > 0 ? `-${tokenSavedPct}% (${tokenTotalSaved} tok)` : 'ARMED'}
          </span>
        </div>

        <div className="flex flex-wrap gap-1 rounded-[10px] border border-white/10 bg-black/70 p-1 text-[10px] font-pixel uppercase">
          {(
            [
              ['call', 'Voice & Tasks'],
              ['apps', 'Live Apps'],
              ['fleet', 'Agent Fleet'],
              ['market', 'Market Bot'],
              ['explainer', 'Explainer'],
              ['notes', 'Meeting Notes'],
              ['computer', 'PC Tools'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStudioTab(id)}
              className={`px-2.5 py-1 rounded-[7px] cursor-pointer transition-colors ${
                studioTab === id
                  ? 'bg-[var(--lime)] text-[#041209] font-bold'
                  : 'text-[var(--lightgray)] hover:text-[var(--bright)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {studioTab === 'call' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Col 1: JJK Alive Engine Avatar + Duplex Mic + R1 Controls + Quiet Silent Chips */}
          <div className="lg:col-span-4 space-y-2.5">
            <OnQVoiceOrb
              state={orbState}
              rmsLevel={rmsLevel}
              activeWord={activeSpokenWord}
              armProgress01={armProgress01}
              engineLabel={voiceEngineLabel}
              latencyMs={voiceLatencyMs}
              backchannelText={backchannelText}
              aliveMood={aliveMood}
            />
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={onToggleMic}
                className={`flex-1 px-3 py-2 font-semibold cursor-pointer ${
                  micActive
                    ? 'bg-[var(--danger)] text-[#0a0a0a]'
                    : 'bg-[var(--g2-phosphor)] text-[#041209]'
                }`}
              >
                {micActive ? 'End Call' : 'Talk Hands-Free'}
              </button>
              <div
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-1.5 py-1"
                role="group"
                aria-label="Even R1 ring controls"
              >
                <button
                  type="button"
                  onClick={() => onRingEvent('SCROLL_UP')}
                  className="px-1.5 py-0.5 text-[10px] hover:text-[var(--g2-phosphor)] cursor-pointer"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => onRingEvent('CLICK')}
                  className="px-1.5 py-0.5 text-[10px] bg-white/10 rounded text-[var(--bright)] hover:text-[var(--g2-phosphor)] cursor-pointer"
                >
                  Tap
                </button>
                <button
                  type="button"
                  onClick={() => onRingEvent('SCROLL_DOWN')}
                  className="px-1.5 py-0.5 text-[10px] hover:text-[var(--g2-phosphor)] cursor-pointer"
                >
                  Down
                </button>
                <button
                  type="button"
                  onClick={() => onRingEvent('DOUBLE_CLICK')}
                  className="px-1.5 py-0.5 text-[10px] text-[var(--danger)] hover:underline cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>

            {/* Quiet Room Silent Input (no speaking required) */}
            {silentChips.length > 0 && (
              <div className="border border-white/10 bg-black/50 p-2 space-y-1.5">
                <div className="font-pixel text-[8.5px] uppercase tracking-wider text-[var(--lightgray)]">
                  QUIET ROOM TAP INPUT (NO VOICE NEEDED)
                </div>
                <div className="flex flex-wrap gap-1">
                  {silentChips.slice(0, 4).map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => void triggerSilentChip(chip)}
                      className="px-2 py-0.5 border border-[#34f57e]/25 bg-[#04140b] text-[10px] text-[#86FFAF] hover:bg-[#34F57E] hover:text-[#041209] cursor-pointer transition-colors"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                  ['YOUTUBE_SCOUT', 'Find AI YouTube videos', 'Find top AI engineering videos to watch on YouTube'],
                  ['WRITE_CODE_BOT', 'Build 24/7 Python bot', 'Write a 24/7 Python bot to scout top AI YouTube videos'],
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
                onClick={() => onRunCommand('Push 15m and tell Priya')}
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
                            {expandedCodeId === tk.id ? 'Hide script' : 'View generated Python bot'}
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
              <Memory3DGalaxy memories={memories as Array<{ id: string; kind: 'task' | 'meeting' | 'email' | 'telegram' | 'note'; title: string; summary: string; source: string; createdAtIso: string }>} />
            ) : (
              <>
                <div className="flex items-center justify-between gap-1.5 border border-white/10 bg-black/50 px-2 py-1 text-[10px]">
                  <span className="font-pixel text-[8px] uppercase text-[var(--lightgray)]">TASTE:</span>
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
                        {modeOption}
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
                    aria-label="Ask Cited RAG"
                    placeholder="Cited QA (RAGFlow/GBrain)..."
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
                    aria-label="Ingest docs URL with Defuddle"
                    placeholder="Defuddle URL -> RAG index..."
                    value={ragUrl}
                    onChange={(e) => setRagUrl(e.target.value)}
                    className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--bright)] focus:border-[#86FFAF]"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-2 py-1 border border-[#86FFAF]/40 text-[#86FFAF] font-pixel text-[8.5px] cursor-pointer"
                  >
                    Defuddle
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

      {studioTab === 'apps' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start text-xs">
          {/* Left: Ask-to-Build LiveUI Micro-App + Presets + Read-Speed Pacer */}
          <div className="lg:col-span-6 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                ['pomodoro', 'Pomodoro 25m'],
                ['split_bill', 'Split Bill 4x'],
                ['compare_models', 'Model Matrix'],
                ['reaction_game', 'G2 Reflex Game'],
                ['launch_checklist', 'Ship Checklist'],
              ].map(([presetKey, label]) => (
                <button
                  key={presetKey}
                  type="button"
                  disabled={busy}
                  onClick={() => void generateLiveUiApp({ presetKey })}
                  className={`px-2.5 py-1 border text-[10.5px] cursor-pointer ${
                    liveUi?.presetKey === presetKey
                      ? 'border-[#34F57E] bg-[#34F57E] text-[#041209] font-semibold'
                      : 'border-white/15 bg-black/60 text-[var(--bright)] hover:border-[#34F57E]/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!liveUiPrompt.trim()) return;
                void generateLiveUiApp({ prompt: liveUiPrompt.trim() });
                setLiveUiPrompt('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="Ask for any G2 app, timer, split calculator, checklist or game..."
                value={liveUiPrompt}
                onChange={(e) => setLiveUiPrompt(e.target.value)}
                className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-3.5 py-2 bg-[var(--lime)] text-[#041209] font-semibold cursor-pointer"
              >
                Build on G2
              </button>
            </form>

            {liveUi && (
              <div className="border border-[#34f57e]/35 bg-black/70 p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-pixel text-[9px] text-[#34F57E]">
                      LIVEUI FRAME: {liveUi.frame.toUpperCase()}
                    </div>
                    <div className="text-sm font-semibold text-[var(--bright)]">{liveUi.title}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void pinCurrentLiveUi()}
                    className="px-2.5 py-1 border border-[#34f57e]/45 text-[10px] text-[#86FFAF] hover:bg-[#34F57E] hover:text-[#041209] cursor-pointer"
                  >
                    Pin ({pinnedApps.length})
                  </button>
                </div>

                {/* Interactive Components */}
                {liveUi.components.map((comp) => (
                  <div key={comp.id} className="space-y-1.5 border-t border-dashed border-white/10 pt-2">
                    {comp.kind === 'stepper' && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--bright)]">{comp.label ?? comp.id}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void interactLiveUi({ type: 'step', delta: -(comp.stepBy ?? 1) })}
                            className="px-2.5 py-1 border border-white/20 bg-black text-[var(--bright)] cursor-pointer"
                          >
                            -
                          </button>
                          <span className="font-pixel text-sm text-[#34F57E]">{comp.value ?? 0}</span>
                          <button
                            type="button"
                            onClick={() => void interactLiveUi({ type: 'step', delta: comp.stepBy ?? 1 })}
                            className="px-2.5 py-1 border border-white/20 bg-black text-[var(--bright)] cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}

                    {(comp.kind === 'checklist' || comp.kind === 'list' || comp.kind === 'table') && comp.rows && (
                      <div className="space-y-1">
                        {comp.kind === 'table' && comp.cols && (
                          <div className="flex items-center gap-2 pb-1">
                            {comp.cols.slice(0, 3).map((col) => (
                              <button
                                key={col}
                                type="button"
                                onClick={() => void interactLiveUi({ type: 'sort_toggle', col })}
                                className="font-pixel text-[8.5px] uppercase px-2 py-0.5 border border-white/15 text-[#86FFAF] cursor-pointer"
                              >
                                Sort: {col}
                              </button>
                            ))}
                          </div>
                        )}
                        {comp.rows.map((row, idx) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => void interactLiveUi({ type: 'tap', index: idx })}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 border text-left cursor-pointer ${
                              idx === (comp.selectedIndex ?? 0)
                                ? 'border-[#34F57E] bg-[#041d0e] text-[#86FFAF]'
                                : 'border-white/10 bg-black/40 text-[var(--bright)]'
                            }`}
                          >
                            <span className="truncate">
                              {comp.kind === 'checklist' ? (row.checked ? '[x] ' : '[ ] ') : ''}
                              {row.raw[0]}
                            </span>
                            {row.raw[1] && <span className="font-mono text-[10px] text-[#34F57E] ml-2">{row.raw[1]}</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {comp.kind === 'timer' && comp.timer && (
                      <div className="flex items-center justify-between gap-2 bg-[#041209] border border-[#34F57E]/30 px-3 py-2">
                        <div>
                          <div className="font-pixel text-[9px] text-[var(--lightgray)]">{comp.label}</div>
                          <div className="font-dots text-xl text-[#34F57E]">
                            {formatFormulaValue(comp.timer.remainingSec, 'dur')}
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void interactLiveUi({ type: 'timer_toggle' })}
                            className="px-2.5 py-1 bg-[#34F57E] text-[#041209] font-semibold cursor-pointer"
                          >
                            {comp.timer.status === 'running' ? 'Pause' : 'Start'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void interactLiveUi({ type: 'timer_reset' })}
                            className="px-2.5 py-1 border border-white/20 text-[var(--bright)] cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    )}

                    {comp.kind === 'facts' && comp.facts && (
                      <div className="grid grid-cols-2 gap-2">
                        {comp.facts.map((f) => (
                          <div key={f.label} className="border border-white/10 bg-black/50 p-2">
                            <div className="text-[10px] text-[var(--lightgray)]">{f.label}</div>
                            <div className="font-mono text-xs text-[#34F57E] font-semibold">
                              {formatFormulaValue(evaluateSafeFormula(f.valueExpr, liveUiEnv), f.fmt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Live 576x288 G2 Lens Projection + Read-Speed Pacing Engine */}
          <div className="lg:col-span-6 space-y-3">
            {g2Preview && (
              <div className="border border-[#34f57e]/45 bg-[#020804] p-3.5 space-y-2">
                <div className="flex items-center justify-between text-[9px] font-pixel text-[#34F57E]">
                  <span>PUSHED TO G2 WAVEGUIDE (576x288)</span>
                  <span>{g2Preview.lines.length}/7 LINES</span>
                </div>
                <pre className="font-mono text-[11px] leading-relaxed text-[#34F57E] overflow-x-auto">
                  {g2Preview.bodyText}
                </pre>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void interactLiveUi({ type: 'prev_row' })}
                    className="px-2.5 py-1 border border-white/15 text-[10px] text-[var(--bright)] cursor-pointer"
                  >
                    R1 Swipe Up
                  </button>
                  <button
                    type="button"
                    onClick={() => void interactLiveUi({ type: 'tap' })}
                    className="px-2.5 py-1 bg-[#34F57E] text-[#041209] font-semibold text-[10px] cursor-pointer"
                  >
                    R1 Tap Select
                  </button>
                  <button
                    type="button"
                    onClick={() => void interactLiveUi({ type: 'next_row' })}
                    className="px-2.5 py-1 border border-white/15 text-[10px] text-[var(--bright)] cursor-pointer"
                  >
                    R1 Swipe Down
                  </button>
                </div>
              </div>
            )}

            <div className="border border-white/10 bg-black/55 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-pixel text-[9px] text-[#86FFAF]">
                  NATURAL READ-SPEED PACING ({readWpm} WPM · &lt;dwell&gt; / &lt;beat/&gt;)
                </span>
                <button
                  type="button"
                  onClick={runPacedDemo}
                  className="px-2.5 py-1 border border-[#34f57e]/40 text-[#34F57E] text-[10px] cursor-pointer"
                >
                  Test Paced Stream
                </button>
              </div>
              <input
                type="range"
                min={140}
                max={360}
                step={20}
                value={readWpm}
                aria-label="Glasses reading speed WPM"
                onChange={(e) => setReadWpm(Number(e.target.value))}
                className="w-full accent-[#34F57E]"
              />
              <div className="min-h-[38px] font-mono text-[11px] text-[#86FFAF] bg-[#030b06] border border-white/10 p-2">
                {pacedPreview || 'Replies pace word-by-word at your glasses reading speed with <beat/> pauses and JJK mood shifts.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {studioTab === 'fleet' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start text-xs">
          {/* Left: 4-Lane Multi-Agent Kanban Board */}
          <div className="lg:col-span-7 space-y-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addKanbanCard();
              }}
              className="flex flex-wrap gap-2"
            >
              <select
                aria-label="Specialist agent role"
                value={kanbanRole}
                onChange={(e) => setKanbanRole(e.target.value as typeof kanbanRole)}
                className="bg-[var(--ink)] border border-[var(--hairline)] px-2 py-1.5 text-[11px] text-[var(--bright)]"
              >
                <option value="architect">Architect</option>
                <option value="market_analyst">Market Quant</option>
                <option value="bot_engineer">Bot Engineer</option>
                <option value="security_auditor">Security Guard</option>
              </select>
              <input
                type="text"
                placeholder="Assign new Kanban job to agent team..."
                value={newKanbanTitle}
                onChange={(e) => setNewKanbanTitle(e.target.value)}
                className="flex-1 min-w-[160px] bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--lime)] text-[#041209] font-semibold cursor-pointer"
              >
                + Add Card
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['needs_you', 'running', 'scheduled', 'done'] as const).map((lane) => {
                const laneCards = kanbanCards.filter((c) => c.lane === lane);
                return (
                  <div key={lane} className="border border-white/10 bg-black/50 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between font-pixel text-[8.5px] uppercase text-[#34F57E]">
                      <span>{lane.replace('_', ' ')}</span>
                      <span>{laneCards.length}</span>
                    </div>
                    {laneCards.slice(0, 3).map((card) => (
                      <div key={card.id} className="border border-white/10 bg-[#040d07] p-2 space-y-1">
                        <div className="font-medium text-[11px] text-[var(--bright)] truncate">{card.title}</div>
                        <div className="text-[9.5px] text-[var(--lightgray)] truncate">
                          {card.agentName} · {card.cronSpec ?? card.model}
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {card.lane === 'needs_you' && (
                            <button
                              type="button"
                              onClick={() => void actOnKanban(card.id, 'approve')}
                              className="px-2 py-0.5 bg-[#34F57E] text-[#041209] font-pixel text-[8px] cursor-pointer"
                            >
                              Approve
                            </button>
                          )}
                          {card.lane !== 'scheduled' && (
                            <button
                              type="button"
                              onClick={() => void actOnKanban(card.id, 'schedule')}
                              className="px-2 py-0.5 border border-white/20 text-[9px] text-[var(--bright)] cursor-pointer"
                            >
                              24/7 Cron
                            </button>
                          )}
                          {card.lane !== 'done' && (
                            <button
                              type="button"
                              onClick={() => void actOnKanban(card.id, 'complete')}
                              className="px-2 py-0.5 border border-[#34f57e]/35 text-[9px] text-[#86FFAF] cursor-pointer"
                            >
                              Done
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Watch Agent Screen + Glasses Pointer Human Takeover */}
          <div className="lg:col-span-5 border border-[#34f57e]/35 bg-[#020804] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-pixel text-[9px] text-[#34F57E]">WATCH AGENT WORK · LIVE SCREEN</div>
                <div className="text-[11px] text-[var(--bright)]">{watchScreen?.appName ?? 'Local Agent Sandbox'}</div>
              </div>
              <span
                className={`font-pixel text-[8px] px-2 py-0.5 rounded ${
                  watchScreen?.holder === 'human'
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                    : 'bg-[#34f57e]/15 text-[#34F57E] border border-[#34f57e]/40'
                }`}
              >
                {watchScreen?.holder === 'human' ? `HUMAN LEASE #${watchScreen.leaseEpoch}` : 'AGENT DRIVING'}
              </span>
            </div>

            <div className="relative rounded border border-white/10 bg-black p-2.5 font-mono text-[10px] text-[#86FFAF] space-y-0.5">
              {(watchScreen?.lines ?? []).map((line, i) => (
                <div key={i} className="truncate">
                  {line}
                </div>
              ))}
              {watchScreen && (
                <div className="mt-1.5 border border-[#34F57E]/60 bg-[#051a0d] px-2 py-1 text-[9.5px] text-[#34F57E]">
                  CURSOR ({watchScreen.cursor.x}, {watchScreen.cursor.y}): [{watchScreen.cursor.targetLabel}]
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {watchScreen?.holder !== 'human' ? (
                <button
                  type="button"
                  onClick={() => void controlAgentScreen('takeover')}
                  className="px-2.5 py-1 bg-[#34F57E] text-[#041209] font-semibold text-[10.5px] cursor-pointer"
                >
                  Take Over w/ Glasses
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void controlAgentScreen('release')}
                  className="px-2.5 py-1 border border-white/25 text-[var(--bright)] text-[10.5px] cursor-pointer"
                >
                  Release Back to Agent
                </button>
              )}
              <button
                type="button"
                onClick={() => void controlAgentScreen('scroll_down')}
                className="px-2 py-1 border border-white/15 text-[10px] text-[var(--bright)] cursor-pointer"
              >
                Next Target
              </button>
              <button
                type="button"
                onClick={() => void controlAgentScreen('click')}
                className="px-2 py-1 border border-[#34f57e]/45 text-[10px] text-[#86FFAF] cursor-pointer"
              >
                Click Target
              </button>
            </div>
          </div>
        </div>
      )}

      {studioTab === 'market' && (
        <div className="space-y-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]">
                AI MARKET RESEARCH &amp; PAPER BOT WATCHER
              </span>
              <p className="text-[11px] text-[var(--lightgray)]">
                Research &amp; paper simulation only (zero auto-execution). Telegram alerts require explicit Hold-YES approval.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['BTC', 'ETH', 'SOL', 'TAO', 'FET'] as const).map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setSelectedSymbol(sym)}
                  className={`px-2.5 py-1 font-pixel text-[9px] cursor-pointer ${
                    selectedSymbol === sym
                      ? 'bg-[var(--g2-phosphor)] text-[#041209] font-bold'
                      : 'retro-btn-glass text-[var(--bright)]'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {marketSignals.map((sig) => (
              <button
                key={sig.symbol}
                type="button"
                onClick={() => setSelectedSymbol(sig.symbol as typeof selectedSymbol)}
                className={`text-left border p-2.5 bg-black/55 space-y-1 cursor-pointer transition-colors ${
                  selectedSymbol === sig.symbol ? 'border-[var(--g2-phosphor)]' : 'border-white/10 hover:border-white/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-pixel text-[10px] text-[var(--bright)]">{sig.symbol}</span>
                  <span className={`font-pixel text-[8.5px] ${sig.change24hPct >= 0 ? 'text-[#34F57E]' : 'text-amber-300'}`}>
                    {sig.change24hPct >= 0 ? '+' : ''}{sig.change24hPct}%
                  </span>
                </div>
                <div className="font-mono text-sm text-[var(--lime)]">${sig.priceUsd.toLocaleString()}</div>
                <div className="font-pixel text-[8px] text-[var(--lightgray)]">
                  RSI {sig.rsiProxy} · {sig.suggestedAction}
                </div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runMarketPaperTrade(selectedSymbol)}
              className="retro-btn-primary px-3.5 py-1.5 font-semibold cursor-pointer"
            >
              Simulate Paper Watch ($500 {selectedSymbol})
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void generateMarketBot(selectedSymbol)}
              className="retro-btn-glass px-3.5 py-1.5 text-[var(--g2-phosphor)] font-semibold cursor-pointer"
            >
              Generate Python Bot ({selectedSymbol})
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void stageMarketTelegramAlert(selectedSymbol)}
              className="retro-btn-glass px-3.5 py-1.5 text-[#86FFAF] font-semibold cursor-pointer"
            >
              Stage Telegram Alert (Default-NO)
            </button>
            {onLiveUiUpdate && (
              <button
                type="button"
                onClick={() => {
                  const sig = marketSignals.find((s) => s.symbol === selectedSymbol);
                  onLiveUiUpdate(
                    makeG2TextSurface('mkt_g2', `${selectedSymbol} Watch`, [
                      sig?.g2Line ?? `${selectedSymbol} SIGNAL READY | PAPER ONLY`,
                    ]),
                  );
                }}
                className="retro-btn-glass px-3.5 py-1.5 text-[var(--bright)] cursor-pointer"
              >
                Push Ticker to G2 Lens
              </button>
            )}
          </div>

          {marketBotCode && (
            <pre className="border border-dashed border-[var(--g2-phosphor)]/40 bg-black p-3 font-mono text-[10px] text-[#86FFAF] overflow-x-auto max-h-44">
              {marketBotCode}
            </pre>
          )}
        </div>
      )}

      {studioTab === 'explainer' && (
        <ExplainerStudio
          sessionToken={sessionToken}
          activeLlmProvider={activeLlmProvider || 'Auto'}
          onSyncToG2={(lines) =>
            onLiveUiUpdate?.(makeG2TextSurface('explainer_g2', 'Explainer Beat', lines))
          }
        />
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

      {studioTab === 'computer' && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['git_status', 'Check Git Status'],
                ['git_log', 'Recent Commits'],
                ['gh_prs', 'Open GitHub PRs'],
                ['workspace_summary', 'Project Files'],
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
                    {t.installed ? 'READY' : 'OFFLINE'}
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
              <option value="openrouter">OpenRouter</option>
              <option value="workspace_test">Git Check</option>
              <option value="claude_cli">Claude Code CLI</option>
              <option value="codex_cli">Codex CLI (ChatGPT)</option>
              <option value="gemini_cli">Gemini CLI</option>
              <option value="ollama">Ollama Local</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void triggerAutonomousTask('PLAN_PROJECT', taskPrompt)}
              className="px-4 py-2 bg-[var(--lime)] text-[#041209] font-semibold cursor-pointer whitespace-nowrap"
            >
              Stage Task
            </button>
          </div>

          {inspectRes && (
            <div className="border border-dashed border-[var(--hairline)] bg-[var(--ink)] p-3 space-y-1">
              <div className="font-pixel text-[9px] text-[var(--g2-phosphor)]">
                {inspectRes.kind.toUpperCase()} · {inspectRes.latencyMs}ms
              </div>
              <div className="text-[var(--bright)]">{inspectRes.summary}</div>
              {inspectRes.lines.slice(0, 4).map((l, i) => (
                <div key={i} className="font-plex text-[10.5px] text-[var(--lightgray)] truncate">
                  {l}
                </div>
              ))}
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
