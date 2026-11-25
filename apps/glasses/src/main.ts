import {
  AudioInputSource,
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  ListContainerProperty,
  ListItemContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  BlePaintQueue,
  clipLine42,
  createInitialHudState,
  encodeCornerMarkerPng,
  encodeCountdownRingPng,
  encodePixelAvatarPng,
  formatLensFrame,
  formatLiveUiForG2,
  normalizeEvenEvent,
  OnQHudController,
  PcmRingBuffer,
} from '@onq/core';
import type {
  ActionPreview,
  CommitReceipt,
  ConflictLockDetail,
  CorridorCard,
  HudPhase,
  HudState,
  LiveUiSurface,
  MeetingSessionState,
  SourceMode,
} from '@onq/core';

const RELAY_BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ONQ_RELAY ??
  'http://127.0.0.1:8787';

const TEXT_CONTAINER_ID = 1;
const LIST_CONTAINER_ID = 2;
const RING_CONTAINER_ID = 3;

const lensEl = document.getElementById('lens-text') as HTMLPreElement | null;
const ringImgEl = document.getElementById('ring-img') as HTMLImageElement | null;

let bridge: EvenAppBridge | null = null;
let sessionToken: string | null = null;
let containerMode: 'text-only' | 'detail-list' | 'ring-split' | null = null;
let sseSource: EventSource | null = null;
let activeLiveUi: LiveUiSurface | null = null;
let avatarTick = 0;
const paintQueue = new BlePaintQueue(250);
const pcmBuffer = new PcmRingBuffer();

