import os from 'node:os';

export type PoolTier = 'hosted_pc' | 'cloud_api' | 'deterministic';
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BalancerNode {
  id: string;
  label: string;
  tier: PoolTier;
  maxConcurrency: number;
  weight: number;
  healthy: boolean;
  circuit: CircuitState;
  inflight: number;
  totalCalls: number;
  totalFailures: number;
  consecutiveFailures: number;
  ewmaLatencyMs: number;
  openedUntilMs: number;
  lastError: string | null;
  lastUsedAtIso: string | null;
}

export interface BalancerPoolSnapshot {
  strategy: 'weighted_least_latency_circuit_breaker';
  hostCpuCap: number;
  totalInflight: number;
  totalDispatched: number;
  totalFailovers: number;
  nodes: BalancerNode[];
}

export interface DispatchOutcome<T> {
  ok: true;
  nodeId: string;
  tier: PoolTier;
  latencyMs: number;
  failovers: number;
  value: T;
}

const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 45_000;

/**
 * Adaptive weighted least-latency + circuit-breaker + CPU-bounded concurrency load balancer.
 * Inspired by OpenBot's resource-bounded agent runtime (cpu-limit.cjs) + idempotent retry semantics
 * so local PC servers, subscription CLIs, and optional cloud APIs stay stable under concurrent glasses/Telegram load.
 */
export class HarnessLoadBalancer {
  private readonly nodes = new Map<string, BalancerNode>();
  private readonly hostCpuCap: number;
  private totalDispatched = 0;
  private totalFailovers = 0;

  constructor(private readonly nowFn: () => number = () => Date.now()) {
    const avail = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
    this.hostCpuCap = Math.max(2, Math.min(8, avail || 4));
  }

  registerNode(spec: {
    id: string;
    label: string;
    tier: PoolTier;
    weight?: number;
    maxConcurrency?: number;
    healthy?: boolean;
    initialLatencyMs?: number;
  }): void {
    const existing = this.nodes.get(spec.id);
    if (existing) {
      existing.label = spec.label;
      existing.tier = spec.tier;
      existing.healthy = spec.healthy ?? existing.healthy;
      if (spec.weight !== undefined) existing.weight = Math.max(0.1, spec.weight);
      if (spec.maxConcurrency !== undefined) existing.maxConcurrency = Math.max(1, spec.maxConcurrency);
      return;
    }
    const defaultCap = spec.tier === 'hosted_pc' ? Math.max(1, Math.min(4, Math.floor(this.hostCpuCap / 2))) : 6;
    this.nodes.set(spec.id, {
      id: spec.id,
      label: spec.label,
      tier: spec.tier,
      maxConcurrency: Math.max(1, spec.maxConcurrency ?? defaultCap),
      weight: Math.max(0.1, spec.weight ?? (spec.tier === 'hosted_pc' ? 1.5 : 1.0)),
      healthy: spec.healthy ?? true,
      circuit: 'CLOSED',
      inflight: 0,
      totalCalls: 0,
      totalFailures: 0,
      consecutiveFailures: 0,
      ewmaLatencyMs: spec.initialLatencyMs ?? (spec.tier === 'deterministic' ? 15 : 420),
      openedUntilMs: 0,
      lastError: null,
      lastUsedAtIso: null,
    });
  }

  private refreshCircuit(node: BalancerNode): void {
    if (node.circuit === 'OPEN' && this.nowFn() >= node.openedUntilMs) {
      node.circuit = 'HALF_OPEN';
    }
  }

