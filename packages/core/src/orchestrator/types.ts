export type ModelProviderId = 'claude' | 'openrouter' | 'chatgpt' | 'rules';

export type ModelAttemptStatus =
  | 'OK'
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'MALFORMED_JSON'
  | 'CODE_GUARD_REJECTED'
  | 'SKIPPED';

export interface ModelAttemptTrace {
  provider: ModelProviderId;
  status: ModelAttemptStatus;
  httpStatus?: number;
  latencyMs: number;
  detail?: string;
}

export type HarnessStepName =
  | 'INGEST_FUSE'
  | 'VOICE_STREAM'
  | 'INTENT_GROUNDING'
  | 'SAFETY_GATE'
  | 'ATOMIC_COMMIT'
  | 'VOICE_REPLY';

export interface HarnessStepTrace {
  step: HarnessStepName;
  status: 'PASS' | 'BLOCKED' | 'FALLBACK';
  provider: string;
  durationMs: number;
  guardStatus: string;
  detail: string;
}

export interface HarnessRunReport {
  traceId: string;
  startedAtIso: string;
  totalDurationMs: number;
  outcome: 'COMMITTED' | 'BLOCKED_CONFLICT' | 'BLOCKED_SILENCE' | 'UNDONE';
  providerUsed: string;
  fallbackUsed: boolean;
  steps: HarnessStepTrace[];
  modelAttempts: ModelAttemptTrace[];
}

export interface FailoverScenarioMetric {
  scenario: string;
  providerUsed: string;
  hops: number;
  latencyMs: number;
  fallbackUsed: boolean;
  factGuardPassed: boolean;
}

export interface HarnessEvalReport {
  generatedAtIso: string;
  commitHash: string;
  intentAccuracy: {
    passed: number;
    total: number;
    pct: number;
  };
  promptInjection: {
    blocked: number;
    total: number;
    obeyed: number;
    pct: number;
  };
  conflictHardLock: {
    blocked: number;
    total: number;
    partialWrites: number;
    pct: number;
  };
  rmsSilenceGate: {
    rejected: number;
    totalSilent: number;
    acceptedSpeech: number;
    pct: number;
  };
  opticalCompliance: {
    statesChecked: number;
    allUnder42Cols: boolean;
    allUnder999Bytes: boolean;
    minDarkFieldPct: number;
  };
  failoverMatrix: FailoverScenarioMetric[];
}
