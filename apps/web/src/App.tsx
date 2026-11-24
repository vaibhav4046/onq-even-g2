import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createInitialHudState,
  encodePcm16ToWav,
  OnCueHudController,
} from '@oncue/core';
import type {
  ActionPreview,
  CommitReceipt,
  ConflictLockDetail,
  CorridorCard,
  HudState,
  SourceMode,
} from '@oncue/core';
import { EvidenceSection } from './components/EvidenceSection';
import { G2LensCanvas } from './components/G2LensCanvas';
import { HalftoneArtwork } from './components/HalftoneArtwork';
import { startBrowserMicCapture } from './components/MicRecorder';
import type { MicRecordingHandle } from './components/MicRecorder';
import { PairingSection } from './components/PairingSection';

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

  // Live workspace mutation inputs
  const [newBusyTitle, setNewBusyTitle] = useState('');
  const [newBusyTime, setNewBusyTime] = useState('14:15');
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = sessionToken;
  const ctrlRef = useRef<OnCueHudController | null>(null);
  const micHandleRef = useRef<MicRecordingHandle | null>(null);

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

    const ctrl = new OnCueHudController(createInitialHudState([GEOMETRY_SAMPLE_CARD], 'DEMO'), {
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

  const stageCommand = async (cmd: string) => {
    const tok = tokenRef.current;
    if (!tok) {
      setVoiceFeedback('Relay offline. Start local server with npm run dev.');
      return;
    }
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
  };

  const toggleLiveMic = async () => {
    const tok = tokenRef.current;
    if (!tok) return;
    if (!micActive) {
      try {
        ctrlRef.current?.setListening(0.05, '');
        setVoiceFeedback('Listening via browser mic (16 kHz PCM)... click Stop & Transcribe when done.');
        micHandleRef.current = await startBrowserMicCapture((rms) => {
          ctrlRef.current?.setListening(rms, '');
        });
        setMicActive(true);
      } catch (err) {
        setMicActive(false);
        ctrlRef.current?.showError('MIC PERMISSION DENIED');
        setVoiceFeedback(err instanceof Error ? err.message : 'Microphone unavailable');
      }
      return;
    }

    setMicActive(false);
    const handle = micHandleRef.current;
    micHandleRef.current = null;
    if (!handle) return;
    const { wavBlob } = await handle.stop();
    setVoiceFeedback('Running RMS silence gate + local Whisper STT...');
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
        'X-OnCue-Preset': presetText,
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
      {/* Sticky KaneCLI-styled Navbar */}
      <header className="sticky top-0 z-40 h-16 bg-[var(--ink)] border-b border-[var(--hairline)]">
        <div className="container-page h-full flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-3 group">
            <svg width="28" height="18" viewBox="0 0 28 18" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="10" height="14" stroke="#daff52" strokeWidth="2" />
              <rect x="17" y="2" width="10" height="14" stroke="#daff52" strokeWidth="2" />
              <rect x="11" y="7" width="6" height="2" fill="#f2f2f2" />
            </svg>
            <span className="font-pixel text-xs uppercase tracking-[0.18em] text-[var(--bright)] group-hover:text-[var(--lime)]">
              ONCUE // G2
            </span>
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
              className="px-4 py-2 border border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--ink)] text-xs sm:text-sm transition-colors"
            >
              Pair G2
            </a>
            <button
              type="button"
              onClick={() => void runVoicePreset('Push 15m and tell Priya')}
              className="px-4 py-2 bg-[var(--bright)] text-[var(--ink)] hover:bg-[var(--lime)] text-xs sm:text-sm font-medium transition-colors cursor-pointer"
            >
              Run Voice Demo
            </button>
          </div>
        </div>
      </header>

      {/* Hero + Interactive 576x288 Simulator Workbench */}
      <main id="top">
        <section id="simulator" className="py-12 sm:py-16 relative overflow-hidden">
          <div className="container-page relative">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-10 animate-rise">
              <div className="lg:col-span-8 space-y-5">
                <p className="font-pixel text-xs uppercase tracking-[0.25em] text-[var(--lightgray)]">
                  TRACK 04 · AI ASSISTANTS &amp; WORK · EVEN HUB SDK 0.0.16
                </p>
                <h1 className="font-dots font-black leading-[0.95] tracking-[-0.02em] text-[2.4rem] sm:text-[3.5rem] lg:text-[4.25rem]">
                  <span className="block text-[var(--lightgray)]">Own the 90 seconds</span>
                  <span className="block text-[var(--bright)]">between meetings.</span>
                </h1>
                <p className="text-sm md:text-base leading-relaxed text-[var(--lightgray)] max-w-2xl">
                  OnCue fuses Google Calendar, Gmail, Drive, Notion, and .ics feeds into one 42-column
                  glance on Even Realities G2, then executes voice-staged updates behind a Default-NO gate,
                  2.0s optical Undo Ring, and HTTP 409 conflict hard-lock.
                </p>
                <div className="font-pixel text-[11px] uppercase tracking-[0.18em] text-[var(--lime)]">
                  GOOGLE WORKSPACE + NOTION + .ICS · LOCAL WHISPER · ZERO KEYS IN WEBVIEW
                </div>
              </div>
              <div className="lg:col-span-4 flex flex-col items-end">
                <div className="border border-dashed border-[var(--hairline)] bg-[var(--surface)] p-3 w-full max-w-[340px]">
                  <HalftoneArtwork variant="optics" theme="dark" className="w-full h-auto" />
                  <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--lightgray)]">
                    <span>[ 1 ] 576x288 waveguide field</span>
                    <span className="font-pixel text-[10px] text-[var(--lime)]">{sessionMode}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive 576x288 Simulator + Live Companion Control Center */}
            <div className="border border-dashed border-[var(--hairline)] bg-[var(--surface)]">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-px bg-[var(--hairline)]">
                {/* Left: 576x288 Optical Lens & R1 Hardware Controls */}
                <div className="xl:col-span-7 bg-[var(--ink)] p-5 sm:p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
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
                      <G2LensCanvas hudState={hudState} opticsMode={opticsMode} />
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
                      {micActive ? 'Stop & Transcribe (Local Whisper)' : 'Speak Live Mic'}
                    </button>
                  </div>

                  {/* Voice Presets, Q&A & Fault Triggers */}
                  <div className="border-t border-dashed border-[var(--hairline)] pt-4 space-y-3">
                    <div className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lightgray)]">
                      16KHZ PCM VOICE CLIPS, NOTES Q&amp;A &amp; FAULT TESTS
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
                        onClick={() => void runVoicePreset('Task: send Q4 metrics to Alex by Thursday')}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs hover:border-[var(--bright)] cursor-pointer"
                      >
                        Voice: Action Pack (Notion + Hold)
                      </button>
                      <button
                        type="button"
                        onClick={() => void stageCommand('What did Priya ask?')}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs hover:border-[var(--verified)] cursor-pointer"
                      >
                        Ask Notes (Read-Only)
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
                        Test Silent WAV (RMS Gate)
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleFaultOffline()}
                        className="px-3 py-1.5 border border-[var(--hairline)] text-xs hover:border-[var(--bright)] cursor-pointer"
                      >
                        Toggle STALE Offline
                      </button>
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
                      {/* Calendar + Add Busy Slot */}
                      <div className="border border-[var(--hairline)] bg-[var(--ink)] p-3 space-y-2">
                        <div className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)]">
                          GOOGLE CALENDAR
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
                        <div className="flex items-center justify-between">
                          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)]">
                            GMAIL THREADS
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
                        <div className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)]">
                          NOTION DATABASE (AUTO-SCHEMA)
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
                        <div className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--bright)]">
                          AUDIT RECEIPT LEDGER ({receipts.length})
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

        {/* 4-Layer Safety Matrix (#safety) */}
        <section id="safety" className="section-rule py-20 sm:py-28">
          <div className="container-page space-y-8">
            <div className="space-y-3">
              <p className="font-pixel text-xs uppercase tracking-[0.25em] text-[var(--lightgray)]">
                WRITE SAFETY ARCHITECTURE
              </p>
              <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
                <span className="block text-[var(--lightgray)]">Voice never fires blind.</span>
                <span className="block text-[var(--bright)]">Four deterministic locks.</span>
              </h2>
            </div>

            <div>
              <div className="bg-[var(--lime)] text-[#0a0a0a] p-6 border border-dashed border-[var(--hairline)] border-b-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="font-pixel text-[10px] uppercase tracking-[0.2em] block">
                    PREREQUISITE INVARIANT
                  </span>
                  <p className="font-display text-xl sm:text-2xl font-bold mt-1">
                    Zero unconfirmed writes. Every workspace mutation passes all four checks:
                  </p>
                </div>
                <span className="font-pixel text-xs uppercase tracking-[0.18em] bg-[#0a0a0a] text-[#f2f2f2] px-3 py-2 shrink-0">
                  RMS &ge; 0.012 · TTL 45S
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px border border-dashed border-[var(--hairline)] bg-[var(--hairline)]">
                {[
                  {
                    num: '01',
                    title: 'Default-NO Gate',
                    desc: 'Voice only stages a diff preview. Selection locks to [NO - CANCEL] until you swipe and tap.',
                  },
                  {
                    num: '02',
                    title: '2.0s PNG Undo Ring',
                    desc: 'Custom 76x76 4-bit ring sweeps at 4 Hz. Any tap cancels with zero writes; 0.0s locks inputs synchronously.',
                  },
                  {
                    num: '03',
                    title: 'HTTP 409 Hard-Lock',
                    desc: 'Re-queries Calendar Free/Busy, Gmail historyId, and Notion last_edited_time at commit time.',
                  },
                  {
                    num: '04',
                    title: 'Code-Guard Verifier',
                    desc: 'Recipients bind strictly from server thread metadata. LLM-invented emails, times, or injections fall back safely.',
                  },
                ].map((item) => (
                  <div key={item.num} className="bg-[var(--ink)] hover:bg-[var(--surface)] p-6 space-y-3 transition-colors">
                    <div className="font-dots text-4xl font-black text-[var(--lime)]">{item.num}</div>
                    <h3 className="font-display text-xl font-bold text-[var(--bright)]">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-[var(--lightgray)]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Full-Bleed Light-Inversion Section (#hardware) */}
        <section
          id="hardware"
          className="section-rule py-20 sm:py-28 bg-[#f2f2f2] text-[#0a0a0a] [--bright:#0a0a0a] [--hairline:#c4c4c4] [--ink:#f2f2f2] [--lightgray:#525252] [--surface:#e8e8e8]"
        >
          <div className="container-page space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <p className="font-pixel text-xs uppercase tracking-[0.25em] text-[#525252]">
                  HARDWARE &amp; UNIT ECONOMICS
                </p>
                <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
                  <span className="block text-[#525252]">Built for 576x288.</span>
                  <span className="block text-[#0a0a0a]">Zero phone clutter.</span>
                </h2>
                <p className="text-sm md:text-base leading-relaxed text-[#525252] max-w-xl">
                  Exercises all three Even Hub SDK 0.0.16 containers (Text, native List, 4-bit Image),
                  proto3 omitted-zero normalization, defensive audio frame slicing, and zero-custody local Whisper.
                </p>
              </div>
              <div className="lg:col-span-5 flex flex-col items-end">
                <div className="border border-dashed border-[#c4c4c4] bg-[#e8e8e8] p-4 w-full max-w-[340px]">
                  <HalftoneArtwork variant="ring" theme="light" className="w-full h-auto" />
                  <div className="mt-2 text-[11px] text-[#525252]">
                    [ 2 ] 76x76 4-bit Gray8 Countdown Ring
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 border-t border-b border-dashed border-[#c4c4c4] divide-y md:divide-y-0 md:divide-x divide-dashed divide-[#c4c4c4]">
              {[
                {
                  rank: '42col',
                  metric: '576x288 / <= 999B',
                  tag: 'OPTICAL BUDGET',
                  desc: 'Word-boundary wrapped body lines capped at 999 UTF-8 bytes with >= 70% pure black transparent waveguide pixels.',
                },
                {
                  rank: '0ms',
                  metric: 'Local Rules + Whisper',
                  tag: 'ZERO PAID KEYS NEEDED',
                  desc: 'Deterministic triage rules, chrono-node dates, and local faster-whisper 16 kHz PCM STT run at £0 API cost.',
                },
                {
                  rank: '$7/mo',
                  metric: '~$0.001 / brief est.',
                  tag: 'TARGET PRO MODEL',
                  desc: 'Planned Work-Pro tier (unlaunched). Deterministic rules handle 80% of ranking before optional LLM compression.',
                },
              ].map((spec) => (
                <div key={spec.rank} className="py-8 md:px-6 first:md:pl-0 last:md:pr-0 space-y-3">
                  <div className="font-dots text-5xl sm:text-6xl font-black leading-none text-[#0a0a0a]">
                    {spec.rank}
                  </div>
                  <div className="font-display text-2xl font-bold text-[#0a0a0a]">{spec.metric}</div>
                  <span className="inline-block bg-[var(--lime)] text-[#0a0a0a] px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.15em]">
                    {spec.tag}
                  </span>
                  <p className="text-sm text-[#525252] leading-relaxed">{spec.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4-Column Corridor Modes (#modes) */}
        <section id="modes" className="section-rule py-20 sm:py-28">
          <div className="container-page space-y-8">
            <div className="space-y-3">
              <p className="font-pixel text-xs uppercase tracking-[0.25em] text-[var(--lightgray)]">
                CORRIDOR WORKFLOWS
              </p>
              <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
                <span className="block text-[var(--lightgray)]">Four core loops.</span>
                <span className="block text-[var(--bright)]">Zero dead widgets.</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px border border-dashed border-[var(--hairline)] bg-[var(--hairline)]">
              {[
                {
                  num: '01',
                  tag: 'READ · GCAL+GMAIL+DRIVE',
                  title: 'Pre-Meeting Brief',
                  bullets: ['Next event & countdown', 'Attendee latest email ask', 'Linked Drive doc snippet'],
                  inverted: false,
                },
                {
                  num: '02',
                  tag: 'WRITE · ATOMIC',
                  title: 'Shift + Reply',
                  bullets: ['Speak "Push 15m, tell Priya"', 'Checks Calendar Free/Busy', 'Sends threaded Gmail reply'],
                  inverted: false,
                },
                {
                  num: '03',
                  tag: 'WRITE · NOTION+CAL',
                  title: 'Hallway Action Pack',
                  bullets: ['Auto-discovers Notion schema', 'Creates task + due date', 'Books verified free hold'],
                  inverted: false,
                },
                {
                  num: '04',
                  tag: 'GUARD · HTTP 409',
                  title: 'Conflict Hard-Lock',
                  bullets: ['Blocks overlapping slots', 'Catches stale thread drift', 'Suggests next verified slot'],
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
                          ? 'inline-block border border-[#0a0a0a] px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.15em]'
                          : 'inline-block border border-[var(--lime)] text-[var(--lime)] px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.15em]'
                      }
                    >
                      {lane.tag}
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
            <div className="lg:col-span-5 space-y-4">
              <p className="font-pixel text-xs uppercase tracking-[0.25em] text-[var(--lightgray)]">
                TECHNICAL NOTES &amp; HONEST LIMITS
              </p>
              <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem]">
                <span className="block text-[var(--lightgray)]">How it works.</span>
                <span className="block text-[var(--bright)]">No guesswork.</span>
              </h2>
              <ul className="space-y-2 text-sm text-[var(--lightgray)] pt-2">
                <li>-&gt; Tested in Even Hub Simulator 0.9.5 and Chromium Geometry Gate.</li>
                <li>-&gt; Physical Even G2 + R1 ring hardware testing pending.</li>
                <li>-&gt; Strictly Track 04 providers: Google Workspace, Notion, Claude/OpenRouter/ChatGPT.</li>
              </ul>
            </div>

            <div className="lg:col-span-7 divide-y divide-dashed divide-[var(--hairline)] border-t border-b border-dashed border-[var(--hairline)]">
              {[
                {
                  q: 'Why does OnCue pair OAuth on the phone instead of inside the G2 WebView?',
                  a: 'Google blocks OAuth consent screens inside embedded WebViews. Pairing generates a 15-minute single-use 6-digit code (locked after 10 wrong tries) and keeps AES-256-GCM encrypted refresh tokens strictly on your local relay at mode 0600.',
                },
                {
                  q: 'What prevents an email prompt injection from emailing an attacker?',
                  a: 'External email and Drive bodies are wrapped in <untrusted_workspace_data> tags, reply recipients are bound strictly from Gmail thread metadata on the server (spoofed "to" fields return HTTP 400), and Code-Guard validates every fact before staging a Default-NO preview.',
                },
                {
                  q: 'What happens if I tap twice right as the 2.0s Undo Ring hits 0.0s?',
                  a: 'At 0.0s, the state machine synchronously transitions from armed to committing before awaiting network I/O, locking all taps and scrolls. On the server, preview tokens are single-use (409 on replay) and backed by a SHA-256 idempotency key.',
                },
                {
                  q: 'Does OnCue require an LLM API key or cloud database to work?',
                  a: 'No. Triage ranking, chrono-node date resolution, conflict hard-locking, faster-whisper STT, and node:sqlite storage all run locally with zero paid keys. Optional Claude/OpenRouter/ChatGPT keys and Neon DATABASE_URL plug in cleanly when provided.',
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
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--hairline)] py-8">
        <div className="container-page flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[var(--lightgray)]">
          <div className="font-pixel uppercase tracking-[0.18em] text-[var(--bright)]">
            ONCUE · EVEN REALITIES G2 · TRACK 04
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
