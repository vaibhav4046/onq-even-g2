import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  createInitialHudState,
  encodePcm16ToWav,
  OnQHudController,
} from '@onq/core';
import type {
  ActionPreview,
  CommitReceipt,
  ConflictLockDetail,
  CorridorCard,
  HudState,
  MeetingSessionState,
  SourceMode,
  TtsWordBoundary,
  VoiceOrbState,
} from '@onq/core';
import {
  ApplePixelTile,
  AssemblyAiPixelSvg,
  CalendarPixelSvg,
  ChatGptPixelSvg,
  ClaudePixelSvg,
  DrivePixelSvg,
  EvenG2PixelSvg,
  GmailPixelSvg,
  NotionPixelSvg,
  OpenRouterPixelSvg,
  ShieldPixelSvg,
  TelegramPixelSvg,
} from './components/EcosystemIcons';
import { ConnectorsHub } from './components/ConnectorsHub';
import { VERIFIED_TEST_COUNT } from './verifiedCounts';
// Three.js + R3F load in their own chunk so the first paint never waits on WebGL code.
const G2Hardware3D = lazy(() => import('./components/G2Hardware3D').then((m) => ({ default: m.G2Hardware3D })));
// Canvas motion lives in its own chunk so it never counts against the entry bundle.
const BinaryField = lazy(() => import('./components/BinaryField').then((m) => ({ default: m.BinaryField })));
const BinaryMotionToggle = lazy(() => import('./components/BinaryField').then((m) => ({ default: m.BinaryMotionToggle })));
const LoopSection = lazy(() => import('./components/LoopSection').then((m) => ({ default: m.LoopSection })));

/** Same height the loop section pins to, so the page below does not jump when the chunk arrives. */
function LoopPlaceholder() {
  const reducedNow = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return <div aria-hidden="true" style={{ height: reducedNow ? '60rem' : '340vh' }} />;
}
import { G2LensCanvas } from './components/G2LensCanvas';
import { startBrowserMicCapture } from './components/MicRecorder';
import type { MicRecordingHandle } from './components/MicRecorder';
import { GlyphDecodeHeading, MOTION_EASE, ScrollProgressRail, ScrollReveal } from './components/MotionPrimitives';
import { ArchitectureShowcase } from './components/ArchitectureShowcase';
import { LiveVoiceStudio } from './components/LiveVoiceStudio';
import type { UnifiedMemoryDto } from './components/LiveVoiceStudio';
import { OnQLogo } from './components/OnQLogo';
import { OnQVoiceOrb } from './components/OnQVoiceOrb';
import { PhosphorMeshShader } from './components/PhosphorMeshShader';
import { ResearchGraphsSection } from './components/ResearchGraphsSection';
import { StickySafetyStory } from './components/StickySafetyStory';
import { ClipCards, DayStory, ProofStrip } from './components/LandingStory';

interface ProactiveInsight {
  id: string;
  atIso: string;
  category: 'MEETING' | 'INBOX' | 'NOTION' | 'TELEGRAM' | 'COMPUTER' | 'HEALTH';
  severity: 'info' | 'action' | 'warn';
  title: string;
  detail: string;
  suggestedCommand?: string;
}

interface ProactiveHarnessStep {
  id: string;
  phase: string;
  tool: string;
  detail: string;
  status: string;
}

interface SelfGeneratedHarness {
  harnessId: string;
  generatedAtIso?: string;
  triggerCategory?: string;
  goal: string;
  rationale: string;
  orchestratorUsed: string;
  fallbackUsed: boolean;
  suggestedCommand: string;
  opticalCardLines: string[];
  steps: ProactiveHarnessStep[];
  defaultNoRequired: boolean;
  codeGuardPassed: boolean;
}

interface ProactiveHarnessStatus {
  running: boolean;
  intervalMs: number;
  pulseCount: number;
  lastPulseAtIso: string | null;
  insights: ProactiveInsight[];
  activeHarness?: SelfGeneratedHarness | null;
  harnessCount?: number;
}

interface SnapshotState {
  calendarEvents: Array<{
    eventId: string;
    title: string;
    startIso: string;
    endIso: string;
    attendeeName?: string;
  }>;
  gmailThreads: Array<{
    threadId: string;
    fromName: string;
    fromEmail: string;
    snippet: string;
    sentMessages: Array<{ to: string; body: string; atIso: string; mode: string }>;
  }>;
  notionTasks: Array<{
    pageId: string;
    title: string;
    completed: boolean;
    schemaType: string;
  }>;
}

interface AuditEventItem {
  id: string;
  atIso: string;
  kind: string;
  detail: string;
}

const GEOMETRY_SAMPLE_CARD: CorridorCard = {
  id: 'card-vc-priya',
  sourceMode: 'DEMO',
  syncedAtIso: '2026-11-24T13:48:00.000Z',
  provenanceLabel: 'SANDBOX',
  kind: 'MEETING',
  title: 'Investor call',
  timeMeta: '14:00 (12m)',
  startIso: '2026-11-24T14:00:00.000Z',
  endIso: '2026-11-24T14:30:00.000Z',
  contextLine1: 'Can we push 15m? Q4 deck ready?',
  contextLine2: 'Q4_Metrics_v3 (Drive) | 2 comments',
  triageRule: 'IMMINENT_MTG',
  etag: 'etag-1',
  quickActions: [
    {
      id: 'qa1',
      label: 'Push 15m + Reply Investor',
      intent: 'RESCHEDULE_AND_NOTIFY',
      commandText: 'Push 15m and tell Investor',
    },
    {
      id: 'qa2',
      label: 'Move 14:45 (Test 409 Lock)',
      intent: 'RESCHEDULE_AND_NOTIFY',
      commandText: 'Move VC sync to 14:45',
    },
  ],
};

function buildGeometryState(stateName: string): HudState {
  const base = createInitialHudState([GEOMETRY_SAMPLE_CARD], 'DEMO');
  const preview: ActionPreview = {
    previewToken: 'pt_geo',
    idempotencyKey: '9f2a11223344',
    expiresAtIso: new Date(Date.now() + 42_000).toISOString(),
    intent: 'RESCHEDULE_AND_NOTIFY',
    defaultSelection: 'NO',
    summaryLines: [
      '1) GCAL: 14:00 -> 14:15 (SLOT FREE)',
      '2) MAIL: Reply "Running 15m late"',
      '3) NOTION: Log shift to the meeting note',
    ],
    operations: [],
    safetyChecks: {
      calendarConflictFree: true,
      threadFresh: true,
      recipientVerified: true,
      factGuardPassed: true,
    },
  };
  switch (stateName) {
    case 'DETAIL':
      return { ...base, phase: 'detail' };
    case 'VOICE_LISTENING':
      return { ...base, phase: 'listening', rmsLevel: 0.68, transcript: 'Push 15m and tell Investor' };
    case 'PREVIEW_DEFAULT_NO':
      return { ...base, phase: 'preview', preview, previewSelection: 'NO' };
    case 'ARMED_RING':
      return { ...base, phase: 'armed', preview, armRemainingMs: 1250 };
    case 'CONFLICT_409':
      return {
        ...base,
        phase: 'conflict',
        conflict: {
          code: 'CONFLICT_CALENDAR_BUSY',
          message: '14:45 busy (Design Review)',
          nextFreeLabel: '15:45 (30m)',
        },
      };
    case 'RECEIPT_DONE':
      return {
        ...base,
        phase: 'done',
        receipt: {
          receiptId: 'REC-1042',
          idempotencyKey: '9f2a1122',
          committedAtIso: '2026-11-24T13:49:04.000Z',
          status: 'COMMITTED',
          sourceMode: 'DEMO',
          summaryLines: [
            'OK GCAL: 14:00->14:15 GMT',
            'OK MAIL: Reply sent',
            'OK NOTION: Logged shift',
          ],
          operations: [],
          canUndo: true,
        },
      };
    case 'STALE_OFFLINE':
      return { ...base, phase: 'stale', sourceMode: 'STALE', provenanceLabel: 'OFFLINE 3m AGO' };
    case 'EMPTY_ALL_CLEAR':
      return { ...base, phase: 'idle', cards: [] };
    case 'MEETING_LIVE':
      return {
        ...base,
        phase: 'meeting_live',
        meeting: {
          active: true,
          startedAtIso: '2026-11-24T13:55:00.000Z',
          elapsedSec: 252,
          speakerCount: 2,
          providerMode: 'DEMO_SANDBOX',
          attendees: ['Investor contact', 'Design lead'],
          turns: [
            {
              id: 't1',
              speakerLabel: 'Speaker A',
              attendeeName: 'You',
              text: 'Agreed: let us lock Q4 metrics for Thursday.',
              atIso: '2026-11-24T13:58:00.000Z',
              isWearer: true,
              isFinal: true,
            },
            {
              id: 't2',
              speakerLabel: 'Speaker B',
              attendeeName: 'Investor contact',
              text: 'Send Q4 deck to Partner contact by Thursday 15:00.',
              atIso: '2026-11-24T13:59:10.000Z',
              isWearer: false,
              isFinal: true,
            },
          ],
          decisions: [{ id: 'd1', summary: 'Lock Q4 metrics for Thursday', speaker: 'You', atIso: '2026-11-24T13:58:00.000Z' }],
          actions: [{ id: 'a1', title: 'Send Q4 deck to Partner contact', owner: 'Investor contact' }],
        },
      };
    case 'WRAP_UP':
      return {
        ...base,
        phase: 'wrap_up',
        preview: {
          ...preview,
          summaryLines: [
            '1) NOTION: Send Q4 deck to Partner contact',
            '2) GCAL: Follow-up 17:00 (30m)',
            '3) MAIL: Draft reply (Rules)',
          ],
        },
        previewSelection: 'NO',
      };
    default:
      return base;
  }
}

function makeSynthesizedWav(silent: boolean): Blob {
  const samples = 16000 * 0.5;
  const pcm = new Uint8Array(samples * 2);
  if (!silent) {
    const dv = new DataView(pcm.buffer);
    for (let i = 0; i < samples; i++) {
      dv.setInt16(i * 2, Math.round(Math.sin(i * 0.25) * 9000), true);
    }
  }
  return new Blob([new Uint8Array(encodePcm16ToWav(pcm, 16000))], { type: 'audio/wav' });
}

const HERO_WORDS = ['reply.', 'schedule.', 'plan.', 'remember.', 'confirm.'] as const;

