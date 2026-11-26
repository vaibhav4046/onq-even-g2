import crypto from 'node:crypto';
import type { LlmConfig } from './modelRouter.js';
import type { MetricsLedger } from './metricsLedger.js';
import { executeDelegatedTask } from '../providers/localComputerBridge.js';

export type AgentTaskKind =
  | 'PLAN_PROJECT'
  | 'CODE_DELEGATE'
  | 'COMPUTER_CHECK'
  | 'TELEGRAM_SYNC'
  | 'YOUTUBE_SCOUT'
  | 'WRITE_CODE_BOT'
  | 'OUTREACH_SCHEDULER';
export type AgentTaskTargetTool =
  | 'auto'
  | 'claude_cli'
  | 'codex_cli'
  | 'gemini_cli'
  | 'ollama'
  | 'openrouter'
  | 'workspace_test';

export interface AgentTaskRecord {
  id: string;
  kind: AgentTaskKind;
  title: string;
  prompt: string;
  targetTool: AgentTaskTargetTool;
  toolUsed: string;
  status: 'STAGED_DEFAULT_NO' | 'RUNNING' | 'DONE' | 'FAILED';
  previewToken: string;
  steps: string[];
  outputLines: string[];
  lensLines: string[];
  artifactPath?: string;
  codeSnippet?: string;
  links?: Array<{ label: string; url: string }>;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Default-NO agentic task delegation engine for computer & project workflows initiated from Even G2.
 */
export class AgentTaskEngine {
  private readonly tasks = new Map<string, AgentTaskRecord>();
  private readonly orderedIds: string[] = [];

  constructor(
    private readonly nowFn: () => number = () => Date.now(),
    private readonly metrics?: MetricsLedger,
  ) {}

  stageTask(params: {
    kind?: AgentTaskKind;
    title: string;
    prompt: string;
    targetTool?: AgentTaskTargetTool;
  }): AgentTaskRecord {
    const id = `agt_${crypto.randomBytes(5).toString('hex')}`;
    const previewToken = `pt_agt_${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date(this.nowFn()).toISOString();
    const record: AgentTaskRecord = {
      id,
      kind: params.kind ?? 'PLAN_PROJECT',
      title: params.title.trim() || 'Delegated Computer Task',
      prompt: params.prompt.trim() || params.title.trim(),
      targetTool: params.targetTool ?? 'auto',
      toolUsed: 'Pending Default-NO Confirm',
      status: 'STAGED_DEFAULT_NO',
      previewToken,
      steps: ['Staged behind Default-NO confirmation gate'],
      outputLines: ['Tap Confirm on G2/R1 ring or browser to execute.'],
      lensLines: ['DEFAULT-NO: CONFIRM TASK?', params.title.slice(0, 40)],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.tasks.set(id, record);
    this.orderedIds.unshift(id);
    if (this.orderedIds.length > 25) {
      const dropped = this.orderedIds.pop();
      if (dropped) this.tasks.delete(dropped);
    }
    return { ...record };
  }

  async commitTask(params: {
    taskId?: string;
    previewToken?: string;
    cwd?: string;
    llmConfig?: LlmConfig;
    memoryContext?: string[];
  }): Promise<AgentTaskRecord | null> {
    let target: AgentTaskRecord | undefined;
    if (params.taskId) {
      target = this.tasks.get(params.taskId);
    } else if (params.previewToken) {
      target = Array.from(this.tasks.values()).find((t) => t.previewToken === params.previewToken);
    }
    if (!target) return null;
    if (params.previewToken && target.previewToken !== params.previewToken) return null;
    if (target.status !== 'STAGED_DEFAULT_NO') {
      throw new Error(`Task ${target.id} already ${target.status}`);
    }

    target.status = 'RUNNING';
    target.updatedAtIso = new Date(this.nowFn()).toISOString();

    const taskId = target.id;
    const span = this.metrics?.begin({ kind: 'subagent', provider: target.kind, model: null, runId: taskId, taskId });
    const exec = () =>
      executeDelegatedTask({
        kind: target.kind,
        title: target.title,
        prompt: target.prompt,
        targetTool: target.targetTool,
        cwd: params.cwd,
        llmConfig: params.llmConfig,
        memoryContext: params.memoryContext,
      });
    let result: Awaited<ReturnType<typeof executeDelegatedTask>>;
    try {
      result = this.metrics ? await this.metrics.runWith({ runId: taskId, taskId }, exec) : await exec();
    } catch (err) {
      target.status = 'FAILED';
      target.outputLines = [err instanceof Error ? err.message : 'Delegated task failed'];
      target.updatedAtIso = new Date(this.nowFn()).toISOString();
      span?.end({ ok: false, error: err instanceof Error ? err.message : 'task failed' });
      throw err;
    }
    span?.end({ ok: result.status !== 'FAILED' });

    target.status = result.status;
    target.toolUsed = result.toolUsed;
    target.steps = result.steps;
    target.outputLines = result.outputLines;
    target.lensLines = result.lensLines;
    target.artifactPath = result.artifactPath;
    target.codeSnippet = result.codeSnippet;
    target.links = result.links;
    target.updatedAtIso = new Date(this.nowFn()).toISOString();
    return { ...target };
  }

  listTasks(limit = 12): AgentTaskRecord[] {
    return this.orderedIds
      .slice(0, limit)
      .map((id) => this.tasks.get(id))
      .filter((t): t is AgentTaskRecord => Boolean(t))
      .map((t) => ({ ...t }));
  }
}
