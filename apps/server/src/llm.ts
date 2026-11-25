import { routeModelCompletion } from './harness/modelRouter.js';
import type {
  CompressReplyInput,
  CompressReplyOutput,
  LlmConfig,
  PreferredLlmProvider,
} from './harness/modelRouter.js';

export type {
  CompressReplyInput,
  CompressReplyOutput,
  LlmConfig,
  PreferredLlmProvider,
};

export async function generateGroundedDraft(
  input: CompressReplyInput,
  cfg: LlmConfig = {},
): Promise<CompressReplyOutput> {
  return routeModelCompletion(input, cfg);
}

export interface LlmProbeResult {
  ok: boolean;
  providerLabel: string;
  fallbackUsed: boolean;
  latencyMs: number;
  sampleDraft: string;
  factGuardPassed: boolean;
  attempts?: CompressReplyOutput['attempts'];
}

/**
 * Exercises configured LLM inference + Code-Guard + cascading failover end-to-end.
 */
export async function probeLlmProvider(cfg: LlmConfig = {}): Promise<LlmProbeResult> {
  const t0 = Date.now();
  const out = await routeModelCompletion(
    {
      recipientName: 'Priya Nair',
      recipientEmail: 'priya@tvm.example',
      allowedRecipients: ['priya@tvm.example'],
      sourceEmailText: 'VC Sync - Priya Nair. Can we push 15m to 14:15?',
      userUtterance: 'Push 15m to 14:15 and reply politely',
      computedFacts: ['14:15'],
      fallbackDraft: 'Running slightly behind, shifting VC Sync to 14:15.',
    },
    cfg,
  );
  return {
    ok: !out.fallbackUsed || out.providerLabel.startsWith('Rules'),
    providerLabel: out.providerLabel,
    fallbackUsed: out.fallbackUsed,
    latencyMs: Math.max(1, Date.now() - t0),
    sampleDraft: out.draft,
    factGuardPassed: out.factGuardViolations.length === 0,
    attempts: out.attempts,
  };
}
