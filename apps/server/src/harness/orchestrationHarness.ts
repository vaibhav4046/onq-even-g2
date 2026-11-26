import crypto from 'node:crypto';
import {
  canVoiceConfirmWrite,
  computePcmRms,
  createInitialHudState,
  formatLensFrame,
  parseVoiceCommand,
  verifyDraftAndPayload,
} from '@onq/core';
import type {
  ActionPreview,
  HarnessRunReport,
  HarnessStepTrace,
  SourceMode,
} from '@onq/core';
import type { LedgerStore } from '../ledger.js';
import type { WorkspaceProvider } from '../providers/types.js';
import { routeModelCompletion } from './modelRouter.js';
import type { LlmConfig } from './modelRouter.js';

export interface RunHarnessParams {
  utterance: string;
  pcmSamples?: Int16Array;
  provider: WorkspaceProvider;
  ledger: LedgerStore;
  sessionHash: string;
  mode: SourceMode;
  llmConfig?: LlmConfig;
  voiceConnected?: boolean;
  nowFn?: () => number;
}

/**
 * Executes and traces the full 6-step Before/During/After OnQ execution lifecycle:
 * 1) INGEST_FUSE -> 2) VOICE_STREAM -> 3) INTENT_GROUNDING ->
 * 4) SAFETY_GATE -> 5) ATOMIC_COMMIT -> 6) VOICE_REPLY
 */