async function ensureSession(): Promise<string> {
  if (sessionToken) return sessionToken;
  if (bridge) {
    try {
      const stored = await bridge.getLocalStorage('onq_session_token');
      if (stored && stored.startsWith('oc_')) {
        sessionToken = stored;
        return sessionToken;
      }
    } catch {
      // fall through to demo session mint
    }
  }
  const res = await fetch(`${RELAY_BASE}/api/demo/session`, { method: 'POST' });
  const json = (await res.json()) as { sessionToken: string };
  sessionToken = json.sessionToken;
  if (bridge) {
    try {
      await bridge.setLocalStorage('onq_session_token', sessionToken);
    } catch {
      // ignore storage failure
    }
  }
  return sessionToken;
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  const tok = await ensureSession();
  const res = await fetch(`${RELAY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

function renderLocalDom(state: HudState): void {
  const frame = formatLensFrame(state);
  if (lensEl) lensEl.textContent = frame.bodyText;
  if (ringImgEl) {
    if (state.phase === 'armed' && frame.ringProgress01 !== undefined) {
      const png = encodeCountdownRingPng(frame.ringProgress01, 76);
      const blob = new Blob([new Uint8Array(png)], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const prev = ringImgEl.dataset.blobUrl;
      if (prev) URL.revokeObjectURL(prev);
      ringImgEl.dataset.blobUrl = url;
      ringImgEl.src = url;
      ringImgEl.style.display = 'block';
    } else if (state.phase === 'listening' || state.phase === 'meeting_live') {
      avatarTick += 1;
      const png = encodePixelAvatarPng(state.phase === 'meeting_live' ? 'speaking' : 'listening', {
        tick: avatarTick,
        rmsLevel: Math.max(0.35, state.rmsLevel),
        style: 'muse',
        size: 76,
      });
      const blob = new Blob([new Uint8Array(png)], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const prev = ringImgEl.dataset.blobUrl;
      if (prev) URL.revokeObjectURL(prev);
      ringImgEl.dataset.blobUrl = url;
      ringImgEl.src = url;
      ringImgEl.style.display = 'block';
    } else {
      ringImgEl.style.display = 'none';
    }
  }
  (window as unknown as Record<string, unknown>).__ONQ_G2__ = {
    phase: state.phase,
    sourceMode: state.sourceMode,
    containerMode,
    header: frame.header,
    lines: frame.lines,
    utf8Bytes: frame.utf8Bytes,
    selectedCardIndex: state.selectedCardIndex,
    previewSelection: state.previewSelection,
  };
}

function buildDetailListItems(state: HudState): string[] {
  const card = state.cards[state.selectedCardIndex];
  if (!card || card.quickActions.length === 0) {
    return ['All clear - no actions available'];
  }
  return card.quickActions.slice(0, 6).map((a) => clipLine42(a.label, 38));
}

async function paintToGlasses(state: HudState): Promise<void> {
  renderLocalDom(state);
  if (!bridge) return;

  const frame = formatLensFrame(state);
  const wantRing = state.phase === 'armed' && frame.ringProgress01 !== undefined;
  const wantAvatar = state.phase === 'listening' || state.phase === 'meeting_live';
  const wantImage = wantRing || wantAvatar;
  const wantList = state.phase === 'detail' && (state.cards[state.selectedCardIndex]?.quickActions.length ?? 0) > 0;
  const desiredMode: 'text-only' | 'detail-list' | 'ring-split' = wantImage
    ? 'ring-split'
    : wantList
      ? 'detail-list'
      : 'text-only';

  if (containerMode !== desiredMode || desiredMode === 'detail-list') {
    const isInitial = containerMode === null;
    containerMode = desiredMode;
    await paintQueue.enqueueOp(async () => {
      if (!bridge) return;

      if (desiredMode === 'detail-list') {
        const card = state.cards[state.selectedCardIndex];
        const items = buildDetailListItems(state);
        const hdrText = `${frame.header}\n${clipLine42(card?.title ?? 'ACTIONS', 42)}`;
        const payload = {
          containerTotalNum: 2,
          textObject: [
            new TextContainerProperty({
              xPosition: 12,
              yPosition: 8,
              width: 552,
              height: 70,
              containerID: TEXT_CONTAINER_ID,
              containerName: 'detail-hdr',
              isEventCapture: 0,
              borderWidth: 0,
              paddingLength: 2,
              content: hdrText,
              textColor: 4,
            }),
          ],
          listObject: [
            new ListContainerProperty({
              xPosition: 12,
              yPosition: 86,
              width: 552,
              height: 190,
              containerID: LIST_CONTAINER_ID,
              containerName: 'detail-list',
              isEventCapture: 1,
              borderWidth: 0,
              paddingLength: 4,
              itemContainer: new ListItemContainerProperty({
                itemCount: items.length,
                itemWidth: 536,
                isItemSelectBorderEn: 1,
                itemName: items,
              }),
            }),
          ],
        };
        if (isInitial) {
          await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(payload));
        } else {
          await bridge.rebuildPageContainer(new RebuildPageContainer(payload));
        }
        return;
      }

      const textProp = new TextContainerProperty({
        xPosition: wantImage ? 104 : 12,
        yPosition: 10,
        width: wantImage ? 460 : 552,
        height: 268,
        containerID: TEXT_CONTAINER_ID,
        containerName: 'main-hud',
        isEventCapture: 1,
        borderWidth: 0,
        paddingLength: 4,
        content: frame.bodyText,
        textColor: 4,
      });

      const imageObject = wantImage
        ? [
            new ImageContainerProperty({
              xPosition: 14,
              yPosition: 106,
              width: 76,
              height: 76,
              containerID: RING_CONTAINER_ID,
              containerName: 'undo-ring',
            }),
          ]
        : undefined;

      const payload = {
        containerTotalNum: wantImage ? 2 : 1,
        textObject: [textProp],
        ...(imageObject ? { imageObject } : {}),
      };

      if (isInitial) {
        await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(payload));
      } else {
        await bridge.rebuildPageContainer(new RebuildPageContainer(payload));
      }
    });
  } else {
    await paintQueue.enqueueText(async () => {
      if (!bridge) return;
      await bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: TEXT_CONTAINER_ID,
          containerName: 'main-hud',
          contentOffset: 0,
          contentLength: frame.utf8Bytes,
          content: frame.bodyText,
        }),
      );
    });
  }

  if (wantRing && frame.ringProgress01 !== undefined) {
    const png = encodeCountdownRingPng(frame.ringProgress01, 76);
    await paintQueue.enqueueImage(async () => {
      if (!bridge) return;
      await bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: RING_CONTAINER_ID,
          containerName: 'undo-ring',
          imageData: Array.from(png),
        }),
      );
    }, frame.ringProgress01 === 0);
  } else if (wantAvatar) {
    avatarTick += 1;
    const png = encodePixelAvatarPng(state.phase === 'meeting_live' ? 'speaking' : 'listening', {
      tick: avatarTick,
      rmsLevel: Math.max(0.35, state.rmsLevel),
      style: 'muse',
      size: 76,
    });
    await paintQueue.enqueueImage(async () => {
      if (!bridge) return;
      await bridge.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: RING_CONTAINER_ID,
          containerName: 'undo-ring',
          imageData: Array.from(png),
        }),
      );
    }, false);
  }
}

async function persistSnapshot(): Promise<void> {
  if (!bridge) return;
  const st = controller.getState();
  try {
    await bridge.setLocalStorage(
      'onq_cache',
      JSON.stringify({
        selectedCardIndex: st.selectedCardIndex,
        cards: st.cards,
        syncedAtIso: st.syncedAtIso,
      }),
    );
  } catch {
    // ignore storage limit errors
  }
}

async function hydrateFromCache(): Promise<void> {
  if (!bridge) return;
  try {
    const raw = await bridge.getLocalStorage('onq_cache');
    if (raw) {
      const parsed = JSON.parse(raw) as { cards?: CorridorCard[]; syncedAtIso?: string };
      if (parsed.cards && parsed.cards.length > 0 && controller.getState().cards.length === 0) {
        controller.setCorridor(parsed.cards, 'STALE', 'CACHED HYDRATE', parsed.syncedAtIso);
      }
    }
  } catch {
    // ignore cache parse errors
  }
}

const controller: OnQHudController = new OnQHudController(createInitialHudState([], 'DEMO'), {
  onStateChange: (state) => {
    void paintToGlasses(state);
  },
  onRefreshCorridor: async () => {
    const { data } = await apiJson<{
      cards: CorridorCard[];
      sourceMode: SourceMode;
      provenanceLabel: string;
      syncedAtIso: string;
    }>('/api/corridor');
    return data;
  },
  onStageAction: async (card, actionIndex) => {
    const opt = card.quickActions[actionIndex] ?? card.quickActions[0];
    if (opt?.commandText === '__START_LIVE_SCRIBE__') {
      await apiJson('/api/meeting/start', {
        method: 'POST',
        body: JSON.stringify({ attendees: ['Priya Nair', 'Alex Chen'] }),
      });
      const { data: meeting } = await apiJson<MeetingSessionState>('/api/meeting/turn', {
        method: 'POST',
        body: JSON.stringify({
          speakerLabel: 'Speaker A',
          text: 'Live scribe active on Even G2 with Muse 4-bit avatar.',
          isFinal: true,
        }),
      });
      controller.setMeetingSession(meeting);
      return null;
    }
    if (opt?.commandText === '__SYNTHESIZE_PROACTIVE__') {
      await apiJson('/api/proactive/synthesize', {
        method: 'POST',
        body: JSON.stringify({ focusHint: 'Synthesize corridor plan from Even G2' }),
      });
      return null;
    }
    if (opt?.commandText === '__OS_RUN_PIPELINE__') {
      const { data: pipeRes } = await apiJson<{ run?: { g2Lines?: string[] } }>('/api/os/pipeline/run', {
        method: 'POST',
        body: JSON.stringify({ preset: 'software_delivery', goal: 'Evening G2 OS crew check' }),
      });
      if (pipeRes.run?.g2Lines?.length) {
        controller.showAnswer(pipeRes.run.g2Lines);
      }
      return null;
    }
    if (opt?.commandText === '__OS_MUSIC_FOCUS__') {
      const { data: musRes } = await apiJson<{ g2Lines?: string[] }>('/api/os/music/curate', {
        method: 'POST',
        body: JSON.stringify({ mood: 'deep_focus', durationMin: 45 }),
      });
      if (musRes.g2Lines?.length) {
        controller.showAnswer(musRes.g2Lines);
      }
      return null;
    }
    if (opt?.commandText === '__OS_RUN_ROUTINE__') {
      const { data: rtnRes } = await apiJson<{ g2Lines?: string[] }>('/api/os/routines/run', {
        method: 'POST',
        body: JSON.stringify({ routineId: 'morning_brief' }),
      });
      if (rtnRes.g2Lines?.length) {
        controller.showAnswer(rtnRes.g2Lines);
      }
      return null;
    }
    if (opt?.commandText === '__OS_TOGGLE_KILLSWITCH__') {
      await apiJson('/api/os/killswitch', {
        method: 'POST',
        body: JSON.stringify({ reason: 'Toggled from Even G2 temple' }),
      });
      const { data: corr } = await apiJson<{
        cards: CorridorCard[];
        sourceMode: SourceMode;
        provenanceLabel: string;
        syncedAtIso: string;
      }>('/api/corridor');
      controller.setCorridor(corr.cards, corr.sourceMode, corr.provenanceLabel, corr.syncedAtIso);
      return null;
    }
    if (opt?.commandText === '__OS_APPROVE_LATEST__') {
      const { data: osSt } = await apiJson<{ approvals?: Array<{ id: string; status: string }> }>('/api/os/state');
      const pending = osSt.approvals?.find((a) => a.status === 'PENDING');
      if (!pending) {
        controller.showAnswer(['NO PENDING L2 APPROVAL', 'Queue is already clear']);
        return null;
      }
      const { data: dec } = await apiJson<{ ok: boolean; error?: string; item?: { title?: string; executionDetail?: string } }>(
        `/api/os/approvals/${pending.id}/decide`,
        {
          method: 'POST',
          body: JSON.stringify({ decision: 'approve', surface: 'glasses' }),
        },
      );
      controller.showAnswer([
        dec.ok ? `L2 EXECUTED: ${pending.id}` : `L2 BLOCKED: ${pending.id}`,
        clipLine42(dec.item?.title ?? 'OS Approval'),
        clipLine42(dec.item?.executionDetail ?? dec.error ?? 'Done'),
      ]);
      return null;
    }
    const { status, data } = await apiJson<ActionPreview | ConflictLockDetail>('/api/actions/stage', {
      method: 'POST',
      body: JSON.stringify({
        cardId: card.id,
        commandText: opt?.commandText ?? 'Push 15m and tell Priya',
      }),
    });
    if (status === 409) return data as ConflictLockDetail;
    return data as ActionPreview;
  },
  onExitMeeting: async () => {
    await apiJson('/api/meeting/wipe', { method: 'POST', body: '{}' }).catch(() => null);
  },
  onStageSlot: async (slotStartIso, slotEndIso) => {
    const card = controller.getState().cards[controller.getState().selectedCardIndex];
    const { status, data } = await apiJson<ActionPreview | ConflictLockDetail>('/api/actions/stage', {
      method: 'POST',
      body: JSON.stringify({
        cardId: card?.id,
        slotStartIso,
        slotEndIso,
      }),
    });
    if (status === 409) return data as ConflictLockDetail;
    return data as ActionPreview;
  },
  onCommitPreview: async (preview) => {
    const { status, data } = await apiJson<CommitReceipt | ConflictLockDetail>('/api/actions/commit', {
      method: 'POST',
      body: JSON.stringify({
        previewToken: preview.previewToken,
        idempotencyKey: preview.idempotencyKey,
      }),
    });
    if (status === 409) return data as ConflictLockDetail;
    if (status >= 400) {
      throw new Error(`HTTP ${status}: ${(data as { status?: string }).status ?? 'Commit failed'}`);
    }
    return data as CommitReceipt;
  },
  onUndoReceipt: async (receipt) => {
    const { data } = await apiJson<CommitReceipt>('/api/actions/undo', {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey: receipt.idempotencyKey }),
    });
    return data;
  },
  onStartVoice: () => {
    pcmBuffer.reset();
    if (bridge) {
      void bridge.audioControl(true, AudioInputSource.Glasses);
    }
  },
  onStopVoice: async () => {
    if (bridge) {
      void bridge.audioControl(false, AudioInputSource.Glasses);
    }
    const gate = pcmBuffer.passesSilenceGate();
    if (!gate.ok) {
      controller.showError('SILENT PRESS - NO AUDIO SENT');
      return;
    }
    const tok = await ensureSession();
    const res = await fetch(`${RELAY_BASE}/api/stt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}` },
      body: new Blob([new Uint8Array(pcmBuffer.toWav())], { type: 'audio/wav' }),
    });
    if (!res.ok) {
      controller.showError(`STT ERROR HTTP ${res.status}`);
      return;
    }
    const stt = (await res.json()) as { rejectedSilent: boolean; transcript: string };
    if (stt.rejectedSilent || !stt.transcript) {
      controller.showError('SILENT PRESS - NO AUDIO SENT');
      return;
    }
    if (
      stt.transcript.startsWith('/') ||
      /\b(kill switch|pause all|resume os|curate music|focus music|run crew|specialist crew)\b/i.test(
        stt.transcript,
      )
    ) {
      const osOut = await apiJson<{ g2Lines?: string[] }>('/api/os/command', {
        method: 'POST',
        body: JSON.stringify({ text: stt.transcript, surface: 'glasses' }),
      });
      if (osOut.data.g2Lines?.length) {
        controller.showAnswer(osOut.data.g2Lines);
      }
      return;
    }
    const card = controller.getState().cards[controller.getState().selectedCardIndex];
    const staged = await apiJson<ActionPreview | ConflictLockDetail | { readOnlyAnswer?: boolean; lines?: string[] }>(
      '/api/actions/stage',
      {
        method: 'POST',
        body: JSON.stringify({ commandText: stt.transcript, cardId: card?.id }),
      },
    );
    if (staged.status === 409) {
      controller.showConflict(staged.data as ConflictLockDetail);
      return;
    }
    if ('readOnlyAnswer' in staged.data && staged.data.readOnlyAnswer && staged.data.lines) {
      controller.showAnswer(staged.data.lines);
      return;
    }
    if ('previewToken' in staged.data) {
      controller.stagePreview(staged.data);
    }
  },
  onRequestShutdown: () => {
    void persistSnapshot();
    if (bridge) {
      void bridge.shutDownPageContainer(1);
    }
  },
});

function startSseSync(tok: string): void {
  if (typeof EventSource === 'undefined') return;
  try {
    sseSource?.close();
    sseSource = new EventSource(`${RELAY_BASE}/api/stream?token=${encodeURIComponent(tok)}`);
    sseSource.addEventListener('corridor', () => {
      if (activeLiveUi) return;
      void apiJson<{
        cards: CorridorCard[];
        sourceMode: SourceMode;
        provenanceLabel: string;
        syncedAtIso: string;
      }>('/api/corridor').then(({ data }) => {
        if (!activeLiveUi) {
          controller.setCorridor(data.cards, data.sourceMode, data.provenanceLabel, data.syncedAtIso);
        }
      });
    });
    sseSource.addEventListener('meeting', (ev) => {
      try {
        const meeting = JSON.parse((ev as MessageEvent).data) as MeetingSessionState | null;
        if (meeting && meeting.active) {
          controller.setMeetingSession(meeting);
        } else {
          controller.setMeetingSession(null);
        }
      } catch {
        // ignore malformed SSE meeting frame
      }
    });
    sseSource.addEventListener('proactive', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as {
          activeHarness?: {
            goal?: string;
            rationale?: string;
            orchestratorUsed?: string;
            suggestedCommand?: string;
            opticalCardLines?: string[];
          } | null;
        };
        const activeHarness = parsed?.activeHarness;
        const state = controller.getState();
        if (!activeHarness || state.phase !== 'idle') return;
        const nowIso = new Date().toISOString();
        const sourceMode: SourceMode = state.sourceMode === 'STALE' ? 'DEMO' : state.sourceMode;
        const proactiveCard: CorridorCard = {
          id: 'card-proactive-harness',
          sourceMode,
          syncedAtIso: nowIso,
          provenanceLabel: 'PROACTIVE HARNESS',
          kind: 'MEETING',
          title: clipLine42('AI: ' + (activeHarness.goal ?? 'Proactive Plan'), 42),
          timeMeta: 'PROACTIVE',
          startIso: nowIso,
          endIso: new Date(Date.now() + 30 * 60000).toISOString(),
          contextLine1: clipLine42(activeHarness.opticalCardLines?.[0] ?? activeHarness.rationale ?? '', 42),
          contextLine2: clipLine42(
            activeHarness.opticalCardLines?.[1] ?? ('ORCH: ' + (activeHarness.orchestratorUsed ?? 'Rules')),
            42,
          ),
          triageRule: 'IMMINENT_MTG',
          etag: `proactive-${Date.now()}`,
          quickActions: [
            {
              id: 'qa-proactive-stage',
              label: 'Stage Proactive Harness',
              intent: 'RESCHEDULE_AND_NOTIFY',
              commandText: activeHarness.suggestedCommand ?? 'Push 15m and tell Priya',
            },
          ],
        };
        const existingWithoutProactive = state.cards.filter((c) => c.id !== 'card-proactive-harness');
        controller.setCorridor(
          [proactiveCard, ...existingWithoutProactive],
          sourceMode,
          state.provenanceLabel || 'PROACTIVE HARNESS',
          nowIso,
        );
      } catch {
        // ignore malformed SSE proactive frame
      }
    });
    sseSource.addEventListener('os_state', () => {
      if (controller.getState().phase !== 'idle' || activeLiveUi) return;
      void apiJson<{
        cards: CorridorCard[];
        sourceMode: SourceMode;
        provenanceLabel: string;
        syncedAtIso: string;
      }>('/api/corridor').then(({ data }) => {
        if (controller.getState().phase === 'idle' && !activeLiveUi) {
          controller.setCorridor(data.cards, data.sourceMode, data.provenanceLabel, data.syncedAtIso);
        }
      });
    });
    sseSource.addEventListener('liveui', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as { surface?: LiveUiSurface | null };
        if (parsed?.surface) {
          activeLiveUi = parsed.surface;
          const formatted = formatLiveUiForG2(activeLiveUi);
          if (lensEl) lensEl.textContent = formatted.bodyText;
          if (ringImgEl) {
            avatarTick += 1;
            const png = encodeCornerMarkerPng('focused', avatarTick);
            const blob = new Blob([new Uint8Array(png)], { type: 'image/png' });
            const url = URL.createObjectURL(blob);
            const prev = ringImgEl.dataset.blobUrl;
            if (prev) URL.revokeObjectURL(prev);
            ringImgEl.dataset.blobUrl = url;
            ringImgEl.src = url;
            ringImgEl.style.display = 'block';
          }
          if (bridge) {
            void paintQueue.enqueueOp(async () => {
              if (!bridge) return;
              await bridge.textContainerUpgrade(
                new TextContainerUpgrade({
                  containerID: TEXT_CONTAINER_ID,
                  contentOffset: 0,
                  contentLength: 1000,
                  content: formatted.bodyText,
                }),
              );
            });
          }
        }
      } catch {
        // ignore malformed SSE liveui frame
      }
    });
  } catch {
    // ignore SSE unavailability
  }
}

async function bootstrap(): Promise<void> {
  try {
    const maybeBridge = await Promise.race([
      waitForEvenAppBridge(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    bridge = maybeBridge;
  } catch {
    bridge = null;
  }

  if (bridge) {
    await hydrateFromCache();
    bridge.onEvenHubEvent((raw) => {
      const ev = normalizeEvenEvent(raw);
      if (ev.kind === 'AUDIO_PCM' && ev.audioPcm) {
        pcmBuffer.push(ev.audioPcm);
        if (controller.getState().phase === 'listening') {
          controller.setListening(Math.min(1, pcmBuffer.getRms() * 4), '');
        }
        return;
      }
      if (ev.kind === 'FOREGROUND_EXIT') {
        void persistSnapshot();
      }
      if (activeLiveUi) {
        if (ev.kind === 'DOUBLE_CLICK') {
          activeLiveUi = null;
          void paintToGlasses(controller.getState());
          return;
        }
        const actionType =
          ev.kind === 'CLICK'
            ? 'tap'
            : ev.kind === 'SCROLL_DOWN'
              ? 'next_row'
              : ev.kind === 'SCROLL_UP'
                ? 'prev_row'
                : null;
        if (actionType) {
          void apiJson<{ surface?: LiveUiSurface }>('/api/liveui/interact', {
            method: 'POST',
            body: JSON.stringify({ type: actionType }),
          });
          return;
        }
      }
      void controller.handleEvent(ev);
    });
  }

  try {
    const tok = await ensureSession();
    startSseSync(tok);
    const { data } = await apiJson<{
      cards: CorridorCard[];
      sourceMode: SourceMode;
      provenanceLabel: string;
      syncedAtIso: string;
    }>('/api/corridor');
    controller.setCorridor(data.cards, data.sourceMode, data.provenanceLabel, data.syncedAtIso);
  } catch {
    controller.setCorridor([], 'STALE', 'OFFLINE CACHE');
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') void controller.handleEvent({ kind: 'SCROLL_DOWN' });
    else if (e.key === 'ArrowUp') void controller.handleEvent({ kind: 'SCROLL_UP' });
    else if (e.key === 'Enter') void controller.handleEvent({ kind: 'CLICK' });
    else if (e.key === 'Escape') void controller.handleEvent({ kind: 'DOUBLE_CLICK' });
  });

  (window as unknown as Record<string, unknown>).__ONQ_G2_ACTION__ = async (
    phaseOrCommand: HudPhase | string,
  ) => {
    if (phaseOrCommand === 'reset') {
      await apiJson('/api/workspace/reset', { method: 'POST', body: '{}' });
      const { data } = await apiJson<{
        cards: CorridorCard[];
        sourceMode: SourceMode;
        provenanceLabel: string;
        syncedAtIso: string;
      }>('/api/corridor');
      controller.setCorridor(data.cards, data.sourceMode, data.provenanceLabel, data.syncedAtIso);
    }
  };
}

void bootstrap();