  /**
   * Computes ranked routing candidates prioritizing healthy CLOSED/HALF_OPEN nodes with lowest weighted load score.
   * Lower score = faster EWMA latency, lower inflight pressure, higher tier weight.
   */
  selectCandidates(opts: { preferTier?: PoolTier; preferredId?: string; allowedIds?: string[] } = {}): BalancerNode[] {
    const allowed = opts.allowedIds ? new Set(opts.allowedIds) : null;
    const scored: Array<{ node: BalancerNode; score: number }> = [];

    for (const node of this.nodes.values()) {
      if (allowed && !allowed.has(node.id)) continue;
      if (!node.healthy) continue;
      this.refreshCircuit(node);
      if (node.circuit === 'OPEN') continue;
      if (node.inflight >= node.maxConcurrency) continue;

      const tierBias =
        opts.preferTier && node.tier === opts.preferTier
          ? 0.55
          : node.tier === 'deterministic'
            ? 100.0
            : node.tier === 'hosted_pc'
              ? 0.8
              : 1.0;
      const prefBias = opts.preferredId && node.id === opts.preferredId ? 0.35 : 1.0;
      const loadFactor = 1 + node.inflight / node.maxConcurrency;
      const halfOpenPenalty = node.circuit === 'HALF_OPEN' ? 1.4 : 1.0;
      const score = (Math.max(10, node.ewmaLatencyMs) * loadFactor * tierBias * prefBias * halfOpenPenalty) / node.weight;
      scored.push({ node, score });
    }

    scored.sort((a, b) => a.score - b.score);
    return scored.map((s) => s.node);
  }

  recordSuccess(nodeId: string, latencyMs: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.consecutiveFailures = 0;
    node.circuit = 'CLOSED';
    node.lastError = null;
    node.lastUsedAtIso = new Date(this.nowFn()).toISOString();
    const clamped = Math.max(1, Math.min(60_000, latencyMs));
    node.ewmaLatencyMs = Math.round(node.ewmaLatencyMs * 0.7 + clamped * 0.3);
  }

  recordFailure(nodeId: string, reason: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.totalFailures += 1;
    node.consecutiveFailures += 1;
    node.lastError = reason.slice(0, 180);
    node.lastUsedAtIso = new Date(this.nowFn()).toISOString();
    if (node.consecutiveFailures >= FAILURE_THRESHOLD || node.circuit === 'HALF_OPEN') {
      node.circuit = 'OPEN';
      node.openedUntilMs = this.nowFn() + CIRCUIT_OPEN_MS;
    }
  }

  async dispatch<T>(
    executor: (node: BalancerNode) => Promise<T>,
    opts: { preferTier?: PoolTier; preferredId?: string; allowedIds?: string[] } = {},
  ): Promise<DispatchOutcome<T>> {
    const candidates = this.selectCandidates(opts);
    if (candidates.length === 0) {
      throw new Error('HarnessLoadBalancer: no healthy candidates available (circuits open or saturated)');
    }
    let failovers = 0;
    let lastErr: unknown = null;

    for (const node of candidates) {
      node.inflight += 1;
      node.totalCalls += 1;
      this.totalDispatched += 1;
      const t0 = this.nowFn();
      try {
        const value = await executor(node);
        const latencyMs = Math.max(1, this.nowFn() - t0);
        this.recordSuccess(node.id, latencyMs);
        return {
          ok: true,
          nodeId: node.id,
          tier: node.tier,
          latencyMs,
          failovers,
          value,
        };
      } catch (err) {
        lastErr = err;
        failovers += 1;
        this.totalFailovers += 1;
        this.recordFailure(node.id, err instanceof Error ? err.message : String(err));
      } finally {
        node.inflight = Math.max(0, node.inflight - 1);
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error('All load balancer candidates failed');
  }

  snapshot(): BalancerPoolSnapshot {
    let totalInflight = 0;
    const nodes: BalancerNode[] = [];
    for (const n of this.nodes.values()) {
      this.refreshCircuit(n);
      totalInflight += n.inflight;
      nodes.push({ ...n });
    }
    return {
      strategy: 'weighted_least_latency_circuit_breaker',
      hostCpuCap: this.hostCpuCap,
      totalInflight,
      totalDispatched: this.totalDispatched,
      totalFailovers: this.totalFailovers,
      nodes,
    };
  }
}
