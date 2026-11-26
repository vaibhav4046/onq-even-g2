import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Harness metrics ledger: one record per model / tool / sub-agent step.
 * Honest by construction: a field is null when nobody measured it, and token counts that are
 * estimated (chars / 4) are flagged `estimated: true`. Nothing here invents KV-cache or batch numbers.
 */

export type MetricKind = 'llm' | 'tool' | 'subagent';

export interface MetricStep {
  id: string;
  atIso: string;
  kind: MetricKind;
  /** Router provider id (claude, openrouter, claude_cli, ollama, rules ...) or a tool / specialist name. */
  provider: string;
  model: string | null;
  runId: string;
  taskId: string | null;
  /** Time to first token. Only measured where output actually streams (CLI stdout); null otherwise. */
  ttftMs: number | null;
  totalMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** True when token counts are a chars/4 estimate rather than provider-reported usage. */
  estimated: boolean;
  /** True/false only when the provider reported cache usage; null when unknown. */
  cacheHit: boolean | null;
  /** Steps already in flight when this one started (queue depth, excluding itself). */
  queueDepth: number;
  ok: boolean;
  error?: string;
}

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheHit?: boolean;
}

export interface MetricsContext {
  runId: string;
  taskId?: string;
}

export const DEFAULT_RUN_ID = 'adhoc';
const MAX_STEPS = 500;
const RESPONSE_STEPS = 200;
export const CHARS_PER_TOKEN = 4;

/** USD per 1M tokens. Static estimate, not a bill. CLIs on a subscription and rules have $0 marginal cost. */
const PRICE_PER_MTOK: Array<{ provider: string; modelPrefix: string; inUsd: number; outUsd: number }> = [
  { provider: 'claude', modelPrefix: 'claude-3-5-haiku', inUsd: 0.8, outUsd: 4 },
  { provider: 'chatgpt', modelPrefix: 'gpt-4o-mini', inUsd: 0.15, outUsd: 0.6 },
  { provider: 'grok', modelPrefix: 'grok-3-mini', inUsd: 0.3, outUsd: 0.5 },
];

export type Billing = 'cli-subscription' | 'local' | 'rules' | 'api' | 'none';

export function billingFor(step: Pick<MetricStep, 'kind' | 'provider' | 'model'>): Billing {
  if (step.kind !== 'llm') return 'none';
  if (step.provider === 'rules') return 'rules';
  if (step.provider.endsWith('_cli')) return 'cli-subscription';
  if (step.provider === 'ollama' || step.provider === 'lmstudio') return 'local';
  return 'api';
}

/** Estimated USD for one step, or null when the model is not in the price table (never guessed). */
export function estimateStepCostUsd(step: MetricStep): number | null {
  const b = billingFor(step);
  if (b === 'none') return 0;
  if (b !== 'api') return 0;
  if (step.model?.endsWith(':free') || step.model === 'openrouter/free') return 0;
  const row = PRICE_PER_MTOK.find((r) => r.provider === step.provider && (step.model ?? '').startsWith(r.modelPrefix));
  if (!row || step.inputTokens === null || step.outputTokens === null) return null;
  return (step.inputTokens * row.inUsd + step.outputTokens * row.outUsd) / 1_000_000;
}

/** Nearest-rank percentile of an unsorted list; null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

export function estimateTokens(chars: number): number {
  return Math.max(0, Math.ceil(chars / CHARS_PER_TOKEN));
}

/** Pulls real usage out of an Anthropic or OpenAI-compatible response body; fields absent stay undefined. */
export function parseUsage(data: unknown): ProviderUsage | undefined {
  const u = (data as { usage?: Record<string, unknown> } | null)?.usage;
  if (!u || typeof u !== 'object') return undefined;
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const inputTokens = num(u.input_tokens) ?? num(u.prompt_tokens);
  const outputTokens = num(u.output_tokens) ?? num(u.completion_tokens);
  const details = u.prompt_tokens_details as { cached_tokens?: unknown } | undefined;
  const cached = num(u.cache_read_input_tokens) ?? num(details?.cached_tokens);
  const out: ProviderUsage = {};
  if (inputTokens !== undefined) out.inputTokens = inputTokens;
  if (outputTokens !== undefined) out.outputTokens = outputTokens;
  if (cached !== undefined) out.cacheHit = cached > 0;
  return Object.keys(out).length ? out : undefined;
}

