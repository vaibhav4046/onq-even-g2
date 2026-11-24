import {
  AudioInputSource,
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  BlePaintQueue,
  createInitialHudState,
  encodeCountdownRingPng,
  formatLensFrame,
  normalizeEvenEvent,
  OnCueHudController,
  PcmRingBuffer,
} from '@oncue/core';
import type {
  ActionPreview,
  CommitReceipt,
  ConflictLockDetail,
  CorridorCard,
  HudPhase,
  HudState,
  SourceMode,
} from '@oncue/core';

const RELAY_BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ONCUE_RELAY ??
  'http://127.0.0.1:8787';

const TEXT_CONTAINER_ID = 1;
const RING_CONTAINER_ID = 3;

const lensEl = document.getElementById('lens-text') as HTMLPreElement | null;
const ringImgEl = document.getElementById('ring-img') as HTMLImageElement | null;

let bridge: EvenAppBridge | null = null;
let sessionToken: string | null = null;
let containerMode: 'text-only' | 'ring-split' | null = null;
const paintQueue = new BlePaintQueue(250);
const pcmBuffer = new PcmRingBuffer();

async function ensureSession(): Promise<string> {
  if (sessionToken) return sessionToken;
  if (bridge) {
    try {
      const stored = await bridge.getLocalStorage('oncue_session_token');
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
      await bridge.setLocalStorage('oncue_session_token', sessionToken);
    } catch {
      // ignore storage failure in standalone mode
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
    } else {
      ringImgEl.style.display = 'none';
    }
  }
  (window as unknown as Record<string, unknown>).__ONCUE_G2__ = {
    phase: state.phase,
    sourceMode: state.sourceMode,
    header: frame.header,
    lines: frame.lines,
    utf8Bytes: frame.utf8Bytes,
    selectedCardIndex: state.selectedCardIndex,
    previewSelection: state.previewSelection,
  };
}

async function paintToGlasses(state: HudState): Promise<void> {
  renderLocalDom(state);
  if (!bridge) return;

  const frame = formatLensFrame(state);
  const wantRing = state.phase === 'armed' && frame.ringProgress01 !== undefined;
  const desiredMode: 'text-only' | 'ring-split' = wantRing ? 'ring-split' : 'text-only';

  if (containerMode !== desiredMode) {
    const isInitial = containerMode === null;
    containerMode = desiredMode;
    await paintQueue.enqueueOp(async () => {
      if (!bridge) return;
      const textProp = new TextContainerProperty({
        xPosition: wantRing ? 104 : 12,
        yPosition: 10,
        width: wantRing ? 460 : 552,
        height: 268,
        containerID: TEXT_CONTAINER_ID,
        containerName: 'main-hud',
        isEventCapture: 1,
        borderWidth: 0,
        paddingLength: 4,
        content: frame.bodyText,
        textColor: 4,
      });

      const imageObject = wantRing
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
        containerTotalNum: wantRing ? 2 : 1,
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
  }
}

const controller = new OnCueHudController(createInitialHudState([], 'DEMO'), {
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
    const stt = (await res.json()) as { rejectedSilent: boolean; transcript: string };
    if (stt.rejectedSilent || !stt.transcript) {
      controller.showError('SILENT PRESS - NO AUDIO SENT');
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
    if (bridge) {
      void bridge.shutDownPageContainer(1);
    }
  },
});

async function bootstrap(): Promise<void> {
  // Detect Even App Bridge (with 1.5s timeout fallback for standalone browser preview)
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
    bridge.onEvenHubEvent((raw) => {
      const ev = normalizeEvenEvent(raw);
      if (ev.kind === 'AUDIO_PCM' && ev.audioPcm) {
        pcmBuffer.push(ev.audioPcm);
        if (controller.getState().phase === 'listening') {
          controller.setListening(Math.min(1, pcmBuffer.getRms() * 4), '');
        }
        return;
      }
      void controller.handleEvent(ev);
    });
  }

  try {
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

  // Expose keyboard controls when previewed directly in browser
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') void controller.handleEvent({ kind: 'SCROLL_DOWN' });
    else if (e.key === 'ArrowUp') void controller.handleEvent({ kind: 'SCROLL_UP' });
    else if (e.key === 'Enter') void controller.handleEvent({ kind: 'CLICK' });
    else if (e.key === 'Escape') void controller.handleEvent({ kind: 'DOUBLE_CLICK' });
  });

  // Expose deterministic helper for verify-sim.mjs state verification if needed
  (window as unknown as Record<string, unknown>).__ONCUE_G2_ACTION__ = async (
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