export function App() {
  const reducedMotion = useReducedMotion();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const geometryMode = params.get('geometry') === '1';
  const geometryStateName = params.get('state') ?? 'DOSSIER';

  const [heroWordIdx, setHeroWordIdx] = useState(0);
  const [opticsMode] = useState<'waveguide' | 'raw'>('waveguide');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<'LIVE' | 'DEMO' | 'STALE'>('DEMO');
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [hudState, setHudState] = useState<HudState>(() =>
    geometryMode ? buildGeometryState(geometryStateName) : createInitialHudState([GEOMETRY_SAMPLE_CARD], 'DEMO'),
  );
  const [workspace, setWorkspace] = useState<SnapshotState | null>(null);
  const [receipts, setReceipts] = useState<CommitReceipt[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEventItem[]>([]);
  const [unifiedMemories, setUnifiedMemories] = useState<UnifiedMemoryDto[]>([]);
  const [externalTaskSeq, setExternalTaskSeq] = useState(0);
  const [commandInput, setCommandInput] = useState('Shift next meeting +15m and update thread');
  const [voiceFeedback, setVoiceFeedback] = useState<string>('Ready. Tap Talk Hands-Free or click any workflow.');
  const [simLoading, setSimLoading] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [lensPovOpen, setLensPovOpen] = useState(false);
  const [voiceEngineLabel, setVoiceEngineLabel] = useState('LOCAL VOICE');
  const [ttsVoiceId, setTtsVoiceId] = useState('aai-titus');
  const [speakingNow, setSpeakingNow] = useState(false);
  const [activeSpokenWord, setActiveSpokenWord] = useState('');
  const [voiceLatencyMs, setVoiceLatencyMs] = useState<number | null>(null);
  const [backchannelText, setBackchannelText] = useState<string | null>(null);
  const [meetingState, setMeetingState] = useState<MeetingSessionState | null>(null);
  const [thinkingNow, setThinkingNow] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<'schedule' | 'inbox' | 'notes' | 'activity'>('schedule');
  const [showTestTools, setShowTestTools] = useState(false);
  const [proactive, setProactive] = useState<ProactiveHarnessStatus | null>(null);
  const [activeLlmProvider, setActiveLlmProvider] = useState<string>('Auto');
  const [buildingHarness, setBuildingHarness] = useState(false);
  const [lensViewMode, setLensViewMode] = useState<'web' | 'sdk'>('web');
  const [emulatorRunning, setEmulatorRunning] = useState(false);
  const [emulatorTick, setEmulatorTick] = useState(() => Date.now());
  const [emulatorBusy, setEmulatorBusy] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Live workspace mutation inputs
  const [newBusyTitle, setNewBusyTitle] = useState('');
  const [newBusyTime, setNewBusyTime] = useState('14:15');
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = sessionToken;
  const ctrlRef = useRef<OnQHudController | null>(null);
  const micHandleRef = useRef<MicRecordingHandle | null>(null);
  const voiceWsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ttsTimersRef = useRef<number[]>([]);
  const speakingNowRef = useRef(false);
  speakingNowRef.current = speakingNow;
  const vadTimerRef = useRef<number | null>(null);
  const lastTranscriptRef = useRef('');
  const speechEndAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (geometryMode || reducedMotion) return;
    const id = window.setInterval(() => {
      setHeroWordIdx((i) => (i + 1) % HERO_WORDS.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, [geometryMode, reducedMotion]);

  useEffect(() => {
    let alive = true;
    const checkEmu = async () => {
      try {
        const res = await fetch('/api/emulator/status');
        if (res.ok && alive) {
          const j = (await res.json()) as { running?: boolean };
          setEmulatorRunning(Boolean(j.running));
        }
      } catch {
        if (alive) setEmulatorRunning(false);
      }
    };
    void checkEmu();
    if (lensViewMode !== 'sdk') return;
    const timer = window.setInterval(() => {
      void checkEmu();
      setEmulatorTick(Date.now());
    }, 900);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [lensViewMode]);

  const sendEmulatorInput = async (action: 'up' | 'down' | 'click' | 'double_click') => {
    const tok = tokenRef.current;
    if (!tok) return;
    setEmulatorBusy(true);
    try {
      const res = await fetch('/api/emulator/input', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tok}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setEmulatorRunning(true);
        window.setTimeout(() => setEmulatorTick(Date.now()), 320);
      } else {
        setVoiceFeedback(`EvenHub Emulator: HTTP ${res.status}`);
      }
    } finally {
      setEmulatorBusy(false);
    }
  };

  const refreshWorkspaceInspector = useCallback(async (tok: string) => {
    try {
      const [res, proRes, connRes, memRes] = await Promise.all([
        fetch('/api/workspace/state', {
          headers: { Authorization: `Bearer ${tok}` },
        }),
        fetch('/api/proactive/status', {
          headers: { Authorization: `Bearer ${tok}` },
        }),
        fetch('/api/connectors/status', {
          headers: { Authorization: `Bearer ${tok}` },
        }),
        fetch('/api/memory', {
          headers: { Authorization: `Bearer ${tok}` },
        }),
      ]);
      if (res.ok) {
        const json = (await res.json()) as {
          snapshot: SnapshotState;
          receipts: CommitReceipt[];
          auditLog?: AuditEventItem[];
        };
        setWorkspace(json.snapshot);
        setReceipts(json.receipts);
        if (json.auditLog) setAuditLog(json.auditLog);
      }
      if (proRes.ok) {
        setProactive((await proRes.json()) as ProactiveHarnessStatus);
      }
      if (connRes.ok) {
        const connJson = (await connRes.json()) as { activeLlmProvider?: string; accountEmail?: string | null };
        if (connJson.activeLlmProvider) setActiveLlmProvider(connJson.activeLlmProvider);
        setAccountEmail(connJson.accountEmail ?? null);
      }
      if (memRes.ok) {
        const memJson = (await memRes.json()) as { memories?: UnifiedMemoryDto[] };
        if (memJson.memories) setUnifiedMemories(memJson.memories);
      }
    } catch {
      // keep existing inspector state
    }
  }, []);

  const toggleProactiveWatch = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    const res = await fetch('/api/proactive/toggle', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ running: !(proactive?.running ?? true) }),
    });
    if (res.ok) setProactive((await res.json()) as ProactiveHarnessStatus);
  };

  const scanProactiveNow = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    const res = await fetch('/api/proactive/pulse', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.ok) setProactive((await res.json()) as ProactiveHarnessStatus);
  };

  const buildProactiveHarness = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    setBuildingHarness(true);
    try {
      const res = await fetch('/api/proactive/synthesize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        const status = (await res.json()) as ProactiveHarnessStatus;
        setProactive(status);
        if (status.activeHarness?.goal) {
          setVoiceFeedback(`Proactive harness ready (${status.activeHarness.orchestratorUsed}): ${status.activeHarness.goal}`);
        }
      }
    } finally {
      setBuildingHarness(false);
    }
  };

  const refreshCorridor = useCallback(async (tok: string) => {
    const res = await fetch('/api/corridor', {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      cards: CorridorCard[];
      sourceMode: SourceMode;
      provenanceLabel: string;
      syncedAtIso: string;
    };
    ctrlRef.current?.setCorridor(data.cards, data.sourceMode, data.provenanceLabel, data.syncedAtIso);
    setSessionMode(data.sourceMode);
    await refreshWorkspaceInspector(tok);
    return data;
  }, [refreshWorkspaceInspector]);

  useEffect(() => {
    if (geometryMode) return;

    const ctrl = new OnQHudController(createInitialHudState([GEOMETRY_SAMPLE_CARD], 'DEMO'), {
      onStateChange: (next) => setHudState({ ...next }),
      onRefreshCorridor: async () => {
        if (!tokenRef.current) throw new Error('No session');
        return refreshCorridor(tokenRef.current);
      },
      onStageAction: async (card, idx) => {
        const tok = tokenRef.current;
        if (!tok) throw new Error('No active session');
        const opt = card.quickActions[idx] ?? card.quickActions[0];
        const res = await fetch('/api/actions/stage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId: card.id, commandText: opt?.commandText ?? 'Push 15m and tell Investor' }),
        });
        return (await res.json()) as ActionPreview | ConflictLockDetail;
      },
      onStageSlot: async (slotStartIso, slotEndIso) => {
        const tok = tokenRef.current;
        if (!tok) throw new Error('No active session');
        const card = ctrlRef.current?.getState().cards[ctrlRef.current.getState().selectedCardIndex];
        const res = await fetch('/api/actions/stage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId: card?.id, slotStartIso, slotEndIso }),
        });
        return (await res.json()) as ActionPreview | ConflictLockDetail;
      },
      onCommitPreview: async (preview) => {
        const tok = tokenRef.current;
        if (!tok) throw new Error('No active session');
        const res = await fetch('/api/actions/commit', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ previewToken: preview.previewToken, idempotencyKey: preview.idempotencyKey }),
        });
        const data = (await res.json()) as CommitReceipt | ConflictLockDetail;
        await refreshCorridor(tok);
        if (res.status === 409) return data as ConflictLockDetail;
        return data as CommitReceipt;
      },
      onUndoReceipt: async (receipt) => {
        const tok = tokenRef.current;
        if (!tok) throw new Error('No active session');
        const res = await fetch('/api/actions/undo', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ idempotencyKey: receipt.idempotencyKey }),
        });
        const undone = (await res.json()) as CommitReceipt;
        await refreshCorridor(tok);
        return undone;
      },
      onRequestShutdown: () => {
        setVoiceFeedback('Exit gate triggered: shutDownPageContainer(1) invoked on G2.');
      },
    });
    ctrlRef.current = ctrl;

    let cancelled = false;
    (async () => {
      setSimLoading(true);
      try {
        try {
          const hRes = await fetch('/api/health');
          if (hRes.ok) {
            const hJson = (await hRes.json()) as { voiceEngine?: string };
            if (!cancelled && hJson.voiceEngine) setVoiceEngineLabel(hJson.voiceEngine);
          }
        } catch {
          // ignore
        }
        let bootedToken: string | null = null;
        let bootedMode: SourceMode = 'DEMO';
        try {
          const meRes = await fetch('/api/auth/me', { credentials: 'include' });
          if (meRes.ok) {
            const me = (await meRes.json()) as {
              authenticated?: boolean;
              sessionToken?: string;
              mode?: SourceMode;
            };
            if (me.authenticated && me.sessionToken) {
              bootedToken = me.sessionToken;
              bootedMode = me.mode ?? 'LIVE';
            }
          }
        } catch {
          // ignore
        }
        if (!bootedToken) {
          const res = await fetch('/api/demo/session', { method: 'POST', credentials: 'include' });
          if (!res.ok) throw new Error('Relay unavailable');
          const json = (await res.json()) as { sessionToken: string; mode?: SourceMode };
          bootedToken = json.sessionToken;
          bootedMode = json.mode ?? 'DEMO';
        }
        if (cancelled) return;
        tokenRef.current = bootedToken;
        setSessionToken(bootedToken);
        setSessionMode(bootedMode);
        await refreshCorridor(bootedToken);
      } catch {
        if (!cancelled) {
          setWorkspace({
            calendarEvents: [
              {
                eventId: 'evt-vc-priya',
                title: 'Investor call',
                startIso: '2026-11-24T14:00:00.000Z',
                endIso: '2026-11-24T14:30:00.000Z',
                attendeeName: 'Investor contact',
              },
              {
                eventId: 'evt-design-busy',
                title: 'Design Review (Busy Lock)',
                startIso: '2026-11-24T14:45:00.000Z',
                endIso: '2026-11-24T15:15:00.000Z',
                attendeeName: 'Partner contact',
              },
            ],
            gmailThreads: [
              {
                threadId: 'thr-priya-1',
                fromName: 'Investor contact',
                fromEmail: 'investor@sample.example',
                snippet: 'Can we push 15m? Q4 deck ready?',
                sentMessages: [],
              },
            ],
            notionTasks: [
              {
                pageId: 'notion-task-1',
                title: 'Finalize Q4 deck notes',
                completed: false,
                schemaType: 'checkbox',
              },
              {
                pageId: 'notion-task-2',
                title: 'Send Q4 metrics to Partner contact',
                completed: false,
                schemaType: 'status',
              },
            ],
          });
        }
      } finally {
        if (!cancelled) setSimLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ctrl.destroy();
    };
  }, [geometryMode, refreshCorridor]);

  // Live SSE sync subscription
  useEffect(() => {
    if (geometryMode || !sessionToken || typeof EventSource === 'undefined') return;
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(sessionToken)}`);
    es.addEventListener('corridor', () => {
      if (tokenRef.current) void refreshCorridor(tokenRef.current);
    });
    es.addEventListener('audit', () => {
      if (tokenRef.current) void refreshWorkspaceInspector(tokenRef.current);
    });
    es.addEventListener('proactive', (ev) => {
      try {
        setProactive(JSON.parse((ev as MessageEvent).data) as ProactiveHarnessStatus);
      } catch {
        // ignore
      }
    });
    es.addEventListener('meeting', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as MeetingSessionState;
        if (parsed.active) {
          setMeetingState(parsed);
          ctrlRef.current?.setMeetingSession(parsed);
        } else {
          setMeetingState(null);
        }
      } catch {
        // ignore
      }
    });
    es.addEventListener('memory', (ev) => {
      try {
        const mem = JSON.parse((ev as MessageEvent).data) as UnifiedMemoryDto;
        setUnifiedMemories((prev) => [mem, ...prev.filter((m) => m.id !== mem.id)].slice(0, 30));
      } catch {
        // ignore
      }
    });
    es.addEventListener('liveui', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as { g2?: { lines?: string[] } };
        if (
          ctrlRef.current?.getState().phase === 'idle' &&
          payload?.g2?.lines &&
          payload.g2.lines.length > 0
        ) {
          ctrlRef.current.showAnswer(payload.g2.lines);
        }
        setEmulatorTick(Date.now());
      } catch {
        // ignore
      }
    });
    es.addEventListener('os_state', () => {
      setExternalTaskSeq((s) => s + 1);
      setEmulatorTick(Date.now());
    });
    return () => es.close();
  }, [geometryMode, sessionToken, refreshCorridor, refreshWorkspaceInspector]);

  // Keyboard bindings for R1 Ring simulation (ignoring form inputs)
  useEffect(() => {
    if (geometryMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        void ctrlRef.current?.handleEvent({ kind: 'SCROLL_DOWN' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        void ctrlRef.current?.handleEvent({ kind: 'SCROLL_UP' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void ctrlRef.current?.handleEvent({ kind: 'CLICK' });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (lensPovOpen) {
          setLensPovOpen(false);
        } else {
          void ctrlRef.current?.handleEvent({ kind: 'DOUBLE_CLICK' });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [geometryMode, lensPovOpen]);

  const clearTtsPlayback = () => {
    for (const id of ttsTimersRef.current) window.clearTimeout(id);
    ttsTimersRef.current = [];
    setSpeakingNow(false);
    setActiveSpokenWord('');
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => null);
      audioCtxRef.current = null;
    }
    if (voiceWsRef.current && voiceWsRef.current.readyState === WebSocket.OPEN) {
      voiceWsRef.current.send(JSON.stringify({ type: 'barge_in' }));
    }
  };

  const playSpeechOutput = async (speech: {
    audioChunksBase64?: string[];
    sampleRate?: number;
    wordBoundaries?: TtsWordBoundary[];
    durationMs?: number;
    engine?: string;
  }) => {
    clearTtsPlayback();
    setSpeakingNow(true);
    const words = speech.wordBoundaries ?? [];
    for (const wb of words) {
      const id = window.setTimeout(() => setActiveSpokenWord(wb.word), wb.start);
      ttsTimersRef.current.push(id);
    }
    const endMs = Math.max(speech.durationMs ?? 1600, words[words.length - 1]?.end ?? 1600) + 180;
    ttsTimersRef.current.push(
      window.setTimeout(() => {
        setSpeakingNow(false);
        setActiveSpokenWord('');
      }, endMs),
    );

    if (speech.audioChunksBase64 && speech.audioChunksBase64.length > 0 && typeof AudioContext !== 'undefined') {
      try {
        const sr = speech.sampleRate || 24000;
        const decodedParts = speech.audioChunksBase64.map((b64) => {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes;
        });
        const totalBytes = decodedParts.reduce((a, b) => a + b.byteLength, 0);
        const merged = new Uint8Array(totalBytes);
        let pos = 0;
        for (const p of decodedParts) {
          merged.set(p, pos);
          pos += p.byteLength;
        }
        // Raw PCM16 little-endian stream -> Float32 AudioBuffer
        const samples = Math.floor(merged.byteLength / 2);
        const ctx = new AudioContext({ sampleRate: sr });
        audioCtxRef.current = ctx;
        const buf = ctx.createBuffer(1, samples, sr);
        const ch = buf.getChannelData(0);
        const dv = new DataView(merged.buffer);
        for (let i = 0; i < samples; i++) {
          ch[i] = dv.getInt16(i * 2, true) / 32768;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
      } catch {
        // ignore audio autoplay blocks in headless mode
      }
    }
  };

  const speakCompanionReply = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.rate = 1.04;
      window.speechSynthesis.speak(u);
    } catch {
      // ignore speech synthesis restrictions in headless browsers
    }
  }, []);

  const runLiveMeetingDemo = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    const res = await fetch('/api/meeting/demo-run', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.ok) {
      const state = (await res.json()) as MeetingSessionState;
      setMeetingState(state);
      ctrlRef.current?.setMeetingSession(state);
      setVoiceFeedback('Live Meeting Scribe active (RAM-only · 2 speakers diarized). Say "OnQ, wrap up" or ask a question.');
      await refreshWorkspaceInspector(tok);
    }
  };

  const askMeetingClaude = async (question: string) => {
    const tok = tokenRef.current;
    if (!tok) return;
    setThinkingNow(true);
    setBackchannelText('Mm, checking...');
    const t0 = performance.now();
    try {
      const res = await fetch('/api/meeting/ask', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, voiceId: ttsVoiceId }),
      });
      const data = (await res.json()) as {
        lines?: string[];
        speech?: {
          audioChunksBase64?: string[];
          sampleRate?: number;
          wordBoundaries?: TtsWordBoundary[];
          durationMs?: number;
          engine?: string;
        };
      };
      setVoiceLatencyMs(Math.round(performance.now() - t0));
      setBackchannelText(null);
      if (data.lines) {
        ctrlRef.current?.showAnswer(data.lines);
        setVoiceFeedback(data.lines.join(' | '));
      }
      if (data.speech) {
        await playSpeechOutput(data.speech);
      }
      await refreshWorkspaceInspector(tok);
    } finally {
      setThinkingNow(false);
    }
  };

  const stageTelegramBrief = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    setThinkingNow(true);
    try {
      const res = await fetch('/api/telegram/automate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'brief_push' }),
      });
      const data = (await res.json()) as { preview?: ActionPreview; generatedText?: string };
      if (data.preview) {
        ctrlRef.current?.stagePreview(data.preview);
        setVoiceFeedback(`Telegram draft ready: "${data.generatedText?.slice(0, 60) ?? 'Brief'}". Confirm to send.`);
      }
    } finally {
      setThinkingNow(false);
    }
  };

  const runMeetingWrapUp = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    setThinkingNow(true);
    try {
      const res = await fetch('/api/meeting/wrapup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      await refreshWorkspaceInspector(tok);
      if (res.status === 409) {
        ctrlRef.current?.showConflict(data as ConflictLockDetail);
        setVoiceFeedback(`409 CONFLICT LOCKED: ${(data as ConflictLockDetail).message}`);
        return;
      }
      if (res.ok && data.preview) {
        ctrlRef.current?.stagePreview(data.preview as ActionPreview, true);
        setVoiceFeedback('Wrap-Up Recap Pack staged (Default-NO). Say "Confirm action" or swipe/tap to arm 2.0s Undo Ring.');
      }
    } finally {
      setThinkingNow(false);
    }
  };

  const wipeMeetingScribe = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    await fetch('/api/meeting/wipe', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    setMeetingState(null);
    ctrlRef.current?.setMeetingSession(null);
    await refreshCorridor(tok);
    setVoiceFeedback('In-RAM meeting transcript wiped clean (0 audio persisted).');
  };

  const stageCommand = async (cmd: string) => {
    const tok = tokenRef.current;
    if (!tok) {
      setVoiceFeedback('Relay offline. Start local server with npm run dev.');
      return;
    }
    setThinkingNow(true);
    try {
      const card = ctrlRef.current?.getState().cards[ctrlRef.current.getState().selectedCardIndex];
      const res = await fetch('/api/actions/stage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandText: cmd, cardId: card?.id }),
      });
      const data = await res.json();
      if (res.status === 409) {
        ctrlRef.current?.showConflict(data as ConflictLockDetail);
        setVoiceFeedback(`409 CONFLICT LOCKED: ${(data as ConflictLockDetail).message}`);
        void refreshWorkspaceInspector(tok);
        return;
      }
      if (!res.ok) {
        ctrlRef.current?.showError((data as { error?: string }).error ?? `HTTP ${res.status}`);
        setVoiceFeedback((data as { error?: string }).error ?? `HTTP ${res.status}`);
        void refreshWorkspaceInspector(tok);
        return;
      }
      if (data.readOnlyAnswer && data.lines) {
        ctrlRef.current?.showAnswer(data.lines as string[]);
        setVoiceFeedback(`Read-only answer: ${(data.lines as string[]).join(' | ')}`);
        void refreshWorkspaceInspector(tok);
        return;
      }
      ctrlRef.current?.stagePreview(data as ActionPreview);
      setVoiceFeedback('Staged Default-NO preview. Swipe to YES and tap to arm 2.0s Undo Ring.');
      void refreshWorkspaceInspector(tok);
    } finally {
      setThinkingNow(false);
    }
  };

  const toggleLiveMic = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    if (!micActive) {
      try {
        clearTtsPlayback();
        ctrlRef.current?.setListening(0.05, '');
        setVoiceFeedback('Streaming 16 kHz PCM via /api/voice/stream...');

        try {
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${proto}//${window.location.host}/api/voice/stream?token=${encodeURIComponent(tok)}`);
          voiceWsRef.current = ws;
          ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'mode', mode: meetingState?.active ? 'meeting' : 'agent' }));
          };
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(String(ev.data)) as {
                type?: string;
                transcript?: string;
                state?: MeetingSessionState;
              };
              if ((msg.type === 'meeting_state' || msg.type === 'meeting') && msg.state) {
                setMeetingState(msg.state);
                ctrlRef.current?.setMeetingSession(msg.state);
              } else if (msg.transcript) {
                lastTranscriptRef.current = msg.transcript;
                ctrlRef.current?.setListening(0.32, msg.transcript);
              }
            } catch {
              // ignore malformed stream frame
            }
          };
        } catch {
          voiceWsRef.current = null;
        }

        lastTranscriptRef.current = '';
        micHandleRef.current = await startBrowserMicCapture(
          (rms) => {
            // Instant human-like barge-in if wearer speaks while avatar is talking
            if (rms > 0.08 && speakingNowRef.current) {
              clearTtsPlayback();
            }
            if (rms > 0.05) {
              speechEndAtRef.current = performance.now();
              if (vadTimerRef.current) {
                window.clearTimeout(vadTimerRef.current);
                vadTimerRef.current = null;
              }
            } else if (lastTranscriptRef.current.trim().length > 2 && !vadTimerRef.current) {
              vadTimerRef.current = window.setTimeout(() => {
                vadTimerRef.current = null;
                if (speechEndAtRef.current) {
                  setVoiceLatencyMs(Math.round(performance.now() - speechEndAtRef.current));
                }
                setBackchannelText('Mm, got it.');
              }, 650);
            }
            ctrlRef.current?.setListening(rms, lastTranscriptRef.current);
          },
          (pcm16) => {
            if (voiceWsRef.current && voiceWsRef.current.readyState === WebSocket.OPEN) {
              voiceWsRef.current.send(pcm16);
            }
          },
        );
        setMicActive(true);
      } catch (err) {
        setMicActive(false);
        voiceWsRef.current?.close();
        voiceWsRef.current = null;
        ctrlRef.current?.showError('MIC PERMISSION DENIED');
        setVoiceFeedback(err instanceof Error ? err.message : 'Microphone unavailable');
      }
      return;
    }

    if (vadTimerRef.current) {
      window.clearTimeout(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    setBackchannelText(null);
    setMicActive(false);
    if (voiceWsRef.current) {
      voiceWsRef.current.close();
      voiceWsRef.current = null;
    }
    const handle = micHandleRef.current;
    micHandleRef.current = null;
    if (!handle) return;
    const t0 = performance.now();
    const { wavBlob } = await handle.stop();
    setVoiceFeedback('Listening finished — processing voice...');
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}` },
      body: wavBlob,
    });
    const stt = (await res.json()) as {
      rejectedSilent?: boolean;
      transcript?: string;
      rms?: number;
      sttEngine?: string;
      error?: string;
    };
    setVoiceLatencyMs(Math.round(performance.now() - t0));
    await refreshWorkspaceInspector(tok);
    if (!res.ok) {
      ctrlRef.current?.showError(stt.error ?? `STT HTTP ${res.status}`);
      setVoiceFeedback(stt.error ?? `STT HTTP ${res.status}`);
      return;
    }
    if (stt.rejectedSilent || !stt.transcript) {
      ctrlRef.current?.showError('NO SPEECH DETECTED');
      setVoiceFeedback('No clear speech detected — tap Talk Hands-Free and try again.');
      return;
    }
    setVoiceFeedback(`Heard (${Math.round(performance.now() - t0)}ms): "${stt.transcript}"`);
    await stageCommand(stt.transcript);
  };

  const runVoicePreset = async (presetText: string, silent = false) => {
    const tok = tokenRef.current;
    if (!tok) return;
    const t0 = performance.now();
    ctrlRef.current?.setListening(silent ? 0.002 : 0.72, silent ? '' : presetText);
    const wavBlob = makeSynthesizedWav(silent);
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok}`,
        'X-OnQ-Preset': presetText,
      },
      body: wavBlob,
    });
    const stt = (await res.json()) as {
      rejectedSilent: boolean;
      transcript: string;
      rms: number;
      sttEngine: string;
    };
    setVoiceLatencyMs(Math.round(performance.now() - t0));
    if (stt.rejectedSilent) {
      ctrlRef.current?.showError('QUIET CLIP IGNORED');
      setVoiceFeedback('Quiet press ignored locally before sending.');
      void refreshWorkspaceInspector(tok);
      return;
    }
    setVoiceFeedback(`Heard (${Math.round(performance.now() - t0)}ms): "${stt.transcript}"`);
    await stageCommand(stt.transcript);
    void refreshWorkspaceInspector(tok);
  };

  const resetSandbox = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    await fetch('/api/workspace/reset', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    ctrlRef.current?.disarmToUndone();
    await ctrlRef.current?.handleEvent({ kind: 'CLICK' });
    await refreshCorridor(tok);
    setVoiceFeedback('Sandbox workspace reset to initial 14:00 Investor call state.');
  };

  const handleAddBusySlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const tok = tokenRef.current;
    if (!tok || !newBusyTitle.trim()) return;
    const datePrefix = workspace?.calendarEvents[0]?.startIso.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const startIso = `${datePrefix}T${newBusyTime}:00.000Z`;
    const endIso = new Date(Date.parse(startIso) + 30 * 60_000).toISOString();
    await fetch('/api/workspace/calendar/add', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newBusyTitle.trim(), startIso, endIso }),
    });
    setNewBusyTitle('');
    await refreshWorkspaceInspector(tok);
    setVoiceFeedback(`Added Calendar block "${newBusyTitle.trim()}" at ${newBusyTime}. Try moving the Investor call there to test 409 Lock!`);
  };

  const handleSimulateIncomingReply = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    await fetch('/api/workspace/gmail/incoming', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: 'Actually let us do 15:00 instead' }),
    });
    await refreshWorkspaceInspector(tok);
    setVoiceFeedback('Simulated incoming reply (historyId bumped). Committing old card now triggers 409 CONFLICT_THREAD_UPDATED!');
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const tok = tokenRef.current;
    if (!tok || !newTaskTitle.trim()) return;
    await fetch('/api/workspace/notion/add', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTaskTitle.trim() }),
    });
    setNewTaskTitle('');
    await refreshWorkspaceInspector(tok);
  };

  const handleToggleTask = async (pageId: string) => {
    const tok = tokenRef.current;
    if (!tok) return;
    await fetch('/api/workspace/notion/toggle', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId }),
    });
    await refreshWorkspaceInspector(tok);
  };

  const handleUndoFromLedger = async (idempotencyKey: string) => {
    const tok = tokenRef.current;
    if (!tok) return;
    const res = await fetch('/api/actions/undo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey }),
    });
    if (res.ok) {
      await refreshCorridor(tok);
      setVoiceFeedback('Surgical undo executed from Audit Receipt Ledger.');
    }
  };

  const armProgress01 =
    hudState.armRemainingMs !== undefined
      ? Math.max(0.06, Math.min(1, 1 - hudState.armRemainingMs / 2000))
      : 0;

  const orbState: VoiceOrbState =
    hudState.phase === 'conflict'
      ? 'conflict'
      : hudState.phase === 'armed'
        ? 'armed'
        : speakingNow
          ? 'speaking'
          : thinkingNow
            ? 'thinking'
            : micActive || hudState.phase === 'listening'
              ? 'listening'
              : 'idle';

  if (geometryMode) {
    return (
      <main className="min-h-screen bg-black p-6 flex items-start justify-start">
        <G2LensCanvas
          hudState={hudState}
          opticsMode="raw"
          negativeControlOverflow={geometryStateName === 'NEGATIVE_CONTROL_OVERFLOW'}
        />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--bright)]">
      <ScrollProgressRail />
      <Suspense fallback={null}>
        <BinaryMotionToggle />
      </Suspense>

      {/* Expanded First-Person Inside-the-Glasses Waveguide View (Click 3D Lenses to Enter) */}
      <AnimatePresence>
        {lensPovOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-label="Inside OnQ Glasses Optical View"
          >
            <div className="retro-glass-panel w-full max-w-4xl p-5 sm:p-7 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <OnQLogo showWordmark />
                  <span className="font-pixel text-[10px] uppercase tracking-[0.18em] text-[var(--g2-phosphor)]">
                    INSIDE LENS POV · 525NM MONOCHROME WAVEGUIDE
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLensPovOpen(false)}
                  className="px-3 py-1.5 border border-[var(--hairline)] text-xs text-[var(--lightgray)] hover:text-[var(--bright)] hover:border-[var(--lime)] cursor-pointer"
                >
                  Exit Glasses View (Esc)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className="md:col-span-8 g2-lens-scaler overflow-x-auto">
                  <G2LensCanvas hudState={hudState} opticsMode="waveguide" />
                </div>
                <div className="md:col-span-4">
                  <OnQVoiceOrb
                    state={orbState}
                    rmsLevel={hudState.rmsLevel ?? 0}
                    activeWord={activeSpokenWord}
                    armProgress01={armProgress01}
                    engineLabel={voiceEngineLabel}
                    orchestratorLabel={activeLlmProvider}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-dashed border-[var(--hairline)]">
                <div className="flex flex-wrap gap-2">
                  {(hudState.phase === 'preview' || hudState.phase === 'wrap_up') && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          if (ctrlRef.current?.getState().previewSelection !== 'YES') {
                            await ctrlRef.current?.handleEvent({ kind: 'SCROLL_DOWN' });
                          }
                          await ctrlRef.current?.handleEvent({ kind: 'CLICK' });
                        }}
                        className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] text-xs font-semibold cursor-pointer"
                      >
                        Confirm &amp; Arm 2.0s Ring
                      </button>
                      <button
                        type="button"
                        onClick={() => void ctrlRef.current?.handleEvent({ kind: 'DOUBLE_CLICK' })}
                        className="px-3 py-2 border border-[var(--hairline)] text-xs hover:border-[var(--bright)] cursor-pointer"
                      >
                        Cancel (Zero Writes)
                      </button>
                    </>
                  )}
                  {hudState.phase === 'armed' && (
                    <button
                      type="button"
                      onClick={() => void ctrlRef.current?.handleEvent({ kind: 'CLICK' })}
                      className="px-4 py-2 border border-[var(--danger)] text-[var(--danger)] text-xs font-semibold cursor-pointer"
                    >
                      Tap to Cancel Write ({(hudState.armRemainingMs / 1000).toFixed(1)}s)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void toggleLiveMic()}
                    className={`px-4 py-2 border text-xs font-semibold cursor-pointer ${
                      micActive
                        ? 'border-[var(--danger)] bg-[var(--danger)] text-[#0a0a0a]'
                        : 'border-[var(--g2-phosphor)] text-[var(--g2-phosphor)]'
                    }`}
                  >
                    {micActive ? 'Stop Listening' : 'Run Voice'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runLiveMeetingDemo()}
                    className="px-3 py-2 border border-[var(--hairline)] text-xs hover:border-[var(--lime)] cursor-pointer"
                  >
                    Live Meeting Notes
                  </button>
                  <button
                    type="button"
                    onClick={() => void askMeetingClaude('What did Investor ask about Q4?')}
                    className="px-3 py-2 border border-[var(--hairline)] text-xs hover:border-[var(--verified)] cursor-pointer"
                  >
                    Ask &quot;OnQ, Q4?&quot;
                  </button>
                </div>
                <p className="text-xs text-[var(--lightgray)]" role="status">{voiceFeedback}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Apple Smoked Liquid-Glass Navbar */}
      <header className="retro-glass-nav sticky top-0 z-40 h-16">
        <div className="container-page h-full flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-3 group">
            <OnQLogo showWordmark />
          </a>

          <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-5 text-sm text-[var(--lightgray)] whitespace-nowrap">
            <a href="#experience" className="hover:text-[var(--bright)] transition-colors whitespace-nowrap shrink-0">Lens</a>
            <a href="#clips" className="hover:text-[var(--bright)] transition-colors whitespace-nowrap shrink-0">Watch</a>
            <a href="#use-cases" className="hover:text-[var(--bright)] transition-colors whitespace-nowrap shrink-0">Your day</a>
            <a href="#safety" className="hover:text-[var(--bright)] transition-colors whitespace-nowrap shrink-0">Safety</a>
            <a href="#connectors" className="hover:text-[var(--bright)] transition-colors whitespace-nowrap shrink-0">Connect</a>
            <a href="#architecture" className="hover:text-[var(--bright)] transition-colors whitespace-nowrap shrink-0">How it works</a>
            <a href="#faq" className="hover:text-[var(--bright)] transition-colors whitespace-nowrap shrink-0">FAQ</a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="#connectors"
              className="retro-btn-glass px-3.5 py-2 text-[var(--bright)] hover:text-[var(--lime)] text-xs sm:text-sm whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            >
              {accountEmail && (
                <span className="inline-block w-2 h-2 rounded-full bg-[var(--g2-phosphor)]" aria-hidden="true" />
              )}
              <span className="max-w-[104px] truncate">{accountEmail ? accountEmail.split('@')[0] : 'Sign in'}</span>
            </a>
            <button
              type="button"
              onClick={() => {
                void runVoicePreset('Push 15m and tell Investor');
                document.getElementById('experience-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className="retro-btn-primary px-4 py-2 text-xs sm:text-sm cursor-pointer whitespace-nowrap shrink-0"
            >
              Talk Now
            </button>
            <button
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((v) => !v)}
              className="lg:hidden retro-btn-glass px-2.5 py-2 text-xs text-[var(--bright)] cursor-pointer"
            >
              {mobileNavOpen ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <nav
            aria-label="Mobile navigation"
            className="lg:hidden border-t border-[var(--hairline)] bg-[var(--ink)]/95 backdrop-blur-md px-4 py-3 flex flex-wrap gap-3 text-xs text-[var(--lightgray)]"
          >
            {[
              ['#experience', 'Lens'],
              ['#clips', 'Watch'],
              ['#use-cases', 'Your day'],
              ['#safety', 'Safety'],
              ['#connectors', 'Connect'],
              ['#architecture', 'How it works'],
              ['#faq', 'FAQ'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMobileNavOpen(false)}
                className="px-2 py-1 hover:text-[var(--lime)]"
              >
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>

      {/* Hero: Full-Size 360° 3D Glasses Artifact + HydraDB-inspired Rotating-Word Tagline */}
      <main id="top">
        <section id="experience" className="pt-10 pb-10 sm:pt-14 sm:pb-14 relative overflow-hidden">
          {/* Glow covers the hero only: a full-section shader also repainted the tall workbench every frame. */}
          <PhosphorMeshShader
            intensity={0.85}
            className="max-h-[60rem] [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
          />
          {/* Bits converge into the glasses, then fly outward as the hero scrolls away. */}
          <Suspense fallback={null}>
            <BinaryField
              mode="form"
              shape="glasses"
              behavior="hero"
              cx={0.5}
              cy={0.3}
              boxWidth={0.74}
              ambient={0.4}
              maxAlpha={0.4}
              maxGlyphs={560}
              className="absolute inset-x-0 top-0 h-[46rem] w-full [mask-image:linear-gradient(to_bottom,black_62%,transparent)]"
            />
          </Suspense>
          <div className="container-page relative z-10 space-y-10">
            <div className="space-y-10 sm:space-y-12">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: MOTION_EASE }}
                className="max-w-3xl mx-auto text-center flex flex-col items-center space-y-6"
              >
                <p className="ob-pill inline-flex items-center gap-2 !py-1.5 text-[11px] sm:text-xs text-[var(--lightgray)]">
                  <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]">Even G2</span>
                  <span aria-hidden="true" className="w-px h-3 bg-white/15" />
                  Verified in the simulator
                </p>
                <h1 className="font-dots font-black leading-[0.95] tracking-[-0.02em] text-[2.6rem] sm:text-[4rem] lg:text-[4.75rem]">
                  <span className="block text-[var(--bright)]">Your glasses that{' '}</span>
                  <span className="block relative min-h-[1.08em] text-[var(--g2-phosphor)]">
                    <AnimatePresence initial={false} mode="wait">
                      <motion.span
                        key={HERO_WORDS[heroWordIdx]}
                        className="inline-block"
                        initial={reducedMotion ? false : { opacity: 0.25, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
                        transition={{ duration: 0.16, ease: MOTION_EASE }}
                      >
                        {HERO_WORDS[heroWordIdx]}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </h1>
                <p className="text-base md:text-lg leading-relaxed text-[var(--lightgray)] max-w-xl">
                  Read, decide and reply from your glasses. Nothing sends until you confirm.
                </p>

                {/* The read-and-write loop, in order */}
                <ol aria-label="How a reply works" className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2 text-[11px] sm:text-xs">
                  {['Glance', 'Say it or tap', 'Draft ready', 'Confirm', '2s undo ring', 'Done'].map((s, i, arr) => (
                    <li key={s} className="inline-flex items-center gap-1.5">
                      <span className={`ob-pill !py-1.5 !px-3 ${i === arr.length - 1 ? '!text-[var(--g2-phosphor)] !border-[var(--g2-phosphor)]/40' : ''}`}>
                        {s}
                      </span>
                      {i < arr.length - 1 && <span aria-hidden="true" className="text-[var(--g2-phosphor)]">-&gt;</span>}
                    </li>
                  ))}
                </ol>
                <p className="text-xs sm:text-sm text-[var(--lightgray)]">
                  Telegram too. Only chats you pick, replies approved on the glasses.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      void runVoicePreset('Push 15m and tell Investor');
                      document.getElementById('experience-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    className="retro-btn-primary px-5 py-2.5 text-xs sm:text-sm cursor-pointer"
                  >
                    Talk Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setLensPovOpen(true)}
                    className="retro-btn-glass px-4 py-2.5 text-[var(--g2-phosphor)] hover:text-[var(--lime)] text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    POV
                  </button>
                </div>

                <nav aria-label="60-second tour" className="space-y-2 pt-2">
                  <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lightgray)]">60-SECOND TOUR</p>
                  <ol className="flex flex-wrap justify-center gap-2 text-xs">
                    {[
                      {
                        n: 1,
                        label: 'Confirm and undo',
                        run: () => {
                          void runVoicePreset('Push 15m and tell Investor');
                          document.getElementById('experience-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        },
                      },
                      {
                        n: 2,
                        label: 'Double-booking lock',
                        run: () => {
                          void stageCommand('Move VC sync to 14:45');
                          document.getElementById('experience-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        },
                      },
                      {
                        n: 3,
                        label: 'Telegram reply',
                        run: () => {
                          void stageTelegramBrief();
                          document.getElementById('experience-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        },
                      },
                    ].map((step) => (
                      <li key={step.n}>
                        <button
                          type="button"
                          onClick={step.run}
                          className="retro-btn-glass inline-flex items-center gap-2 px-3 py-1.5 text-[var(--bright)] hover:text-[var(--lime)] cursor-pointer"
                        >
                          <span className="font-pixel text-[var(--lime)]">{step.n}</span>
                          {step.label}
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
              </motion.div>

              <motion.div
                id="experience-workbench"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.08, ease: MOTION_EASE }}
                className="ob-card p-2 sm:p-3 max-w-4xl mx-auto origin-top"
              >
                <Suspense
                  fallback={
                    <div
                      role="status"
                      className="retro-glass-panel flex min-h-[26rem] items-center justify-center text-xs text-[var(--lightgray)]"
                    >
                      Loading 3D glasses...
                    </div>
                  }
                >
                <G2Hardware3D
                  hudState={hudState}
                  orbState={orbState}
                  activeWord={activeSpokenWord}
                  headerLine={`${sessionMode === 'DEMO' ? 'SAMPLE' : sessionMode} | ${hudState.phase.toUpperCase()}`}
                  primaryLine={
                    hudState.cards[hudState.selectedCardIndex]?.title ?? 'Corridor Ready'
                  }
                  ringProgress={armProgress01}
                  rmsLevel={hudState.rmsLevel ?? 0}
                  engineLabel={voiceEngineLabel}
                  onEnterLensView={() => setLensPovOpen(true)}
                  onRunVoice={() => void runVoicePreset('Push 15m and tell Investor')}
                  onConfirmAction={async () => {
                    await ctrlRef.current?.handleEvent({ kind: 'SCROLL_DOWN' });
                    await ctrlRef.current?.handleEvent({ kind: 'CLICK' });
                  }}
                  onCancelAction={() => void ctrlRef.current?.handleEvent({ kind: 'CLICK' })}
                />
                </Suspense>
              </motion.div>
            </div>

            {/* Clean Retro Smoked-Glass Product Workbench */}
            <div className="retro-glass-panel p-1.5 sm:p-2 space-y-3">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
                {/* Left: Clean Lens Preview, Contextual Write Action & Voice Prompt Bar */}
                <div className="xl:col-span-7 retro-glass-well p-5 sm:p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <ApplePixelTile size="sm" tint="#34F57E">
                        <EvenG2PixelSvg className="w-5 h-3" />
                      </ApplePixelTile>
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--lightgray)]">
                        <span className="w-2 h-2 rounded-full bg-[var(--g2-phosphor)] animate-pulse" aria-hidden="true" />
                        <span>Even G2</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex border border-[var(--hairline)] bg-[var(--ink)] p-0.5 text-[10px] font-pixel uppercase">
                        <button
                          type="button"
                          onClick={() => setLensViewMode('web')}
                          className={`px-2 py-1 cursor-pointer transition-colors ${
                            lensViewMode === 'web'
                              ? 'bg-[var(--g2-phosphor)] text-[#041209]'
                              : 'text-[var(--lightgray)] hover:text-[var(--bright)]'
                          }`}
                        >
                          Lens
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLensViewMode('sdk');
                            setEmulatorTick(Date.now());
                          }}
                          className={`px-2 py-1 cursor-pointer transition-colors ${
                            lensViewMode === 'sdk'
                              ? 'bg-[var(--lime)] text-[#041209]'
                              : 'text-[var(--lightgray)] hover:text-[var(--bright)]'
                          }`}
                        >
                          SDK Live
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLensPovOpen(true)}
                        className="retro-btn-glass px-3 py-1.5 text-xs text-[var(--bright)] hover:text-[var(--g2-phosphor)] cursor-pointer"
                      >
                        Full Screen
                      </button>
                      <button
                        type="button"
                        onClick={() => void resetSandbox()}
                        className="retro-btn-glass scroll-mt-24 px-3 py-1.5 text-xs text-[var(--lightgray)] hover:text-[var(--lime)] cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {lensViewMode === 'sdk' ? (
                    <div className="space-y-3">
                      <div className="g2-lens-scaler overflow-x-auto">
                        {emulatorRunning ? (
                          <div className="g2-lens-canvas flex items-center justify-center bg-black">
                            <img
                              src={`/api/emulator/frame?t=${emulatorTick}`}
                              width={576}
                              height={288}
                              alt="Official EvenHub Simulator 0.9.5 live glasses output"
                              className="w-[576px] h-[288px] block"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          </div>
                        ) : (
                          <div className="g2-lens-canvas flex flex-col items-center justify-center gap-2 text-center px-4 text-xs text-[var(--lightgray)]">
                            <span className="font-pixel text-[10px] text-[var(--warning)] uppercase">
                              EVENHUB EMULATOR :9898 OFFLINE
                            </span>
                            <span>
                              Start with:{' '}
                              <code className="text-[var(--bright)]">
                                npx evenhub-simulator http://localhost:5174 --automation-port 9898 --no-glow
                              </code>
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-pixel text-[9px] uppercase tracking-[0.12em] text-[var(--g2-phosphor)] mr-1">
                          EVEN R1 SDK INPUT:
                        </span>
                        <button
                          type="button"
                          disabled={emulatorBusy}
                          onClick={() => void sendEmulatorInput('up')}
                          className="retro-btn-glass px-2.5 py-1 text-[var(--bright)] hover:text-[var(--lime)] cursor-pointer"
                        >
                          R1 Up
                        </button>
                        <button
                          type="button"
                          disabled={emulatorBusy}
                          onClick={() => void sendEmulatorInput('down')}
                          className="retro-btn-glass px-2.5 py-1 text-[var(--bright)] hover:text-[var(--lime)] cursor-pointer"
                        >
                          R1 Down
                        </button>
                        <button
                          type="button"
                          disabled={emulatorBusy}
                          onClick={() => void sendEmulatorInput('click')}
                          className="px-2.5 py-1 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
                        >
                          R1 Tap (Select)
                        </button>
                        <button
                          type="button"
                          disabled={emulatorBusy}
                          onClick={() => void sendEmulatorInput('double_click')}
                          className="retro-btn-glass px-2.5 py-1 text-[var(--bright)] hover:text-[var(--lime)] cursor-pointer"
                        >
                          R1 2xTap (Back)
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmulatorTick(Date.now())}
                          className="retro-btn-glass px-2.5 py-1 text-[var(--lightgray)] hover:text-[var(--bright)] cursor-pointer ml-auto"
                        >
                          Refresh Frame
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="g2-lens-scaler overflow-x-auto cursor-pointer"
                      onClick={() => setLensPovOpen(true)}
                      title="Click to expand Inside-the-Glasses view"
                    >
                      {simLoading ? (
                        <div className="g2-lens-canvas flex items-center justify-center text-xs">
                          SYNCING WORKSPACE...
                        </div>
                      ) : (
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={`${hudState.phase}-${hudState.selectedCardIndex}`}
                            initial={{ opacity: 0.75, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0.75 }}
                            transition={{ duration: 0.16, ease: MOTION_EASE }}
                          >
                            <G2LensCanvas hudState={hudState} opticsMode={opticsMode} />
                          </motion.div>
                        </AnimatePresence>
                      )}
                    </div>
                  )}

                  {/* Contextual Write Safety Pill (appears ONLY when staged / armed / 409) */}
                  {(hudState.phase === 'preview' || hudState.phase === 'wrap_up') && (
                    <div className="flex flex-wrap items-center gap-2 p-3 border border-[var(--lime)] bg-[var(--lime-deep)]/40">
                      <span className="text-xs text-[var(--bright)] mr-auto">
                        Default-NO safeguard active. Confirm on R1 ring or click:
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (ctrlRef.current?.getState().previewSelection !== 'YES') {
                            await ctrlRef.current?.handleEvent({ kind: 'SCROLL_DOWN' });
                          }
                          await ctrlRef.current?.handleEvent({ kind: 'CLICK' });
                        }}
                        className="px-3.5 py-1.5 bg-[var(--lime)] text-[#0a0a0a] text-xs font-semibold cursor-pointer"
                      >
                        Confirm &amp; Arm 2.0s Ring
                      </button>
                      <button
                        type="button"
                        onClick={() => void ctrlRef.current?.handleEvent({ kind: 'DOUBLE_CLICK' })}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs hover:border-[var(--bright)] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {hudState.phase === 'armed' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 border border-[var(--danger)] bg-black">
                      <span className="text-xs text-[var(--bright)]">
                        2.0s Optical Countdown Ring armed. Tap anywhere to abort with zero writes.
                      </span>
                      <button
                        type="button"
                        onClick={() => void ctrlRef.current?.handleEvent({ kind: 'CLICK' })}
                        className="px-3.5 py-1.5 bg-[var(--danger)] text-[#0a0a0a] text-xs font-semibold cursor-pointer"
                      >
                        Abort Write
                      </button>
                    </div>
                  )}

                  {hudState.phase === 'conflict' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 border border-[var(--warning)] bg-black">
                      <span className="text-xs text-[var(--warning)]">
                        409 Conflict Hard-Lock: 0 calendar or email edits sent.
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void ctrlRef.current?.handleEvent({ kind: 'CLICK' })}
                          className="px-3 py-1.5 border border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning)] hover:text-[#0a0a0a] text-xs font-semibold cursor-pointer"
                        >
                          Use Next Free Slot
                        </button>
                        <button
                          type="button"
                          onClick={() => void ctrlRef.current?.handleEvent({ kind: 'DOUBLE_CLICK' })}
                          className="px-3 py-1.5 border border-[var(--hairline)] text-xs cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Perplexity-Style Voice & Command Bar */}
                  <div className="space-y-3 border-t border-dashed border-[var(--hairline)] pt-4">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void stageCommand(commandInput);
                      }}
                      className="flex flex-col sm:flex-row gap-2"
                    >
                      <input
                        type="text"
                        aria-label="Speak or enter an OnQ command"
                        value={commandInput}
                        onChange={(e) => setCommandInput(e.target.value)}
                        className="flex-1 bg-[var(--surface)] border border-[var(--hairline)] px-3.5 py-2.5 text-xs text-[var(--bright)] focus:border-[var(--lime)]"
                      />
                      <button
                        type="button"
                        onClick={() => void toggleLiveMic()}
                        className={`px-4 py-2.5 border text-xs font-semibold cursor-pointer ${
                          micActive
                            ? 'border-[var(--danger)] bg-[var(--danger)] text-[#0a0a0a]'
                            : 'border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[#0a0a0a]'
                        }`}
                      >
                        {micActive ? 'Stop Voice' : 'Run Voice'}
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2.5 bg-[var(--bright)] text-[#0a0a0a] hover:bg-[var(--lime)] text-xs font-semibold cursor-pointer"
                      >
                        Send
                      </button>
                      <button
                        type="button"
                        onClick={() => void stageCommand('Move VC sync to 14:45')}
                        className="px-3 py-2.5 border border-[var(--hairline)] text-[11px] text-[var(--lightgray)] hover:border-[var(--lime)] hover:text-[var(--lime)] cursor-pointer"
                      >
                        Test Conflict Lock
                      </button>
                    </form>

                    {/* Clean Companion Audio Out Status */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--lightgray)]">
                      <span className="inline-flex items-center gap-2">
                        <AssemblyAiPixelSvg className="w-3.5 h-3.5" />
                        <span>Earbuds Out ({ttsVoiceId}) · Even G2 has no speaker</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {speakingNow && (
                          <button
                            type="button"
                            onClick={clearTtsPlayback}
                            className="px-2 py-0.5 border border-[var(--danger)] text-[var(--danger)] font-pixel text-[9px] uppercase cursor-pointer"
                          >
                            Barge-In Stop
                          </button>
                        )}
                        <span className="font-pixel text-[9px] uppercase text-[var(--verified)]">
                          {voiceEngineLabel}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-[var(--lightgray)]" role="status">
                      {voiceFeedback}
                    </p>
                  </div>
                </div>

                {/* Right: Clean Smoked-Glass Tabbed Workspace (Schedule · Inbox & Tasks · Notes · Activity) */}
                <div className="xl:col-span-5 retro-glass-well p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-pixel text-[11px] uppercase tracking-[0.2em] text-[var(--bright)]">
                      WORKSPACE
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTestTools((v) => !v)}
                        className="retro-btn-glass font-pixel text-[9px] uppercase tracking-[0.12em] px-2.5 py-0.5 text-[var(--lightgray)] hover:text-[var(--lime)] cursor-pointer"
                      >
                        {showTestTools ? 'Hide Test Tools' : 'Test Scenarios'}
                      </button>
                      <span
                        className={`font-pixel text-[10px] uppercase tracking-[0.15em] px-2 py-0.5 rounded-full border ${
                          sessionMode === 'LIVE'
                            ? 'border-[var(--g2-phosphor)]/60 text-[var(--g2-phosphor)]'
                            : 'border-[var(--warning)]/50 text-[var(--warning)]'
                        }`}
                        title={
                          sessionMode === 'LIVE'
                            ? 'Showing your connected accounts'
                            : 'Made-up sample data. Connect your accounts to see your own.'
                        }
                      >
                        {sessionMode === 'LIVE' ? 'LIVE' : sessionMode === 'DEMO' ? 'SAMPLE DATA' : sessionMode}
                      </span>
                    </div>
                  </div>

                  {/* Minimal Smoked-Glass 4-Tab Bar */}
                  <div
                    role="tablist"
                    aria-label="Workspace panels"
                    className="grid grid-cols-4 gap-1 rounded-[10px] border border-white/10 bg-black/70 p-1 text-[10px] font-pixel uppercase"
                  >
                    {(
                      [
                        { id: 'schedule', label: 'Schedule' },
                        { id: 'inbox', label: 'Inbox' },
                        { id: 'notes', label: 'Notes' },
                        { id: 'activity', label: `Activity (${receipts.length})` },
                      ] as const
                    ).map((t) => {
                      const active = workspaceTab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setWorkspaceTab(t.id)}
                          className={`py-1.5 px-1.5 rounded-[7px] truncate cursor-pointer transition-colors border-b-2 ${
                            active
                              ? 'bg-[var(--lime)] text-[#0a0a0a] font-bold border-[#0a0a0a]'
                              : 'text-[var(--lightgray)] hover:text-[var(--bright)] border-transparent'
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* 24/7 Proactive Agentic Harness Live Pulse */}
                  {proactive && (
                    <div className="border border-dashed border-[var(--hairline)] bg-[var(--ink)] p-3 space-y-2 text-[11px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 font-pixel text-[9px] uppercase tracking-[0.14em] text-[var(--g2-phosphor)]">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${
                              proactive.running ? 'bg-[var(--g2-phosphor)] animate-pulse' : 'bg-[var(--lightgray)]'
                            }`}
                          />
                          <span>
                            24/7 PROACTIVE AGENT · {proactive.running ? 'WATCHING' : 'PAUSED'} · {proactive.pulseCount} SCANS
                          </span>
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={buildingHarness}
                            onClick={() => void buildProactiveHarness()}
                            className="px-2 py-0.5 border border-[var(--lime)]/70 text-[10px] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[#0a0a0a] cursor-pointer"
                          >
                            {buildingHarness ? 'Building...' : 'Build Harness'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void scanProactiveNow()}
                            className="px-2 py-0.5 border border-[var(--hairline)] text-[10px] text-[var(--lightgray)] hover:border-[var(--g2-phosphor)] hover:text-[var(--g2-phosphor)] cursor-pointer"
                          >
                            Scan Now
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleProactiveWatch()}
                            className="px-2 py-0.5 border border-[var(--hairline)] text-[10px] text-[var(--lightgray)] hover:border-[var(--lime)] hover:text-[var(--lime)] cursor-pointer"
                          >
                            {proactive.running ? 'Pause' : 'Resume'}
                          </button>
                        </div>
                      </div>
                      {proactive.activeHarness && (
                        <div className="border border-[var(--g2-phosphor)]/45 bg-[var(--surface)]/80 p-2.5 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="font-pixel text-[9px] uppercase tracking-[0.12em] text-[var(--lime)]">
                              SELF-GENERATED PROACTIVE HARNESS
                            </span>
                            <span className="font-pixel text-[8.5px] uppercase px-2 py-0.5 rounded-full border border-[var(--g2-phosphor)]/50 text-[var(--g2-phosphor)]">
                              {proactive.activeHarness.orchestratorUsed}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-[var(--bright)]">
                            {proactive.activeHarness.goal}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-[9.5px] font-pixel uppercase text-[var(--lightgray)]">
                            {(proactive.activeHarness.steps.length > 0
                              ? proactive.activeHarness.steps.map((s) => s.phase)
                              : ['OBSERVE', 'VERIFY', 'STAGE', 'GUARD']
                            ).map((phase, idx, arr) => (
                              <span key={`${phase}-${idx}`} className="inline-flex items-center gap-1">
                                <span className="px-1.5 py-0.5 border border-white/15 bg-black/50 text-[var(--bright)]">
                                  {phase}
                                </span>
                                {idx < arr.length - 1 && <span className="text-[var(--g2-phosphor)]">-&gt;</span>}
                              </span>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                            <span className="text-[10px] text-[var(--lightgray)] truncate">
                              {proactive.activeHarness.rationale}
                            </span>
                            <button
                              type="button"
                              onClick={() => void stageCommand(proactive.activeHarness!.suggestedCommand)}
                              className="px-2.5 py-1 bg-[var(--lime)] text-[#0a0a0a] font-pixel text-[9px] uppercase cursor-pointer shrink-0"
                            >
                              Preview (Ask First)
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {proactive.insights.slice(0, 4).map((ins) => (
                          <button
                            key={ins.id}
                            type="button"
                            onClick={() => {
                              if (ins.suggestedCommand) {
                                void stageCommand(ins.suggestedCommand);
                              }
                            }}
                            className={`text-left border px-2.5 py-1.5 bg-[var(--surface)]/70 transition-colors ${
                              ins.suggestedCommand ? 'cursor-pointer hover:border-[var(--lime)]' : 'cursor-default'
                            } ${
                              ins.severity === 'warn'
                                ? 'border-[var(--warning)]/60'
                                : ins.severity === 'action'
                                  ? 'border-[var(--g2-phosphor)]/45'
                                  : 'border-[var(--hairline)]/60'
                            }`}
                          >
                            <div className="font-semibold text-[var(--bright)] truncate">{ins.title}</div>
                            <div className="text-[10px] text-[var(--lightgray)] truncate">{ins.detail}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!workspace ? (
                    <div className="border border-dashed border-[var(--hairline)] p-4 text-xs text-[var(--lightgray)]">
                      Syncing workspace relay...
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      {workspaceTab === 'schedule' && (
                        <div className="border border-[var(--hairline)] bg-[var(--ink)] p-4 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)]">
                              <CalendarPixelSvg className="w-4 h-4" />
                              <span>UPCOMING CALENDAR</span>
                            </span>
                            <span className="text-[11px] text-[var(--lightgray)]">{workspace.calendarEvents.length} events</span>
                          </div>
                          {workspace.calendarEvents.map((ev) => (
                            <div key={ev.eventId} className="flex justify-between gap-2 border-t border-dashed border-[var(--hairline)] pt-2">
                              <span className="text-[var(--bright)] truncate">{ev.title}</span>
                              <span className="text-[var(--lightgray)] shrink-0">
                                {ev.startIso.slice(11, 16)} - {ev.endIso.slice(11, 16)}
                              </span>
                            </div>
                          ))}
                          {showTestTools && (
                            <form onSubmit={handleAddBusySlot} className="flex gap-1.5 pt-2 border-t border-dashed border-[var(--hairline)]">
                              <input
                                type="text"
                                aria-label="New busy calendar event title"
                                placeholder="Add busy block..."
                                value={newBusyTitle}
                                onChange={(e) => setNewBusyTitle(e.target.value)}
                                className="flex-1 bg-[var(--surface)] border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--bright)]"
                              />
                              <input
                                type="text"
                                aria-label="Busy block UTC start HH:MM"
                                value={newBusyTime}
                                onChange={(e) => setNewBusyTime(e.target.value)}
                                className="w-14 bg-[var(--surface)] border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--bright)]"
                              />
                              <button
                                type="submit"
                                className="px-2 py-1 border border-[var(--hairline)] text-[11px] hover:border-[var(--lime)] hover:text-[var(--lime)] cursor-pointer"
                              >
                                Add Busy Slot
                              </button>
                            </form>
                          )}
                        </div>
                      )}

                      {workspaceTab === 'inbox' && (
                        <>
                          <div className="border border-[var(--hairline)] bg-[var(--ink)] p-4 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.18em] text-[#26A5E4]">
                                <TelegramPixelSvg className="w-4 h-4" />
                                <span>TELEGRAM &amp; DAILY ROUTINES</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => void stageTelegramBrief()}
                                className="font-pixel text-[9px] px-2.5 py-1 border border-[#26A5E4]/60 text-[#26A5E4] hover:bg-[#26A5E4] hover:text-[#041209] cursor-pointer"
                              >
                                Stage Group Digest
                              </button>
                            </div>
                            <p className="text-[11px] text-[var(--lightgray)]">
                              Run daily G2 glances straight from Inbox or trigger Telegram group review (Default-NO):
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                { label: 'Morning Brief', cmd: 'Morning brief' },
                                { label: 'Check PR Status', cmd: 'Check PR status' },
                                { label: 'Evening Recap', cmd: 'Evening report' },
                              ].map((act) => (
                                <button
                                  key={act.label}
                                  type="button"
                                  onClick={() => void runVoicePreset(act.cmd)}
                                  className="px-2.5 py-1 border border-[var(--hairline)] text-[10.5px] text-[var(--bright)] hover:border-[var(--g2-phosphor)] hover:text-[var(--g2-phosphor)] cursor-pointer"
                                >
                                  {act.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="border border-[var(--hairline)] bg-[var(--ink)] p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)]">
                                <GmailPixelSvg className="w-4 h-4" />
                                <span>RECENT GMAIL THREADS</span>
                              </span>
                              {showTestTools && (
                                <button
                                  type="button"
                                  onClick={() => void handleSimulateIncomingReply()}
                                  className="font-pixel text-[9px] px-2 py-0.5 border border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning)] hover:text-[var(--ink)] cursor-pointer"
                                >
                                  Simulate New Reply
                                </button>
                              )}
                            </div>
                            {workspace.gmailThreads.map((t) => (
                              <div key={t.threadId} className="border-t border-dashed border-[var(--hairline)] pt-2 space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-[var(--bright)] font-medium">{t.fromName}</span>
                                  <span className="text-[var(--lightgray)]">{t.sentMessages.length} sent</span>
                                </div>
                                <p className="text-[var(--lightgray)]">{t.snippet}</p>
                                {t.sentMessages.map((m, idx) => (
                                  <div key={idx} className="text-[var(--verified)]">
                                    [{m.mode}] {m.body}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>

                          <div className="border border-[var(--hairline)] bg-[var(--ink)] p-4 space-y-2">
                            <div className="flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)]">
                              <NotionPixelSvg className="w-4 h-4" />
                              <span>NOTION TASKS</span>
                            </div>
                            {workspace.notionTasks.slice(0, 4).map((task) => (
                              <div key={task.pageId} className="flex justify-between gap-2 border-t border-dashed border-[var(--hairline)] pt-1.5">
                                <button
                                  type="button"
                                  onClick={() => void handleToggleTask(task.pageId)}
                                  className={`text-left truncate cursor-pointer ${
                                    task.completed ? 'line-through text-[var(--lightgray)]' : 'text-[var(--bright)] hover:text-[var(--lime)]'
                                  }`}
                                >
                                  {task.completed ? '[x] ' : '[ ] '}{task.title}
                                </button>
                                <span className="text-[var(--lightgray)] shrink-0">{task.schemaType}</span>
                              </div>
                            ))}
                            {showTestTools && (
                              <form onSubmit={handleAddTask} className="flex gap-1.5 pt-1 border-t border-dashed border-[var(--hairline)]">
                                <input
                                  type="text"
                                  aria-label="New Notion task title"
                                  placeholder="Add Notion task..."
                                  value={newTaskTitle}
                                  onChange={(e) => setNewTaskTitle(e.target.value)}
                                  className="flex-1 bg-[var(--surface)] border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--bright)]"
                                />
                                <button
                                  type="submit"
                                  className="px-2 py-1 border border-[var(--hairline)] text-[11px] hover:border-[var(--lime)] hover:text-[var(--lime)] cursor-pointer"
                                >
                                  Add Task
                                </button>
                              </form>
                            )}
                          </div>
                        </>
                      )}

                      {workspaceTab === 'notes' && (
                        <div className="border border-[var(--hairline)] bg-[var(--ink)] p-4 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--verified)]">
                              <AssemblyAiPixelSvg className="w-4 h-4" />
                              <span>LIVE MEETING NOTES (MEMORY-ONLY)</span>
                            </span>
                            {meetingState?.active && (
                              <button
                                type="button"
                                onClick={() => void wipeMeetingScribe()}
                                className="font-pixel text-[9px] px-2 py-0.5 border border-[var(--hairline)] text-[var(--lightgray)] hover:border-[var(--danger)] hover:text-[var(--danger)] cursor-pointer"
                              >
                                Wipe Memory
                              </button>
                            )}
                          </div>
                          {!meetingState || meetingState.turns.length === 0 ? (
                            <p className="text-[var(--lightgray)] leading-relaxed">
                              Speaker separation runs strictly in volatile memory with zero audio written to disk. Click &ldquo;Start Live Meeting Scribe&rdquo; below to preview live diarization.
                            </p>
                          ) : (
                            <div className="space-y-1.5 border-t border-dashed border-[var(--hairline)] pt-2">
                              {meetingState.turns.slice(-4).map((t, idx) => (
                                <div key={idx} className="text-[11px] text-[var(--bright)]">
                                  <span className="text-[var(--lime)]">[{t.attendeeName}]</span> {t.text}
                                </div>
                              ))}
                              {meetingState.actions.slice(0, 3).map((act) => (
                                <div key={act.id} className="text-[11px] text-[var(--verified)]">
                                  + {act.title} ({act.owner})
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {workspaceTab === 'activity' && (
                        <div className="border border-[var(--hairline)] bg-[var(--ink)] p-4 space-y-2">
                          <div className="flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--bright)]">
                            <ShieldPixelSvg className="w-4 h-4" />
                            <span>ACTION RECEIPTS &amp; 30S UNDO ({receipts.length})</span>
                          </div>
                          {receipts.length === 0 ? (
                            <p className="text-[var(--lightgray)]">Run any voice workflow above to inspect committed receipts and 30-second undo.</p>
                          ) : (
                            receipts.slice(0, 3).map((rec) => (
                              <div key={rec.receiptId} className="border-t border-dashed border-[var(--hairline)] pt-2 space-y-1">
                                <div className="flex justify-between items-center gap-2">
                                  <span className="text-[var(--verified)]">{rec.receiptId} · {rec.status}</span>
                                  {rec.canUndo && (
                                    <button
                                      type="button"
                                      onClick={() => void handleUndoFromLedger(rec.idempotencyKey)}
                                      className="font-pixel text-[9px] px-2 py-0.5 border border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--ink)] cursor-pointer"
                                    >
                                      UNDO (30s)
                                    </button>
                                  )}
                                </div>
                                <div className="text-[var(--lightgray)]">{rec.summaryLines.join(' | ')}</div>
                              </div>
                            ))
                          )}
                          {auditLog.length > 0 && (
                            <div className="border-t border-dashed border-[var(--hairline)] pt-2 space-y-0.5 text-[11px] text-[var(--lightgray)]">
                              {auditLog.slice(0, 4).map((ev) => (
                                <div key={ev.id} className="truncate">
                                  <span className="text-[var(--lime)]">[{ev.kind}]</span> {ev.detail}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <LiveVoiceStudio
                sessionToken={sessionToken}
                orbState={orbState}
                rmsLevel={hudState.rmsLevel ?? 0}
                activeSpokenWord={activeSpokenWord}
                armProgress01={armProgress01}
                voiceEngineLabel={voiceEngineLabel}
                activeLlmProvider={activeLlmProvider}
                micActive={micActive}
                voiceLatencyMs={voiceLatencyMs}
                backchannelText={backchannelText}
                meetingState={meetingState}
                memories={unifiedMemories}
                externalTaskSeq={externalTaskSeq}
                onRefreshMemories={() => {
                  if (tokenRef.current) void refreshWorkspaceInspector(tokenRef.current);
                }}
                onToggleMic={() => void toggleLiveMic()}
                onRingEvent={(kind) => void ctrlRef.current?.handleEvent({ kind })}
                onRunCommand={(cmd) => void runVoicePreset(cmd)}
                onStartMeetingDemo={() => void runLiveMeetingDemo()}
                onWrapUpMeeting={() => void runMeetingWrapUp()}
                onAskMeeting={(q) => void askMeetingClaude(q)}
                onWipeMeeting={() => void wipeMeetingScribe()}
                onPreviewStaged={(preview) => {
                  ctrlRef.current?.stagePreview(preview, true);
                  setVoiceFeedback(`Staged by Personal Partner: ${preview.summaryLines[0] ?? 'Ready to confirm'}. Confirm 2s ring to send.`);
                }}
                onLiveUiUpdate={async (surface) => {
                  const directLines = surface.components
                    .map((c) => c.text ?? '')
                    .filter((t) => t.trim().length > 0);
                  if (directLines.length > 0 && !surface.presetKey) {
                    ctrlRef.current?.showAnswer(
                      [surface.title.toUpperCase(), ...directLines].slice(0, 4),
                    );
                    return;
                  }
                  const tok = tokenRef.current;
                  if (!tok) return;
                  const res = await fetch('/api/liveui', {
                    headers: { Authorization: `Bearer ${tok}` },
                    credentials: 'include',
                  }).catch(() => null);
                  if (res?.ok) {
                    const j = (await res.json()) as { g2?: { lines?: string[] } };
                    if (j.g2?.lines) {
                      ctrlRef.current?.showAnswer(j.g2.lines);
                      return;
                    }
                  }
                  ctrlRef.current?.showAnswer([`LIVEUI | ${surface.title.toUpperCase()}`, 'Interactive surface synced to G2']);
                }}
                onPlayTts={(spokenText) => speakCompanionReply(spokenText)}
              />
            </div>
          </div>
        </section>

        {/* Sticky read-and-write loop with bits streaming along it (#loop) */}
        <Suspense fallback={<LoopPlaceholder />}>
          <LoopSection />
        </Suspense>

        {/* Looping real footage in rounded video cards (#clips) */}
        <ClipCards />

        {/* A day with OnQ: sticky stacked story, every chapter runnable (#use-cases) */}
        <section id="use-cases" className="py-20 sm:py-28">
          <div className="container-page">
            <DayStory
              actions={{
                openLens: () => setLensPovOpen(true),
                pairGlasses: () =>
                  document.getElementById('pair-heading')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                runMorning: () => {
                  void runVoicePreset('Morning brief');
                  setLensPovOpen(true);
                },
                runCodingPr: () => {
                  void runVoicePreset('Check PR status');
                  setLensPovOpen(true);
                },
                runLate: () => {
                  void runVoicePreset('Push 15m and tell Investor');
                  setLensPovOpen(true);
                },
                startScribe: () => {
                  void runLiveMeetingDemo();
                  setLensPovOpen(true);
                },
                tryLock: () => {
                  void stageCommand('Move VC sync to 14:45');
                  setLensPovOpen(true);
                },
                stageTelegram: () => {
                  void stageTelegramBrief();
                  setLensPovOpen(true);
                },
                runEvening: () => {
                  void runVoicePreset('Evening report');
                  setLensPovOpen(true);
                },
              }}
            />
          </div>
        </section>

        <ProofStrip />

        {/* Sticky Scroll Safety Story (#safety) */}
        <StickySafetyStory />

        {/* Antigravity-Style Account & Cloud Connectors (#connectors) */}
        <ConnectorsHub
          sessionToken={sessionToken}
          mode={sessionMode}
          ttsVoiceId={ttsVoiceId}
          onChangeTtsVoice={setTtsVoiceId}
          onSessionUpdated={(tok, m) => {
            tokenRef.current = tok;
            setSessionToken(tok);
            setSessionMode(m);
            void refreshCorridor(tok);
          }}
          onRevokeSession={async () => {
            const res = await fetch('/api/demo/session', { method: 'POST', credentials: 'include' });
            if (res.ok) {
              const j = (await res.json()) as { sessionToken: string };
              tokenRef.current = j.sessionToken;
              setSessionToken(j.sessionToken);
              setSessionMode('DEMO');
              void refreshCorridor(j.sessionToken);
            } else {
              tokenRef.current = null;
              setSessionToken(null);
              setWorkspace(null);
            }
          }}
        />

        {/* Interactive System Architecture & Telemetry (#architecture) */}
        <ArchitectureShowcase testCount={VERIFIED_TEST_COUNT} />

        {/* Visual Survey Graphs, Curves & Field Benchmark (#research) */}
        <ResearchGraphsSection testCount={VERIFIED_TEST_COUNT} />

        {/* FAQ (#faq): heading pins left, answers stay open */}
        <section id="faq" className="py-20 sm:py-28">
          <div className="container-page grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
            <ScrollReveal className="lg:col-span-4 lg:sticky lg:top-24 self-start space-y-4">
              <h2 className="font-dots font-black leading-[0.95] text-[2.4rem] sm:text-[3.2rem] text-[var(--bright)]">
                <GlyphDecodeHeading text="Questions" />
              </h2>
              <p className="text-sm sm:text-base text-[var(--lightgray)] leading-relaxed max-w-sm">
                Short answers about safety, hardware and your data.
              </p>
            </ScrollReveal>

            <div className="lg:col-span-8 space-y-3">
              {[
                {
                  q: 'Has it run on real glasses?',
                  a: 'Not yet. Everything is verified in the Even Hub Simulator 0.9.5. Physical G2 testing is next.',
                },
                {
                  q: 'Which apps does it use?',
                  a: 'Google Calendar, Gmail, Drive, Notion and Telegram. Claude, ChatGPT or OpenRouter do the thinking. AssemblyAI handles voice.',
                },
                {
                  q: 'Where do my account keys live?',
                  a: 'On your own computer, in an encrypted vault. They never go to the browser or the glasses.',
                },
                {
                  q: 'What stops a bad email from steering OnQ?',
                  a: 'Email text is treated as data, never as instructions. A fact check runs before any preview, and recipients are fixed on the server.',
                },
                {
                  q: 'What if the mic fires by accident or the slot is taken?',
                  a: 'Silence is dropped before transcription. Nothing sends until you confirm and the 2-second undo ring runs. Double-bookings are blocked right before saving.',
                },
                {
                  q: 'Where does sound come from?',
                  a: 'The G2 has no camera or speaker, so audio goes to your earbuds.',
                },
              ].map((item, i) => (
                <ScrollReveal key={item.q} delay={Math.min(i, 3) * 0.04}>
                  <details open className="ob-card group px-6 py-5">
                    <summary className="cursor-pointer list-none font-display text-lg font-medium text-[var(--bright)]">
                      {item.q}
                    </summary>
                    <p className="mt-2.5 text-sm leading-relaxed text-[var(--lightgray)]">{item.a}</p>
                  </details>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section aria-labelledby="cta-heading" className="pb-24 sm:pb-32">
          <div className="container-page">
            <ScrollReveal className="ob-card relative overflow-hidden px-6 pt-14 pb-12 sm:pb-16 min-h-[32rem] text-center flex flex-col items-center justify-end gap-5">
              <Suspense fallback={null}>
                <BinaryField
                  mode="form"
                  shape="text"
                  text="OnQ"
                  behavior="enter"
                  cx={0.5}
                  cy={0.27}
                  boxWidth={0.46}
                  ambient={0.25}
                  maxAlpha={0.42}
                  maxGlyphs={480}
                  className="absolute inset-0 h-full w-full"
                />
              </Suspense>
              <h2 id="cta-heading" className="relative font-dots font-black leading-[0.95] text-[2.4rem] sm:text-[3.6rem] text-[var(--bright)]">
                <GlyphDecodeHeading text="Put it on" />
              </h2>
              <p className="relative text-sm sm:text-base text-[var(--lightgray)] max-w-md">
                Try every flow in your browser. No glasses needed.
              </p>
              <a href="#experience" className="relative retro-btn-primary px-6 py-3 text-sm">
                Try the live demo
              </a>
            </ScrollReveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--hairline)] py-8">
        <div className="container-page flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-[var(--lightgray)]">
          <div className="flex flex-wrap items-center gap-3">
            <OnQLogo showWordmark />
            <span className="font-pixel text-[10px] uppercase tracking-[0.18em] text-[var(--lightgray)]">
              EVEN REALITIES G2 · TRACK 04 + TELEGRAM
            </span>
            <span className="inline-flex items-center gap-2 pl-2 border-l border-dashed border-[var(--hairline)]" aria-label="Supported ecosystems">
              <NotionPixelSvg className="w-3.5 h-3.5" />
              <TelegramPixelSvg className="w-3.5 h-3.5" />
              <CalendarPixelSvg className="w-3.5 h-3.5" />
              <GmailPixelSvg className="w-3.5 h-3.5" />
              <DrivePixelSvg className="w-3.5 h-3.5" />
              <ClaudePixelSvg className="w-3.5 h-3.5" />
              <ChatGptPixelSvg className="w-3.5 h-3.5" />
              <OpenRouterPixelSvg className="w-3.5 h-3.5" />
              <AssemblyAiPixelSvg className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex flex-wrap gap-6">
            <a href="#experience" className="hover:text-[var(--bright)]">3D Glasses</a>
            <a href="#architecture" className="hover:text-[var(--bright)]">Architecture</a>
            <a href="#research" className="hover:text-[var(--bright)]">Research</a>
            <a href="#connectors" className="hover:text-[var(--bright)]">Connectors</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
