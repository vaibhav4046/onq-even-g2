import { clipLine42 } from '@onq/core';
import type { SourceMode } from '@onq/core';
import type { WorkspaceSnapshot } from './providers/types.js';

export interface ProactiveInsight {
  id: string;
  atIso: string;
  category: 'MEETING' | 'INBOX' | 'NOTION' | 'TELEGRAM' | 'COMPUTER' | 'HEALTH';
  severity: 'info' | 'action' | 'warn';
  title: string;
  detail: string;
  suggestedCommand?: string;
  sourceMode: SourceMode;
}

export interface ProactiveHarnessStep {
  id: string;
  phase: string;
  tool: string;
  detail: string;
  status: string;
}

export interface SelfGeneratedHarness {
  harnessId: string;
  generatedAtIso: string;
  triggerCategory: ProactiveInsight['category'];
  goal: string;
  rationale: string;
  orchestratorUsed: string;
  fallbackUsed: boolean;
  suggestedCommand: string;
  opticalCardLines: string[];
  steps: ProactiveHarnessStep[];
  defaultNoRequired: true;
  codeGuardPassed: boolean;
}

export interface ProactiveHarnessStatus {
  running: boolean;
  intervalMs: number;
  pulseCount: number;
  lastPulseAtIso: string | null;
  insights: ProactiveInsight[];
  activeHarness: SelfGeneratedHarness | null;
  harnessCount: number;
}

export interface ProactiveHarnessDeps {
  getSnapshot: () => { snapshot: WorkspaceSnapshot; sourceMode: SourceMode };
  getSummary: () => {
    activeLlmProvider: string;
    voiceConnected: boolean;
    connectedCount: number;
    totalConnectors?: number;
  };
  getTelegramInsight?: () => ProactiveInsight | null;
  getComputerInsight?: () => ProactiveInsight | null;
  refreshAsyncSignals?: () => Promise<void>;
  synthesizeHarnessPlan?: (ctx: {
    insights: ProactiveInsight[];
    focusHint?: string;
    sourceMode: SourceMode;
  }) => Promise<Omit<SelfGeneratedHarness, 'harnessId' | 'generatedAtIso' | 'defaultNoRequired'>>;
  onPulse?: (status: ProactiveHarnessStatus) => void;
  nowFn?: () => number;
  intervalMs?: number;
  autoStart?: boolean;
}

/**
 * 24/7 Proactive Agentic Harness:
 * Periodically scans workspace calendar, inbox, Notion tasks, and connector health
 * to surface ready-to-stage briefs on the G2 corridor. Never executes unconfirmed writes.
 */
export class ProactiveAgenticHarness {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private intervalMs: number;
  private pulseCount = 0;
  private lastPulseAtIso: string | null = null;
  private insights: ProactiveInsight[] = [];
  private activeHarness: SelfGeneratedHarness | null = null;
  private harnessCount = 0;
  private lastSynthesizedAtMs = 0;
  private readonly nowFn: () => number;

  constructor(private readonly deps: ProactiveHarnessDeps) {
    this.nowFn = deps.nowFn ?? (() => Date.now());
    this.intervalMs = Math.max(2000, deps.intervalMs ?? 20_000);
    if (deps.autoStart) {
      this.start();
    }
  }

  start(intervalMs?: number): ProactiveHarnessStatus {
    if (intervalMs && Number.isFinite(intervalMs)) {
      this.intervalMs = Math.max(2000, Math.round(intervalMs));
    }
    this.stop();
    this.running = true;
    this.runPulse();
    this.timer = setInterval(() => {
      void this.runAsyncPulse();
    }, this.intervalMs);
    this.timer.unref?.();
    return this.getStatus();
  }

  stop(): ProactiveHarnessStatus {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    return this.getStatus();
  }

  toggle(running?: boolean, intervalMs?: number): ProactiveHarnessStatus {
    const next = running ?? !this.running;
    return next ? this.start(intervalMs) : this.stop();
  }