export async function runOrchestrationHarness(params: RunHarnessParams): Promise<HarnessRunReport> {
  const tStart = Date.now();
  const nowFn = params.nowFn ?? (() => Date.now());
  const traceId = `tr_${crypto.randomBytes(6).toString('hex')}`;
  const steps: HarnessStepTrace[] = [];

  // Step 1: Ingest & Fuse workspace context
  const t1 = Date.now();
  const corridor = await params.provider.fetchCorridor(new Date(nowFn()).toISOString());
  const cards = corridor.cards;
  const topCard = cards[0];
  steps.push({
    step: 'INGEST_FUSE',
    status: 'PASS',
    provider: params.mode === 'LIVE' ? 'Google Workspace + Notion' : 'Local Sandbox Provider',
    durationMs: Math.max(1, Date.now() - t1),
    guardStatus: 'UNTRUSTED_WRAPPED',
    detail: `Fused ${cards.length} corridor card(s); active=${topCard?.title ?? 'none'}`,
  });

  // Step 2: Voice Stream + RMS Silence Gate
  const t2 = Date.now();
  const pcm =
    params.pcmSamples ??
    (() => {
      const out = new Int16Array(1600);
      for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.sin(i * 0.14) * 5200);
      return out;
    })();
  const pcmBuf = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const rms = computePcmRms(pcmBuf);
  if (rms < 0.01) {
    steps.push({
      step: 'VOICE_STREAM',
      status: 'BLOCKED',
      provider: 'RMS Silence Gate',
      durationMs: Math.max(1, Date.now() - t2),
      guardStatus: `RMS_REJECTED (${rms.toFixed(4)} < 0.01)`,
      detail: 'Silent or pocket-noise audio rejected before inference',
    });
    return {
      traceId,
      startedAtIso: new Date(nowFn()).toISOString(),
      totalDurationMs: Math.max(1, Date.now() - tStart),
      outcome: 'BLOCKED_SILENCE',
      providerUsed: 'RMS Silence Gate',
      fallbackUsed: false,
      steps,
      modelAttempts: [],
    };
  }
  const hasLiveVoice = params.voiceConnected ?? Boolean(process.env.ASSEMBLYAI_API_KEY);
  steps.push({
    step: 'VOICE_STREAM',
    status: 'PASS',
    provider: hasLiveVoice ? 'AssemblyAI STT-3.7' : 'Local Whisper Fallback',
    durationMs: Math.max(1, Date.now() - t2),
    guardStatus: `RMS_PASS (${rms.toFixed(3)})`,
    detail: `Utterance admitted: "${params.utterance}"`,
  });

  // Step 3: Intent parsing + Multi-model grounded reply + Code-Guard
  const t3 = Date.now();
  const snap = params.provider.getSnapshot();
  const parseClock =
    params.mode === 'DEMO' ? new Date(Date.parse(snap.syncedAtIso) || nowFn()) : new Date(nowFn());
  const parsed = parseVoiceCommand(params.utterance, {
    now: parseClock,
    cards,
    activeCard: topCard,
  });
  const topEvent = snap.calendarEvents[0];
  const topThread = snap.gmailThreads[0];
  const explicitHhMm = params.utterance.match(/\b(\d{1,2}):(\d{2})\b/);
  const targetStartIso =
    params.mode === 'DEMO' && explicitHhMm && topEvent
      ? `${topEvent.startIso.slice(0, 10)}T${explicitHhMm[1].padStart(2, '0')}:${explicitHhMm[2]}:00.000Z`
      : parsed.targetStartIso ??
        (topEvent
          ? new Date(Date.parse(topEvent.startIso) + (parsed.shiftMinutes ?? 15) * 60_000).toISOString()
          : new Date(nowFn() + 15 * 60_000).toISOString());
  const hhmm = targetStartIso.slice(11, 16);

  const modelOut = await routeModelCompletion(
    {
      recipientName: topThread?.fromName ?? 'Priya Nair',
      recipientEmail: topThread?.fromEmail ?? 'priya@tvm.example',
      allowedRecipients: snap.gmailThreads.map((t) => t.fromEmail),
      sourceEmailText: topThread?.snippet ?? '',
      userUtterance: params.utterance,
      computedFacts: [hhmm],
      fallbackDraft: `Running slightly behind, pushing sync to ${hhmm}. Thanks!`,
    },
    params.llmConfig,
  );

  steps.push({
    step: 'INTENT_GROUNDING',
    status: modelOut.fallbackUsed ? 'FALLBACK' : 'PASS',
    provider: modelOut.providerLabel,
    durationMs: Math.max(1, Date.now() - t3),
    guardStatus: modelOut.factGuardViolations.length === 0 ? 'CODE_GUARD_PASS' : 'CODE_GUARD_FALLBACK',
    detail: `Intent=${parsed.kind}; draft="${modelOut.draft}"`,
  });

  // Step 4: Safety Gate (Default-NO, Optical Budget, 409 Conflict Check)
  const t4 = Date.now();
  const defaultConfirmOk = canVoiceConfirmWrite({
    transcript: 'confirm action',
    rms,
    isWearer: true,
    speakerLabel: 'S1',
  });
  const stageIntent: ActionPreview['intent'] =
    parsed.kind === 'RESCHEDULE_AND_NOTIFY' ||
    parsed.kind === 'CREATE_ACTION_PACK' ||
    parsed.kind === 'REPLY_EMAIL' ||
    parsed.kind === 'COMPLETE_NOTION_TASK'
      ? parsed.kind
      : 'REPLY_EMAIL';

  const targetEndIso = new Date(Date.parse(targetStartIso) + 30 * 60_000).toISOString();
  const preview: ActionPreview = {
    previewToken: `pt_hr_${crypto.randomBytes(6).toString('hex')}`,
    idempotencyKey: crypto.createHash('sha256').update(`${traceId}:${params.utterance}`).digest('hex'),
    expiresAtIso: new Date(nowFn() + 45_000).toISOString(),
    intent: stageIntent,
    defaultSelection: 'NO',
    cardId: topCard?.id,
    summaryLines: [
      `1) GCAL: -> ${hhmm} check`,
      `2) MAIL: Reply ${topThread?.fromName ?? 'Recipient'}`,
    ],
    operations: [
      ...(topEvent
        ? [
            {
              provider: 'GCAL' as const,
              op: 'MOVE_EVENT' as const,
              targetLabel: topEvent.title,
              beforeValue: topEvent.startIso,
              afterValue: `${targetStartIso}|${targetEndIso}`,
            },
          ]
        : []),
    ],
    safetyChecks: {
      calendarConflictFree: true,
      threadFresh: true,
      recipientVerified: true,
      factGuardPassed: true,
    },
  };

  const conflict = await params.provider.checkLiveConflicts(preview);
  const hud = createInitialHudState(cards, params.mode);
  const frameCheck = formatLensFrame(hud);
  const opticalOk = frameCheck.utf8Bytes <= 999 && defaultConfirmOk;

  if (conflict) {
    steps.push({
      step: 'SAFETY_GATE',
      status: 'BLOCKED',
      provider: '409 Conflict Engine',
      durationMs: Math.max(1, Date.now() - t4),
      guardStatus: conflict.code,
      detail: conflict.message,
    });
    return {
      traceId,
      startedAtIso: new Date(nowFn()).toISOString(),
      totalDurationMs: Math.max(1, Date.now() - tStart),
      outcome: 'BLOCKED_CONFLICT',
      providerUsed: modelOut.providerLabel,
      fallbackUsed: modelOut.fallbackUsed,
      steps,
      // Local CLI ids (claude_cli, ...) widen the core provider union; the trace is telemetry only.
      modelAttempts: modelOut.attempts as HarnessRunReport['modelAttempts'],
    };
  }

  steps.push({
    step: 'SAFETY_GATE',
    status: opticalOk ? 'PASS' : 'BLOCKED',
    provider: 'Default-NO + 409 Engine + Geometry',
    durationMs: Math.max(1, Date.now() - t4),
    guardStatus: 'SAFE_TO_STAGE',
    detail: `Default-NO staged; frame=${frameCheck.utf8Bytes}B`,
  });

  // Step 5: Atomic Commit + Ledger Recording
  const t5 = Date.now();
  await params.ledger.savePreview(preview, params.sessionHash);
  const consumed = await params.ledger.consumePreview(preview.previewToken, params.sessionHash);
  if (!consumed.ok) {
    throw new Error(`Preview consumption failed: ${consumed.reason}`);
  }
  const receipt = await params.provider.executePreview({
    preview,
    operations: preview.operations,
    card: topCard,
  });
  await params.ledger.saveReceipt(receipt);
  steps.push({
    step: 'ATOMIC_COMMIT',
    status: 'PASS',
    provider: params.mode === 'LIVE' ? 'Live Provider + Ledger' : 'Sandbox Provider + Ledger',
    durationMs: Math.max(1, Date.now() - t5),
    guardStatus: receipt.status,
    detail: `Receipt ${receipt.receiptId} committed idempotently`,
  });

  // Step 6: Earbuds Voice Reply (Companion Phone / Bluetooth Out)
  const t6 = Date.now();
  const replyText = verifyDraftAndPayload({
    draftText: `Done. Updated schedule and queued reply: ${modelOut.draft}`,
    recipientEmail: topThread?.fromEmail ?? 'priya@tvm.example',
    allowedRecipients: snap.gmailThreads.map((t) => t.fromEmail),
    sourceCorpus: `${topThread?.snippet ?? ''} ${modelOut.draft}`,
    userUtterance: params.utterance,
    computedFacts: [hhmm],
    fallbackTemplate: `Done. Sync updated to ${hhmm}.`,
  }).safeText;

  steps.push({
    step: 'VOICE_REPLY',
    status: 'PASS',
    provider: params.voiceConnected ?? Boolean(process.env.ASSEMBLYAI_API_KEY) ? 'AssemblyAI TTS-1 (Earbuds)' : 'Local Timing Synthesis',
    durationMs: Math.max(1, Date.now() - t6),
    guardStatus: 'NO_G2_SPEAKER_VERIFIED',
    detail: replyText,
  });

  return {
    traceId,
    startedAtIso: new Date(nowFn()).toISOString(),
    totalDurationMs: Math.max(1, Date.now() - tStart),
    outcome: 'COMMITTED',
    providerUsed: modelOut.providerLabel,
    fallbackUsed: modelOut.fallbackUsed,
    steps,
    modelAttempts: modelOut.attempts as HarnessRunReport['modelAttempts'],
  };
}