export interface StepEnd {
  ok?: boolean;
  error?: string;
  usage?: ProviderUsage;
  inputChars?: number;
  outputChars?: number;
}

export interface StepSpan {
  /** Call when the first output byte arrives (streaming sources only). */
  firstToken(): void;
  end(result?: StepEnd): MetricStep;
}

export interface RunAggregate {
  runId: string;
  taskIds: string[];
  steps: number;
  llmSteps: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** True when any counted step used chars/4 instead of provider usage. */
  tokensEstimated: boolean;
  totalMs: number;
  p50Ms: number | null;
  p95Ms: number | null;
  avgTtftMs: number | null;
  ttftMeasuredSteps: number;
  /** Hits / steps whose provider reported cache usage; null when no step reported it. */
  cacheHitRate: number | null;
  cacheKnownSteps: number;
  maxConcurrentInFlight: number;
  estimatedCostUsd: number;
  unpricedSteps: number;
  failedSteps: number;
}

export function aggregateSteps(runId: string, steps: MetricStep[]): RunAggregate {
  const llm = steps.filter((s) => s.kind === 'llm');
  const inputTokens = llm.reduce((n, s) => n + (s.inputTokens ?? 0), 0);
  const outputTokens = llm.reduce((n, s) => n + (s.outputTokens ?? 0), 0);
  const ttfts = steps.map((s) => s.ttftMs).filter((v): v is number => v !== null);
  const cacheKnown = steps.filter((s) => s.cacheHit !== null);
  let cost = 0;
  let unpriced = 0;
  for (const s of steps) {
    const c = estimateStepCostUsd(s);
    if (c === null) unpriced++;
    else cost += c;
  }
  const times = steps.map((s) => s.totalMs);
  return {
    runId,
    taskIds: [...new Set(steps.map((s) => s.taskId).filter((t): t is string => t !== null))],
    steps: steps.length,
    llmSteps: llm.length,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    tokensEstimated: llm.some((s) => s.estimated),
    totalMs: times.reduce((a, b) => a + b, 0),
    p50Ms: percentile(times, 50),
    p95Ms: percentile(times, 95),
    avgTtftMs: ttfts.length ? Math.round(ttfts.reduce((a, b) => a + b, 0) / ttfts.length) : null,
    ttftMeasuredSteps: ttfts.length,
    cacheHitRate: cacheKnown.length ? cacheKnown.filter((s) => s.cacheHit).length / cacheKnown.length : null,
    cacheKnownSteps: cacheKnown.length,
    maxConcurrentInFlight: steps.reduce((m, s) => Math.max(m, s.queueDepth + 1), 0),
    estimatedCostUsd: Math.round(cost * 1_000_000) / 1_000_000,
    unpricedSteps: unpriced,
    failedSteps: steps.filter((s) => !s.ok).length,
  };
}

const contextStore = new AsyncLocalStorage<MetricsContext>();

export class MetricsLedger {
  private steps: MetricStep[] = [];
  private inFlight = 0;
  private maxInFlight = 0;
  private readonly file: string | null;