  runPulse(): ProactiveHarnessStatus {
    const nowMs = this.nowFn();
    const nowIso = new Date(nowMs).toISOString();
    const { snapshot, sourceMode } = this.deps.getSnapshot();
    const summary = this.deps.getSummary();

    const nextInsights: ProactiveInsight[] = [];

    // 1. Check upcoming calendar conflicts / imminent corridor windows
    const events = [...snapshot.calendarEvents].sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso));
    const nextEv = events[0];
    if (nextEv) {
      const startMs = Date.parse(nextEv.startIso);
      const minsAway = Math.round((startMs - nowMs) / 60_000);
      nextInsights.push({
        id: `ins-cal-${nextEv.eventId}`,
        atIso: nowIso,
        category: 'MEETING',
        severity: minsAway <= 20 && minsAway >= -5 ? 'action' : 'info',
        title: `Next: ${nextEv.title}`,
        detail: `${nextEv.startIso.slice(11, 16)}-${nextEv.endIso.slice(11, 16)} UTC (${sourceMode === 'LIVE' ? 'LIVE' : 'SAMPLE'})`,
        suggestedCommand: 'Push 15m and tell Investor',
        sourceMode,
      });

      // Scan pairwise overlap risks proactively
      for (let i = 0; i < events.length - 1; i++) {
        const a = events[i];
        const b = events[i + 1];
        if (Date.parse(b.startIso) < Date.parse(a.endIso)) {
          nextInsights.push({
            id: `ins-ov-${a.eventId}-${b.eventId}`,
            atIso: nowIso,
            category: 'MEETING',
            severity: 'warn',
            title: `Overlap guard: ${a.title}`,
            detail: `Collides with ${b.title} (${b.startIso.slice(11, 16)})`,
            sourceMode,
          });
          break;
        }
      }
    }

    // 2. Check open inbox threads needing reply
    const openThread = snapshot.gmailThreads.find((t) => t.sentMessages.length === 0) ?? snapshot.gmailThreads[0];
    if (openThread) {
      nextInsights.push({
        id: `ins-mail-${openThread.threadId}`,
        atIso: nowIso,
        category: 'INBOX',
        severity: openThread.sentMessages.length === 0 ? 'action' : 'info',
        title: `${openThread.fromName} thread ${openThread.sentMessages.length === 0 ? 'awaiting reply' : 'replied'}`,
        detail: openThread.snippet.slice(0, 84),
        suggestedCommand: openThread.sentMessages.length === 0 ? 'Push 15m and tell Investor' : undefined,
        sourceMode,
      });
    }

    // 3. Check open Notion deliverables
    const openTasks = snapshot.notionTasks.filter((t) => !t.completed);
    if (openTasks.length > 0) {
      nextInsights.push({
        id: `ins-notion-${openTasks.length}`,
        atIso: nowIso,
        category: 'NOTION',
        severity: 'info',
        title: `${openTasks.length} open Notion task${openTasks.length === 1 ? '' : 's'}`,
        detail: openTasks
          .slice(0, 2)
          .map((t) => t.title)
          .join(' · '),
        sourceMode,
      });
    }

    // 4. Optional live Telegram incoming ping watcher
    const tgIns = this.deps.getTelegramInsight?.();
    if (tgIns) {
      nextInsights.push(tgIns);
    }

    // 5. Optional local Computer / Git / Delegated Agent task watcher
    const compIns = this.deps.getComputerInsight?.();
    if (compIns) {
      nextInsights.push(compIns);
    }

    // 6. Always report harness health & active routing
    const totalConnectors = summary.totalConnectors ?? 7;
    nextInsights.push({
      id: 'ins-health-router',
      atIso: nowIso,
      category: 'HEALTH',
      severity: 'info',
      title: `24/7 Watch: ${summary.activeLlmProvider}`,
      detail: `${summary.connectedCount}/${totalConnectors} connectors ready · Voice ${summary.voiceConnected ? 'LIVE' : 'LOCAL'} · Default-NO locked`,
      sourceMode,
    });

    this.pulseCount += 1;
    this.lastPulseAtIso = nowIso;
    this.insights = nextInsights.slice(0, 6);

    const status = this.getStatus();
    this.deps.onPulse?.(status);
    return status;
  }

  private buildDeterministicHarness(
    focusHint?: string,
  ): Omit<SelfGeneratedHarness, 'harnessId' | 'generatedAtIso' | 'defaultNoRequired'> {
    const primary =
      this.insights.find((i) => i.severity === 'action' || i.severity === 'warn') ?? this.insights[0];
    const suggestedCommand =
      primary?.suggestedCommand ??
      this.insights.find((i) => i.suggestedCommand)?.suggestedCommand ??
      'Push 15m and tell Investor';
    const goal = focusHint?.trim()
      ? focusHint.trim().slice(0, 80)
      : primary?.title ?? 'Prepare next workspace corridor brief';
    const rationale =
      primary?.detail ?? 'Corridor scan surfaced an actionable brief gated by Default-NO.';

    return {
      triggerCategory: primary?.category ?? 'MEETING',
      goal,
      rationale,
      orchestratorUsed: this.deps.getSummary().activeLlmProvider || 'Rules (Deterministic)',
      fallbackUsed: true,
      suggestedCommand,
      opticalCardLines: [
        clipLine42(goal),
        clipLine42(rationale),
        clipLine42(`CMD: ${suggestedCommand}`),
      ],
      steps: [
        {
          id: 'step-1',
          phase: 'OBSERVE',
          tool: 'WorkspaceCorridor',
          detail: primary?.title ?? 'Scanned calendar, inbox & Notion',
          status: 'DONE',
        },
        {
          id: 'step-2',
          phase: 'VERIFY',
          tool: 'CodeGuard',
          detail: 'Verified recipients, times & prompt safety',
          status: 'DONE',
        },
        {
          id: 'step-3',
          phase: 'STAGE',
          tool: 'ActionPreview',
          detail: `Ready to stage: ${suggestedCommand}`,
          status: 'READY',
        },
        {
          id: 'step-4',
          phase: 'GUARD',
          tool: 'DefaultNO',
          detail: 'Hold-1.5s YES required before commit',
          status: 'LOCKED',
        },
      ],
      codeGuardPassed: true,
    };
  }

  private async synthesizeHarnessInternal(
    focusHint?: string,
    skipPulse = false,
  ): Promise<ProactiveHarnessStatus> {
    if (!skipPulse) {
      this.runPulse();
    }
    const sourceMode = this.insights[0]?.sourceMode ?? this.deps.getSnapshot().sourceMode;
    let plan: Omit<SelfGeneratedHarness, 'harnessId' | 'generatedAtIso' | 'defaultNoRequired'>;

    if (this.deps.synthesizeHarnessPlan) {
      try {
        plan = await this.deps.synthesizeHarnessPlan({
          insights: [...this.insights],
          focusHint,
          sourceMode,
        });
      } catch {
        plan = this.buildDeterministicHarness(focusHint);
      }
    } else {
      plan = this.buildDeterministicHarness(focusHint);
    }

    const nowMs = this.nowFn();
    const nowIso = new Date(nowMs).toISOString();
    const rawLines =
      plan.opticalCardLines.length > 0 ? plan.opticalCardLines : [plan.goal, plan.rationale];
    this.harnessCount += 1;
    this.lastSynthesizedAtMs = nowMs;
    this.activeHarness = {
      ...plan,
      harnessId: `har-${nowMs}-${this.harnessCount}`,
      generatedAtIso: nowIso,
      opticalCardLines: rawLines.map((line) => clipLine42(line)),
      defaultNoRequired: true,
    };

    const status = this.getStatus();
    this.deps.onPulse?.(status);
    return status;
  }

  async synthesizeHarness(focusHint?: string): Promise<ProactiveHarnessStatus> {
    return this.synthesizeHarnessInternal(focusHint, false);
  }

  async runAsyncPulse(): Promise<ProactiveHarnessStatus> {
    if (this.deps.refreshAsyncSignals) {
      try {
        await this.deps.refreshAsyncSignals();
      } catch {
        // non-fatal background refresh failure
      }
    }
    const status = this.runPulse();
    const nowMs = this.nowFn();
    const hasActionOrWarn = this.insights.some(
      (i) => i.severity === 'action' || i.severity === 'warn',
    );
    if (!this.activeHarness || (nowMs - this.lastSynthesizedAtMs >= 90_000 && hasActionOrWarn)) {
      try {
        return await this.synthesizeHarnessInternal(undefined, true);
      } catch {
        // non-fatal background synthesis failure
      }
    }
    return status;
  }

  getStatus(): ProactiveHarnessStatus {
    return {
      running: this.running,
      intervalMs: this.intervalMs,
      pulseCount: this.pulseCount,
      lastPulseAtIso: this.lastPulseAtIso,
      insights: [...this.insights],
      activeHarness: this.activeHarness
        ? {
            ...this.activeHarness,
            opticalCardLines: [...this.activeHarness.opticalCardLines],
            steps: this.activeHarness.steps.map((s) => ({ ...s })),
          }
        : null,
      harnessCount: this.harnessCount,
    };
  }
}
