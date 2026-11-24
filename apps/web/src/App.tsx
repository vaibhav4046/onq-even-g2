import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  AssemblyAiPixelSvg,
  CalendarPixelSvg,
  ClaudePixelSvg,
  DrivePixelSvg,
  EcosystemStrip,
  EvenG2PixelSvg,
  GmailPixelSvg,
  NotionPixelSvg,
  ShieldPixelSvg,
} from './components/EcosystemIcons';
import { EvidenceSection } from './components/EvidenceSection';
import { G2Hardware3D } from './components/G2Hardware3D';
import { G2LensCanvas } from './components/G2LensCanvas';
import { startBrowserMicCapture } from './components/MicRecorder';
import type { MicRecordingHandle } from './components/MicRecorder';
import {
  GlyphDecodeHeading,
  KineticNumber,
  MOTION_EASE,
  ScrollProgressRail,
  ScrollReveal,
} from './components/MotionPrimitives';
import { OnQLogo } from './components/OnQLogo';
import { OnQVoiceOrb } from './components/OnQVoiceOrb';
import { PairingSection } from './components/PairingSection';
import { StickySafetyStory } from './components/StickySafetyStory';

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
  title: 'VC Sync - Priya Nair',
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
      label: 'Push 15m + Reply Priya',
      intent: 'RESCHEDULE_AND_NOTIFY',
      commandText: 'Push 15m and tell Priya',
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
      '2) MAIL: Reply Priya "Running 15m late"',
      '3) NOTION: Log shift to VC Sync note',
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
      return { ...base, phase: 'listening', rmsLevel: 0.68, transcript: 'Push 15m and tell Priya' };
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
            'OK MAIL: Sent to Priya Nair',
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
          attendees: ['Priya Nair', 'Alex Chen'],
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
              attendeeName: 'Priya',
              text: 'Send Q4 deck to Alex by Thursday 15:00.',
              atIso: '2026-11-24T13:59:10.000Z',
              isWearer: false,
              isFinal: true,
            },
          ],
          decisions: [{ id: 'd1', summary: 'Lock Q4 metrics for Thursday', speaker: 'You', atIso: '2026-11-24T13:58:00.000Z' }],
          actions: [{ id: 'a1', title: 'Send Q4 deck to Alex', owner: 'Priya' }],
        },
      };
    case 'WRAP_UP':
      return {
        ...base,
        phase: 'wrap_up',
        preview: {
          ...preview,
          summaryLines: [
            '1) NOTION: Send Q4 deck to Alex',
            '2) GCAL: Follow-up 17:00 (30m)',
            '3) MAIL: Draft Priya Nair (Rules)',
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

export function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const geometryMode = params.get('geometry') === '1';
  const geometryStateName = params.get('state') ?? 'DOSSIER';

  const [opticsMode, setOpticsMode] = useState<'waveguide' | 'raw'>('waveguide');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<'LIVE' | 'DEMO' | 'STALE'>('DEMO');
  const [hudState, setHudState] = useState<HudState>(() =>
    geometryMode ? buildGeometryState(geometryStateName) : createInitialHudState([GEOMETRY_SAMPLE_CARD], 'DEMO'),
  );
  const [workspace, setWorkspace] = useState<SnapshotState | null>(null);
  const [receipts, setReceipts] = useState<CommitReceipt[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEventItem[]>([]);
  const [commandInput, setCommandInput] = useState('Push 15m and tell Priya');
  const [voiceFeedback, setVoiceFeedback] = useState<string>('Ready. Speak with Live Mic or click a preset WAV clip.');
  const [simLoading, setSimLoading] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [voiceEngineLabel, setVoiceEngineLabel] = useState('DEMO · SANDBOX');
  const [ttsVoiceId, setTtsVoiceId] = useState('aai-kyla');
  const [speakingNow, setSpeakingNow] = useState(false);
  const [activeSpokenWord, setActiveSpokenWord] = useState('');
  const [meetingState, setMeetingState] = useState<MeetingSessionState | null>(null);
  const [thinkingNow, setThinkingNow] = useState(false);

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

  const refreshWorkspaceInspector = useCallback(async (tok: string) => {
    try {
      const res = await fetch('/api/workspace/state', {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        snapshot: SnapshotState;
        receipts: CommitReceipt[];
        auditLog?: AuditEventItem[];
      };
      setWorkspace(json.snapshot);
      setReceipts(json.receipts);
      if (json.auditLog) setAuditLog(json.auditLog);
    } catch {
      // keep existing inspector state
    }
  }, []);

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
          body: JSON.stringify({ cardId: card.id, commandText: opt?.commandText ?? 'Push 15m and tell Priya' }),
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
        const res = await fetch('/api/demo/session', { method: 'POST' });
        if (!res.ok) throw new Error('Relay unavailable');
        const json = (await res.json()) as { sessionToken: string };
        if (cancelled) return;
        tokenRef.current = json.sessionToken;
        setSessionToken(json.sessionToken);
        await refreshCorridor(json.sessionToken);
      } catch {
        if (!cancelled) {
          setWorkspace({
            calendarEvents: [
              {
                eventId: 'evt-vc-priya',
                title: 'VC Sync - Priya Nair',
                startIso: '2026-11-24T14:00:00.000Z',
                endIso: '2026-11-24T14:30:00.000Z',
                attendeeName: 'Priya Nair',
              },
              {
                eventId: 'evt-design-busy',
                title: 'Design Review (Busy Lock)',
                startIso: '2026-11-24T14:45:00.000Z',
                endIso: '2026-11-24T15:15:00.000Z',
                attendeeName: 'Dana Kim',
              },
            ],
            gmailThreads: [
              {
                threadId: 'thr-priya-1',
                fromName: 'Priya Nair',
                fromEmail: 'priya@tvm.example',
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
                title: 'Send Q4 metrics to Alex',
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
        void ctrlRef.current?.handleEvent({ kind: 'DOUBLE_CLICK' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [geometryMode]);

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
      if (data.lines) {
        ctrlRef.current?.showAnswer(data.lines);
        setVoiceFeedback(`Claude + RAM Scribe (${data.speech?.engine ?? 'TTS'}): ${data.lines.join(' | ')}`);
      }
      if (data.speech) {
        await playSpeechOutput(data.speech);
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
      await refreshWorkspaceInspector(tok);
      if (res.status === 409) {
        ctrlRef.current?.showConflict(data as ConflictLockDetail);
        setVoiceFeedback(`409 CONFLICT LOCKED: ${(data as ConflictLockDetail).message}`);
        return;
      }
      if (!res.ok) {
        ctrlRef.current?.showError((data as { error?: string }).error ?? `HTTP ${res.status}`);
        setVoiceFeedback((data as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      if (data.readOnlyAnswer && data.lines) {
        ctrlRef.current?.showAnswer(data.lines as string[]);
        setVoiceFeedback(`Read-only answer: ${(data.lines as string[]).join(' | ')}`);
        return;
      }
      ctrlRef.current?.stagePreview(data as ActionPreview);
      setVoiceFeedback('Staged Default-NO preview. Swipe to YES and tap to arm 2.0s Undo Ring.');
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
                ctrlRef.current?.setListening(0.32, msg.transcript);
              }
            } catch {
              // ignore malformed stream frame
            }
          };
        } catch {
          voiceWsRef.current = null;
        }

        micHandleRef.current = await startBrowserMicCapture(
          (rms) => {
            ctrlRef.current?.setListening(rms, '');
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

    setMicActive(false);
    if (voiceWsRef.current) {
      voiceWsRef.current.close();
      voiceWsRef.current = null;
    }
    const handle = micHandleRef.current;
    micHandleRef.current = null;
    if (!handle) return;
    const { wavBlob } = await handle.stop();
    setVoiceFeedback('Running RMS silence gate + AssemblyAI / Whisper STT...');
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
    await refreshWorkspaceInspector(tok);
    if (!res.ok) {
      ctrlRef.current?.showError(stt.error ?? `STT HTTP ${res.status}`);
      setVoiceFeedback(stt.error ?? `STT HTTP ${res.status}`);
      return;
    }
    if (stt.rejectedSilent || !stt.transcript) {
      ctrlRef.current?.showError('SILENT PRESS - NO AUDIO SENT');
      setVoiceFeedback(`RMS Gate blocked silent audio (RMS=${(stt.rms ?? 0).toFixed(4)} < 0.012).`);
      return;
    }
    setVoiceFeedback(`Transcribed via ${stt.sttEngine}: "${stt.transcript}"`);
    await stageCommand(stt.transcript);
  };

  const runVoicePreset = async (presetText: string, silent = false) => {
    const tok = tokenRef.current;
    if (!tok) return;
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
    await refreshWorkspaceInspector(tok);
    if (stt.rejectedSilent) {
      ctrlRef.current?.showError('SILENT PRESS - NO AUDIO SENT');
      setVoiceFeedback(`RMS Gate blocked silent WAV (RMS=${stt.rms.toFixed(4)} < 0.012). 0 STT calls.`);
      return;
    }
    setVoiceFeedback(`Transcribed via ${stt.sttEngine} (RMS=${stt.rms.toFixed(2)}): "${stt.transcript}"`);
    await stageCommand(stt.transcript);
  };

  const toggleFaultOffline = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    const goOffline = hudState.phase !== 'stale';
    await fetch('/api/workspace/fault', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceOffline: goOffline }),
    });
    await refreshCorridor(tok);
    setVoiceFeedback(goOffline ? 'Simulated offline drop: lens preserves cached state as STALE.' : 'Network restored.');
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
    setVoiceFeedback('Sandbox workspace reset to initial 14:00 VC Sync state.');
  };

  const handleAddBusySlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const tok = tokenRef.current;
    if (!tok || !newBusyTitle.trim()) return;
    const startIso = `2026-11-24T${newBusyTime}:00.000Z`;
    const endIso = new Date(Date.parse(startIso) + 30 * 60_000).toISOString();
    await fetch('/api/workspace/calendar/add', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newBusyTitle.trim(), startIso, endIso }),
    });
    setNewBusyTitle('');
    await refreshWorkspaceInspector(tok);
    setVoiceFeedback(`Added Calendar block "${newBusyTitle.trim()}" at ${newBusyTime}. Try moving VC Sync there to test 409 Lock!`);
  };

  const handleSimulateIncomingReply = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    await fetch('/api/workspace/gmail/incoming', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: 'Actually let us do 15:00 instead - Priya' }),
    });
    await refreshWorkspaceInspector(tok);
    setVoiceFeedback('Simulated incoming Priya reply (historyId bumped). Committing old card now triggers 409 CONFLICT_THREAD_UPDATED!');
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
      {/* Sticky KaneCLI-styled Navbar */}
      <header className="sticky top-0 z-40 h-16 bg-[var(--ink)]/95 backdrop-blur-sm border-b border-[var(--hairline)]">
        <div className="container-page h-full flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-3 group">
            <OnQLogo showWordmark />
          </a>

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 text-sm text-[var(--lightgray)]">
            <a href="#simulator" className="hover:text-[var(--bright)] transition-colors">Simulator</a>
            <a href="#evidence" className="hover:text-[var(--bright)] transition-colors">Evidence</a>
            <a href="#safety" className="hover:text-[var(--bright)] transition-colors">Safety</a>
            <a href="#hardware" className="hover:text-[var(--bright)] transition-colors">Hardware</a>
            <a href="#pair" className="hover:text-[var(--bright)] transition-colors">Pair G2</a>
            <a href="#faq" className="hover:text-[var(--bright)] transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="#pair"
              className="px-4 py-2 border border-[var(--hairline)] text-[var(--bright)] hover:border-[var(--lime)] hover:text-[var(--lime)] text-xs sm:text-sm transition-colors"
            >
              Pair G2
            </a>
            <button
              type="button"
              onClick={() => void runVoicePreset('Push 15m and tell Priya')}
              className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] hover:bg-[var(--bright)] text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Run Voice Demo
            </button>
          </div>
        </div>
      </header>

      {/* Hero + Interactive 3D G2 + Live Workbench */}
      <main id="top">
        <section id="simulator" className="py-12 sm:py-16 relative overflow-hidden">
          <div className="container-page relative space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: MOTION_EASE }}
                className="lg:col-span-6 space-y-5"
              >
                <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lightgray)]">
                  EVEN REALITIES G2 · TRACK 04 · SDK 0.0.16
                </p>
                <h1 className="font-dots font-black leading-[0.94] tracking-[-0.02em] text-[2.3rem] sm:text-[3.1rem] lg:text-[3.35rem] xl:text-[3.85rem]">
                  <span className="block text-[var(--lightgray)]">Own the room, before</span>
                  <span className="block text-[var(--bright)]">during, and after.</span>
                </h1>
                <p className="text-sm md:text-base leading-relaxed text-[var(--lightgray)] max-w-xl">
                  Calendar, Gmail, Drive, and Notion on Even G2, paired with AssemblyAI STT-3.7
                  &amp; TTS-1 behind Default-NO, 2.0s undo ring, and 409 conflict hard-lock.
                </p>

                <EcosystemStrip />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.08, ease: MOTION_EASE }}
                className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch"
              >
                <div className="sm:col-span-8">
                  <G2Hardware3D
                    phase={hudState.phase}
                    headerLine={`${sessionMode} | ${hudState.phase.toUpperCase()}`}
                    primaryLine={
                      hudState.cards[hudState.selectedCardIndex]?.title ?? 'VC Sync - Priya Nair'
                    }
                    ringProgress={armProgress01}
                  />
                </div>
                <OnQVoiceOrb
                  state={orbState}
                  rmsLevel={hudState.rmsLevel ?? 0}
                  activeWord={activeSpokenWord}
                  armProgress01={armProgress01}
                  engineLabel={voiceEngineLabel}
                  className="sm:col-span-4"
                />
              </motion.div>
            </div>

            {/* Interactive 576x288 Simulator + Live Companion Control Center */}
            <div className="border border-dashed border-[var(--hairline)] bg-[var(--surface)]">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-px bg-[var(--hairline)]">
                {/* Left: 576x288 Optical Lens & R1 Hardware Controls */}
                <div className="xl:col-span-7 bg-[var(--ink)] p-5 sm:p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <EvenG2PixelSvg className="w-6 h-3.5" />
                      <span className="font-pixel text-[11px] uppercase tracking-[0.2em] text-[var(--bright)]">
                        EVEN G2 WAVEGUIDE (576x288)
                      </span>
                      <span className="border border-[var(--lime)] px-2 py-0.5 font-pixel text-[10px] uppercase text-[var(--lime)]">
                        {hudState.phase.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOpticsMode((m) => (m === 'waveguide' ? 'raw' : 'waveguide'))}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs text-[var(--lightgray)] hover:text-[var(--bright)] hover:border-[var(--bright)] cursor-pointer"
                      >
                        Optics: {opticsMode === 'waveguide' ? 'Waveguide Glow' : 'Raw Pixel'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void resetSandbox()}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs text-[var(--lightgray)] hover:text-[var(--lime)] cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="g2-lens-scaler overflow-x-auto">
                    {simLoading ? (
                      <div className="g2-lens-canvas flex items-center justify-center text-xs">
                        SYNCING CORRIDOR DOSSIER...
                      </div>
                    ) : (
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`${hudState.phase}-${hudState.selectedCardIndex}`}
                          initial={{ opacity: 0.72, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0.72 }}
                          transition={{ duration: 0.16, ease: MOTION_EASE }}
                        >
                          <G2LensCanvas hudState={hudState} opticsMode={opticsMode} />
                        </motion.div>
                      </AnimatePresence>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void ctrlRef.current?.handleEvent({ kind: 'SCROLL_UP' })}
                      className="px-3 py-2 border border-[var(--hairline)] bg-[var(--surface)] text-xs hover:border-[var(--bright)] cursor-pointer"
                    >
                      Swipe Up (Up)
                    </button>
                    <button
                      type="button"
                      onClick={() => void ctrlRef.current?.handleEvent({ kind: 'SCROLL_DOWN' })}
                      className="px-3 py-2 border border-[var(--hairline)] bg-[var(--surface)] text-xs hover:border-[var(--bright)] cursor-pointer"
                    >
                      Swipe Down (Down)
                    </button>
                    <button
                      type="button"
                      onClick={() => void ctrlRef.current?.handleEvent({ kind: 'CLICK' })}
                      className="px-4 py-2 bg-[var(--bright)] text-[var(--ink)] hover:bg-[var(--lime)] text-xs font-semibold cursor-pointer"
                    >
                      Tap R1 / Temple (Enter)
                    </button>
                    <button
                      type="button"
                      onClick={() => void ctrlRef.current?.handleEvent({ kind: 'DOUBLE_CLICK' })}
                      className="px-3 py-2 border border-[var(--hairline)] bg-[var(--surface)] text-xs hover:border-[var(--bright)] cursor-pointer"
                    >
                      2x Tap / Back (Esc)
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleLiveMic()}
                      className={`px-3 py-2 border text-xs font-semibold cursor-pointer ${
                        micActive
                          ? 'border-[var(--danger)] bg-[var(--danger)] text-[var(--ink)]'
                          : 'border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {micActive ? 'Stop & Transcribe' : 'Speak Live Mic'}
                    </button>
                  </div>

                  {/* Voice Presets, Meeting Lifecycle, TTS-1 Earbuds Audio Out & Fault Triggers */}
                  <div className="border-t border-dashed border-[var(--hairline)] pt-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lightgray)]">
                        VOICE PRESETS, MEETING SCRIBE &amp; FAULT TESTS
                      </span>
                      <span className="font-pixel text-[9px] uppercase tracking-[0.14em] text-[var(--verified)]">
                        {voiceEngineLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void runVoicePreset('Push 15m and tell Priya')}
                        className="px-3 py-1.5 border border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--ink)] text-xs cursor-pointer"
                      >
                        Voice: Push 15m + Tell Priya
                      </button>
                      <button
                        type="button"
                        onClick={() => void runLiveMeetingDemo()}
                        className="px-3 py-1.5 border border-[var(--verified)] text-[var(--verified)] hover:bg-[var(--verified)] hover:text-[var(--ink)] text-xs cursor-pointer"
                      >
                        Run Live Meeting Demo
                      </button>
                      <button
                        type="button"
                        onClick={() => void askMeetingClaude('What did Priya ask about Q4?')}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs hover:border-[var(--lime)] cursor-pointer"
                      >
                        Ask &quot;OnQ, Q4?&quot; (TTS-1)
                      </button>
                      <button
                        type="button"
                        onClick={() => void runMeetingWrapUp()}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs hover:border-[var(--bright)] cursor-pointer"
                      >
                        Wrap Up &amp; Save
                      </button>
                      <button
                        type="button"
                        onClick={() => void runVoicePreset('Task: send Q4 metrics to Alex by Thursday')}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs hover:border-[var(--bright)] cursor-pointer"
                      >
                        Action Pack (Notion + Hold)
                      </button>
                      <button
                        type="button"
                        onClick={() => void stageCommand('Move VC sync to 14:45')}
                        className="px-3 py-1.5 border border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning)] hover:text-[var(--ink)] text-xs cursor-pointer"
                      >
                        Trigger 409 Conflict
                      </button>
                      <button
                        type="button"
                        onClick={() => void runVoicePreset('', true)}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs hover:border-[var(--bright)] cursor-pointer"
                      >
                        Test Silent WAV
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleFaultOffline()}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs hover:border-[var(--bright)] cursor-pointer"
                      >
                        Toggle STALE Offline
                      </button>
                    </div>

                    {/* Companion Earbuds TTS-1 Selector + Barge-In (G2 has no speaker) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border border-dashed border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 text-[11px]">
                      <div className="flex items-center gap-2 text-[var(--lightgray)]">
                        <AssemblyAiPixelSvg className="w-3.5 h-3.5" />
                        <span>Companion Phone / Bluetooth Earbuds Audio Out (Even G2 has no speaker)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label htmlFor="tts-voice-select" className="sr-only">
                          TTS-1 Voice
                        </label>
                        <select
                          id="tts-voice-select"
                          value={ttsVoiceId}
                          onChange={(e) => setTtsVoiceId(e.target.value)}
                          className="bg-[var(--ink)] border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--bright)]"
                        >
                          <option value="aai-kyla">aai-kyla</option>
                          <option value="aai-titus">aai-titus</option>
                          <option value="aai-audrey">aai-audrey</option>
                          <option value="aai-sara">aai-sara</option>
                          <option value="aai-ewald">aai-ewald</option>
                        </select>
                        {speakingNow && (
                          <button
                            type="button"
                            onClick={clearTtsPlayback}
                            className="px-2 py-1 border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-[var(--ink)] text-[10px] font-pixel uppercase cursor-pointer"
                          >
                            Stop TTS (Barge-In)
                          </button>
                        )}
                      </div>
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void stageCommand(commandInput);
                      }}
                      className="flex flex-col sm:flex-row gap-2"
                    >
                      <input
                        type="text"
                        aria-label="Simulate spoken voice command"
                        value={commandInput}
                        onChange={(e) => setCommandInput(e.target.value)}
                        className="flex-1 bg-[var(--surface)] border border-[var(--hairline)] px-3 py-2 text-xs text-[var(--bright)]"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 border border-[var(--bright)] text-[var(--bright)] hover:bg-[var(--bright)] hover:text-[var(--ink)] text-xs cursor-pointer"
                      >
                        Stage Phrase
                      </button>
                    </form>
                    <p className="text-xs text-[var(--lightgray)]" role="status">
                      {voiceFeedback}
                    </p>
                  </div>
                </div>

                {/* Right: Live Split Workspace Control Center */}
                <div className="xl:col-span-5 bg-[var(--surface)] p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-pixel text-[11px] uppercase tracking-[0.2em] text-[var(--bright)]">
                      LIVE WORKSPACE CONTROL CENTER
                    </span>
                    <span className="font-pixel text-[10px] uppercase tracking-[0.15em] text-[var(--verified)]">
                      {sessionMode} SSE SYNC
                    </span>
                  </div>

                  {!workspace ? (
                    <div className="border border-dashed border-[var(--hairline)] p-4 text-xs text-[var(--lightgray)]">
                      Connecting to workspace relay...
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      {/* RAM-Only Live Meeting Scribe */}
                      <div className="border border-[var(--hairline)] bg-[var(--ink)] p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--verified)]">
                            <AssemblyAiPixelSvg className="w-4 h-4" />
                            <span>LIVE MEETING SCRIBE (RAM-ONLY)</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            {meetingState?.active && (
                              <button
                                type="button"
                                onClick={() => void wipeMeetingScribe()}
                                className="font-pixel text-[9px] px-2 py-0.5 border border-[var(--hairline)] text-[var(--lightgray)] hover:border-[var(--danger)] hover:text-[var(--danger)] cursor-pointer"
                              >
                                Wipe RAM
                              </button>
                            )}
                          </div>
                        </div>
                        {!meetingState || meetingState.turns.length === 0 ? (
                          <p className="text-[var(--lightgray)]">
                            Idle. Click &quot;Run Live Meeting Demo&quot; for speaker diarization,
                            decisions, and &quot;OnQ, wrap up&quot;.
                          </p>
                        ) : (
                          <div className="space-y-1 border-t border-dashed border-[var(--hairline)] pt-1.5">
                            {meetingState.turns.slice(-3).map((t, idx) => (
                              <div key={idx} className="text-[11px] text-[var(--bright)] truncate">
                                <span className="text-[var(--lime)]">[{t.attendeeName}]</span> {t.text}
                              </div>
                            ))}
                            {meetingState.actions.slice(0, 2).map((act) => (
                              <div key={act.id} className="text-[11px] text-[var(--verified)] truncate">
                                + {act.title} ({act.owner})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Calendar + Add Busy Slot */}
                      <div className="border border-[var(--hairline)] bg-[var(--ink)] p-3 space-y-2">
                        <div className="flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)]">
                          <CalendarPixelSvg className="w-4 h-4" />
                          <span>GOOGLE CALENDAR</span>
                        </div>
                        {workspace.calendarEvents.map((ev) => (
                          <div key={ev.eventId} className="flex justify-between gap-2 border-t border-dashed border-[var(--hairline)] pt-1.5">
                            <span className="text-[var(--bright)] truncate">{ev.title}</span>
                            <span className="text-[var(--lightgray)] shrink-0">
                              {ev.startIso.slice(11, 16)} - {ev.endIso.slice(11, 16)}
                            </span>
                          </div>
                        ))}
                        <form onSubmit={handleAddBusySlot} className="flex gap-1.5 pt-1">
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
                            +Busy
                          </button>
                        </form>
                      </div>

                      {/* Gmail + Simulate Incoming Reply */}
                      <div className="border border-[var(--hairline)] bg-[var(--ink)] p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)]">
                            <GmailPixelSvg className="w-4 h-4" />
                            <span>GMAIL THREADS</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleSimulateIncomingReply()}
                            className="font-pixel text-[9px] px-2 py-0.5 border border-[var(--warning)] text-[var(--warning)] hover:bg-[var(--warning)] hover:text-[var(--ink)] cursor-pointer"
                          >
                            Simulate Incoming Reply
                          </button>
                        </div>
                        {workspace.gmailThreads.map((t) => (
                          <div key={t.threadId} className="border-t border-dashed border-[var(--hairline)] pt-1.5 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-[var(--bright)]">{t.fromName}</span>
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

                      {/* Notion + Add/Toggle */}
                      <div className="border border-[var(--hairline)] bg-[var(--ink)] p-3 space-y-1.5">
                        <div className="flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)]">
                          <NotionPixelSvg className="w-4 h-4" />
                          <span>NOTION DATABASE (AUTO-SCHEMA)</span>
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
                        <form onSubmit={handleAddTask} className="flex gap-1.5 pt-1">
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
                            +Task
                          </button>
                        </form>
                      </div>

                      {/* Receipts + Undo + Telemetry */}
                      <div className="border border-[var(--hairline)] bg-[var(--ink)] p-3 space-y-1.5">
                        <div className="flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--bright)]">
                          <ShieldPixelSvg className="w-4 h-4" />
                          <span>AUDIT RECEIPT LEDGER ({receipts.length})</span>
                        </div>
                        {receipts.length === 0 ? (
                          <p className="text-[var(--lightgray)]">No commits yet. Stage and arm an action to verify.</p>
                        ) : (
                          receipts.slice(0, 2).map((rec) => (
                            <div key={rec.receiptId} className="border-t border-dashed border-[var(--hairline)] pt-1.5 space-y-1">
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
                          <div className="border-t border-dashed border-[var(--hairline)] pt-1.5 space-y-0.5 text-[11px] text-[var(--lightgray)]">
                            {auditLog.slice(0, 3).map((ev) => (
                              <div key={ev.id} className="truncate">
                                <span className="text-[var(--lime)]">[{ev.kind}]</span> {ev.detail}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Research Citations, Problem Framework & 54-Entry Gallery Benchmark */}
        <EvidenceSection />

        {/* Sticky Scroll Safety Story (#safety) */}
        <StickySafetyStory />

        {/* Full-Bleed Light-Inversion Section (#hardware) */}
        <section
          id="hardware"
          className="section-rule py-20 sm:py-28 bg-[#f2f2f2] text-[#0a0a0a] [--bright:#0a0a0a] [--hairline:#c4c4c4] [--ink:#f2f2f2] [--lightgray:#525252] [--surface:#e8e8e8]"
        >
          <div className="container-page space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <ScrollReveal className="lg:col-span-6 space-y-4">
                <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[#525252]">
                  HARDWARE &amp; UNIT ECONOMICS
                </p>
                <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
                  <span className="block text-[#525252]">Built for 576x288.</span>
                  <GlyphDecodeHeading text="Zero phone clutter." className="block text-[#0a0a0a]" />
                </h2>
                <p className="text-sm md:text-base leading-relaxed text-[#525252] max-w-lg">
                  Text, native List, and 76x76 4-bit Ring containers packed cleanly into Even Hub SDK 0.0.16.
                </p>
                <div className="flex flex-wrap gap-2 pt-1" aria-label="Hardware and local runtime stack">
                  <span className="inline-flex items-center gap-1.5 border border-[#c4c4c4] bg-[#e8e8e8] px-2.5 py-1 text-[11px] font-medium text-[#0a0a0a]">
                    <EvenG2PixelSvg theme="light" className="w-5 h-3" />
                    <span>Even G2</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 border border-[#c4c4c4] bg-[#e8e8e8] px-2.5 py-1 text-[11px] font-medium text-[#0a0a0a]">
                    <AssemblyAiPixelSvg theme="light" className="w-3.5 h-3.5" />
                    <span>STT-3.7 + TTS-1</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 border border-[#c4c4c4] bg-[#e8e8e8] px-2.5 py-1 text-[11px] font-medium text-[#0a0a0a]">
                    <ClaudePixelSvg theme="light" className="w-3.5 h-3.5" />
                    <span>Claude + Rules</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 border border-[#c4c4c4] bg-[#e8e8e8] px-2.5 py-1 text-[11px] font-medium text-[#0a0a0a]">
                    <ShieldPixelSvg theme="light" className="w-3.5 h-3.5" />
                    <span>Zero Keys in WebView</span>
                  </span>
                </div>
              </ScrollReveal>
              <ScrollReveal delay={0.08} className="lg:col-span-6">
                <G2Hardware3D
                  theme="light"
                  defaultMode="ring"
                  phase={hudState.phase}
                  headerLine="R1 GESTURE + G2"
                  primaryLine="76x76 4-BIT RING"
                />
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 border-t border-b border-dashed border-[#c4c4c4] divide-y md:divide-y-0 md:divide-x divide-dashed divide-[#c4c4c4]">
              <div className="py-8 md:pr-6 space-y-2.5">
                <div className="font-dots text-5xl sm:text-6xl font-black leading-none text-[#0a0a0a]">
                  <KineticNumber value={189} />
                </div>
                <div className="font-display text-2xl font-bold text-[#0a0a0a]">Passing Tests</div>
                <span className="inline-block bg-[#0a0a0a] text-[#f2f2f2] px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.15em]">
                  CLEAN-ROOM VERIFIED
                </span>
                <p className="text-sm text-[#525252] leading-relaxed">
                  125 pure core + 64 server/voice tests plus 11/11 Chromium optical geometry checks.
                </p>
              </div>
              <div className="py-8 md:px-6 space-y-2.5">
                <div className="font-dots text-5xl sm:text-6xl font-black leading-none text-[#0a0a0a]">
                  <KineticNumber value={576} />px
                </div>
                <div className="font-display text-2xl font-bold text-[#0a0a0a]">&lt;= 999 UTF-8 Bytes</div>
                <span className="inline-block bg-[#0a0a0a] text-[#f2f2f2] px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.15em]">
                  OPTICAL BUDGET
                </span>
                <p className="text-sm text-[#525252] leading-relaxed">
                  42-column word wrapping with &gt;= 97% pure black transparent waveguide background.
                </p>
              </div>
              <div className="py-8 md:pl-6 space-y-2.5">
                <div className="font-dots text-5xl sm:text-6xl font-black leading-none text-[#0a0a0a]">
                  $<KineticNumber value={7} />/mo
                </div>
                <div className="font-display text-2xl font-bold text-[#0a0a0a]">~$0.001 / brief est.</div>
                <span className="inline-block bg-[var(--lime)] text-[#0a0a0a] px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.15em]">
                  PLANNED PRO TIER
                </span>
                <p className="text-sm text-[#525252] leading-relaxed">
                  Local Whisper, chrono-node, and SQLite run at £0 API cost; cloud LLM stays optional.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4-Column Corridor Modes (#modes) */}
        <section id="modes" className="section-rule py-20 sm:py-28">
          <div className="container-page space-y-8">
            <ScrollReveal className="space-y-2">
              <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lightgray)]">
                MEETING LIFECYCLE WORKFLOWS
              </p>
              <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
                <span className="block text-[var(--lightgray)]">Before, during, after.</span>
                <GlyphDecodeHeading text="Zero dead widgets." className="block text-[var(--bright)]" />
              </h2>
            </ScrollReveal>

            <ScrollReveal delay={0.06}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px border border-dashed border-[var(--hairline)] bg-[var(--hairline)]">
              {[
                {
                  num: '01',
                  tag: 'BEFORE · BRIEF',
                  title: 'Pre-Meeting Brief',
                  bullets: ['Next event & countdown', 'Attendee latest email ask', 'Linked Drive doc snippet'],
                  icons: (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarPixelSvg className="w-3.5 h-3.5" />
                      <GmailPixelSvg className="w-3.5 h-3.5" />
                      <DrivePixelSvg className="w-3.5 h-3.5" />
                    </span>
                  ),
                  inverted: false,
                },
                {
                  num: '02',
                  tag: 'DURING · VOICE',
                  title: 'Live Diarization + Ask',
                  bullets: ['STT-3.7 speaker labels', 'RAM-only transcript buffer', 'Read-only Claude answers'],
                  icons: (
                    <span className="inline-flex items-center gap-1.5">
                      <AssemblyAiPixelSvg className="w-3.5 h-3.5" />
                      <ClaudePixelSvg className="w-3.5 h-3.5" />
                    </span>
                  ),
                  inverted: false,
                },
                {
                  num: '03',
                  tag: 'AFTER · WRAP-UP',
                  title: 'Recap + Tasks + Hold',
                  bullets: ['Notion notes & action items', 'Verified follow-up hold', 'Gmail draft + Default-NO'],
                  icons: (
                    <span className="inline-flex items-center gap-1.5">
                      <NotionPixelSvg className="w-3.5 h-3.5" />
                      <CalendarPixelSvg className="w-3.5 h-3.5" />
                    </span>
                  ),
                  inverted: false,
                },
                {
                  num: '04',
                  tag: 'GUARD · HTTP 409',
                  title: 'Conflict Hard-Lock',
                  bullets: ['Blocks overlapping slots', 'Catches stale thread drift', 'Suggests next verified slot'],
                  icons: <ShieldPixelSvg theme="light" className="w-3.5 h-3.5" />,
                  inverted: true,
                },
              ].map((lane) => (
                <div
                  key={lane.num}
                  className={
                    lane.inverted
                      ? 'bg-[var(--lime)] text-[#0a0a0a] p-6 flex flex-col justify-between space-y-6'
                      : 'group bg-[var(--ink)] hover:bg-[var(--surface)] p-6 flex flex-col justify-between space-y-6 transition-colors'
                  }
                >
                  <div className="space-y-3">
                    <div
                      className={
                        lane.inverted
                          ? 'font-dots text-5xl font-black text-[#0a0a0a]'
                          : 'font-dots text-5xl font-black text-[var(--hairline)] group-hover:text-[var(--lime)] transition-colors'
                      }
                    >
                      {lane.num}
                    </div>
                    <span
                      className={
                        lane.inverted
                          ? 'inline-flex items-center gap-2 border border-[#0a0a0a] px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.15em]'
                          : 'inline-flex items-center gap-2 border border-[var(--lime)] text-[var(--lime)] px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.15em]'
                      }
                    >
                      {lane.icons}
                      <span>{lane.tag}</span>
                    </span>
                    <h3 className="font-display text-2xl font-bold">{lane.title}</h3>
                  </div>

                  <ul
                    className={
                      lane.inverted
                        ? 'border-t border-dashed border-[#0a0a0a]/40 pt-4 space-y-2 text-sm'
                        : 'border-t border-dashed border-[var(--hairline)] pt-4 space-y-2 text-sm text-[var(--lightgray)]'
                    }
                  >
                    {lane.bullets.map((b) => (
                      <li key={b}>-&gt; {b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Phone Pairing & Live Workspace Credentials */}
        <PairingSection
          sessionToken={sessionToken}
          mode={sessionMode}
          onSessionUpdated={(tok, m) => {
            tokenRef.current = tok;
            setSessionToken(tok);
            setSessionMode(m);
            void refreshCorridor(tok);
          }}
          onRevokeSession={() => {
            if (sessionToken) {
              void fetch('/api/session/revoke', {
                method: 'POST',
                headers: { Authorization: `Bearer ${sessionToken}` },
              });
            }
            setSessionToken(null);
            setWorkspace(null);
          }}
        />

        {/* Technical FAQ (#faq) */}
        <section id="faq" className="section-rule py-20 sm:py-28">
          <div className="container-page grid grid-cols-1 lg:grid-cols-12 gap-12">
            <ScrollReveal className="lg:col-span-5 space-y-4">
              <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lightgray)]">
                TECHNICAL NOTES
              </p>
              <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem]">
                <span className="block text-[var(--lightgray)]">How it works.</span>
                <GlyphDecodeHeading text="No guesswork." className="block text-[var(--bright)]" />
              </h2>
              <ul className="space-y-2 text-sm text-[var(--lightgray)] pt-2">
                <li>-&gt; Verified on Even Hub Simulator 0.9.5 &amp; Chromium Geometry Gate.</li>
                <li>-&gt; Physical Even G2 + R1 ring hardware testing pending.</li>
                <li>-&gt; Google Workspace, Notion 2026-03-11, Claude / OpenRouter / ChatGPT.</li>
              </ul>
            </ScrollReveal>

            <ScrollReveal delay={0.06} className="lg:col-span-7 divide-y divide-dashed divide-[var(--hairline)] border-t border-b border-dashed border-[var(--hairline)]">
              {[
                {
                  q: 'Why pair OAuth on phone instead of inside the G2 WebView?',
                  a: 'Google blocks OAuth inside embedded WebViews. Pairing uses a 15m single-use code (10-try lockout) and stores AES-256-GCM tokens on disk at mode 0600.',
                },
                {
                  q: 'How are email prompt injections blocked?',
                  a: 'Workspace bodies stay inside <untrusted_workspace_data> tags, reply recipients bind server-side (HTTP 400 on spoofed "to"), and Code-Guard validates every fact.',
                },
                {
                  q: 'What happens if I tap right as the 2.0s Undo Ring hits 0.0s?',
                  a: 'The state machine locks inputs synchronously at 0.0s before network I/O. Server preview tokens are single-use (409 on replay) with SHA-256 idempotency keys.',
                },
                {
                  q: 'Does OnQ need paid API keys or cloud hosting to run?',
                  a: 'No. Rules triage, chrono-node, faster-whisper STT, and node:sqlite run locally at £0; Claude/OpenRouter/ChatGPT and Neon Postgres remain optional.',
                },
              ].map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-display text-lg font-medium text-[var(--bright)]">
                    <span>{item.q}</span>
                    <span className="font-plex text-xl text-[var(--lime)] transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--lightgray)]">{item.a}</p>
                </details>
              ))}
            </ScrollReveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--hairline)] py-8">
        <div className="container-page flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-[var(--lightgray)]">
          <div className="flex flex-wrap items-center gap-3">
            <OnQLogo showWordmark={false} />
            <span className="font-pixel uppercase tracking-[0.18em] text-[var(--bright)]">
              ONQ · EVEN REALITIES G2 · TRACK 04
            </span>
            <span className="inline-flex items-center gap-2 pl-2 border-l border-dashed border-[var(--hairline)]" aria-label="Supported ecosystems">
              <NotionPixelSvg className="w-3.5 h-3.5" />
              <CalendarPixelSvg className="w-3.5 h-3.5" />
              <GmailPixelSvg className="w-3.5 h-3.5" />
              <DrivePixelSvg className="w-3.5 h-3.5" />
              <ClaudePixelSvg className="w-3.5 h-3.5" />
              <AssemblyAiPixelSvg className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex flex-wrap gap-6">
            <a href="#simulator" className="hover:text-[var(--bright)]">Optical Simulator</a>
            <a href="#evidence" className="hover:text-[var(--bright)]">Research &amp; Benchmark</a>
            <a href="#safety" className="hover:text-[var(--bright)]">4-Layer Safety</a>
            <a href="#pair" className="hover:text-[var(--bright)]">OAuth Pairing</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