  /** Pass a dataDir to persist the last steps to `harness-metrics.json`; omit for memory only. */
  constructor(opts: { dataDir?: string; now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.file = opts.dataDir ? path.join(opts.dataDir, 'harness-metrics.json') : null;
    if (this.file) this.load();
  }

  private readonly now: () => number;

  /** Runs fn with a run / task id that every step begun inside it picks up (AsyncLocalStorage, no threading). */
  runWith<T>(ctx: MetricsContext, fn: () => Promise<T> | T): Promise<T> | T {
    return contextStore.run(ctx, fn);
  }

  currentContext(): MetricsContext {
    return contextStore.getStore() ?? { runId: DEFAULT_RUN_ID };
  }

  begin(meta: { kind: MetricKind; provider: string; model?: string | null; runId?: string; taskId?: string }): StepSpan {
    const ctx = this.currentContext();
    const queueDepth = this.inFlight;
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    const t0 = this.now();
    let ttft: number | null = null;
    let ended: MetricStep | null = null;
    return {
      firstToken: () => {
        if (ttft === null && !ended) ttft = Math.max(0, this.now() - t0);
      },
      end: (result = {}) => {
        if (ended) return ended;
        this.inFlight = Math.max(0, this.inFlight - 1);
        const usage = result.usage;
        const isLlm = meta.kind === 'llm';
        const haveReal = usage?.inputTokens !== undefined && usage?.outputTokens !== undefined;
        const step: MetricStep = {
          id: `ms_${crypto.randomBytes(4).toString('hex')}`,
          atIso: new Date(t0).toISOString(),
          kind: meta.kind,
          provider: meta.provider,
          model: meta.model ?? null,
          runId: meta.runId ?? ctx.runId,
          taskId: meta.taskId ?? ctx.taskId ?? null,
          ttftMs: ttft,
          totalMs: Math.max(1, this.now() - t0),
          inputTokens: !isLlm ? null : haveReal ? usage!.inputTokens! : estimateTokens(result.inputChars ?? 0),
          outputTokens: !isLlm ? null : haveReal ? usage!.outputTokens! : estimateTokens(result.outputChars ?? 0),
          estimated: isLlm && !haveReal,
          cacheHit: usage?.cacheHit ?? null,
          queueDepth,
          ok: result.ok ?? true,
          ...(result.error ? { error: result.error.slice(0, 160) } : {}),
        };
        ended = step;
        this.add(step);
        return step;
      },
    };
  }

  /** Records an already-measured step (for example the deterministic rules fallback). */
  record(step: Omit<MetricStep, 'id' | 'atIso' | 'runId' | 'taskId' | 'queueDepth'> & Partial<Pick<MetricStep, 'runId' | 'taskId' | 'queueDepth'>>): MetricStep {
    const ctx = this.currentContext();
    const full: MetricStep = {
      ...step,
      id: `ms_${crypto.randomBytes(4).toString('hex')}`,
      atIso: new Date(this.now()).toISOString(),
      runId: step.runId ?? ctx.runId,
      taskId: step.taskId ?? ctx.taskId ?? null,
      queueDepth: step.queueDepth ?? this.inFlight,
    };
    this.add(full);
    return full;
  }

  private add(step: MetricStep): void {
    this.steps.push(step);
    if (this.steps.length > MAX_STEPS) this.steps = this.steps.slice(-MAX_STEPS);
    this.persist();
  }

  getSteps(limit = RESPONSE_STEPS): MetricStep[] {
    return this.steps.slice(-limit);
  }

  summary(): {
    steps: MetricStep[];
    runs: RunAggregate[];
    overall: RunAggregate;
    inFlightNow: number;
    maxConcurrentInFlight: number;
    priceTable: typeof PRICE_PER_MTOK;
    notes: Record<string, unknown>;
  } {
    const byRun = new Map<string, MetricStep[]>();
    for (const s of this.steps) {
      const list = byRun.get(s.runId) ?? [];
      list.push(s);
      byRun.set(s.runId, list);
    }
    const runs = [...byRun.entries()].map(([id, list]) => aggregateSteps(id, list));
    return {
      steps: this.getSteps(),
      runs,
      overall: aggregateSteps('all', this.steps),
      inFlightNow: this.inFlight,
      maxConcurrentInFlight: Math.max(this.maxInFlight, ...runs.map((r) => r.maxConcurrentInFlight)),
      priceTable: PRICE_PER_MTOK,
      notes: {
        estimated: true,
        tokens: 'Provider-reported usage when the API returns it; otherwise chars/4 with estimated:true on the step.',
        ttft: 'null unless measured. Remote API calls are not streamed here, so only CLI stdout has a real first-byte time.',
        cacheHit: 'null unless the provider reported cache usage. Never inferred.',
        kvCache: null,
        batchSize: null,
        cost: {
          estimated: true,
          basis: 'Static USD per 1M token table. cli-subscription, local and rules are $0 marginal. Unlisted models are counted in unpricedSteps, not guessed.',
        },
        retention: `Last ${MAX_STEPS} steps kept, ${RESPONSE_STEPS} returned.`,
      },
    };
  }

  private load(): void {
    try {
      if (!this.file || !fs.existsSync(this.file)) return;
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { steps?: MetricStep[] };
      if (Array.isArray(parsed.steps)) this.steps = parsed.steps.slice(-MAX_STEPS);
    } catch {
      this.steps = [];
    }
  }

  private persist(): void {
    if (!this.file) return;
    try {
      fs.writeFileSync(this.file, JSON.stringify({ steps: this.steps }), { mode: 0o600 });
    } catch {
      // metrics are best-effort; never break a model call because the disk write failed
    }
  }
}
