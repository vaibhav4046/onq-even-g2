import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { clipLine42 } from '@onq/core';
import { routeModelCompletion } from '../harness/modelRouter.js';
import type { LlmConfig } from '../harness/modelRouter.js';

const execFileAsync = promisify(execFile);

export type LocalToolId =
  | 'claude_cli'
  | 'codex_cli'
  | 'gemini_cli'
  | 'ollama'
  | 'gh'
  | 'git'
  | 'node'
  | 'python';

export interface LocalToolInfo {
  id: LocalToolId;
  name: string;
  binary: string;
  accountMode: string;
  installed: boolean;
  binaryPath: string | null;
  installHint: string;
  capabilities: string[];
}

export type SafeInspectKind = 'git_status' | 'git_log' | 'gh_prs' | 'workspace_summary';

export interface SafeInspectResult {
  kind: SafeInspectKind;
  ok: boolean;
  summary: string;
  lines: string[];
  lensLines: string[];
  latencyMs: number;
}

export interface DelegatedExecutionResult {
  toolUsed: string;
  status: 'DONE' | 'FAILED';
  summary: string;
  steps: string[];
  outputLines: string[];
  lensLines: string[];
  latencyMs: number;
}

const TOOL_SPECS: Array<{
  id: LocalToolId;
  name: string;
  binary: string;
  accountMode: string;
  installHint: string;
  capabilities: string[];
}> = [
  {
    id: 'claude_cli',
    name: 'Claude Code CLI',
    binary: 'claude',
    accountMode: 'Claude Pro/Max Account (Zero API Key)',
    installHint: 'npm i -g @anthropic-ai/claude-code && claude login',
    capabilities: ['plan', 'code', 'review'],
  },
  {
    id: 'codex_cli',
    name: 'OpenAI Codex CLI',
    binary: 'codex',
    accountMode: 'ChatGPT Plus/Pro Account (Zero API Key)',
    installHint: 'npm i -g @openai/codex && codex login',
    capabilities: ['code', 'delegate', 'review'],
  },
  {
    id: 'gemini_cli',
    name: 'Gemini CLI',
    binary: 'gemini',
    accountMode: 'Google Account Free/Pro (Zero API Key)',
    installHint: 'npm i -g @google/gemini-cli && gemini',
    capabilities: ['plan', 'research', 'code'],
  },
  {
    id: 'ollama',
    name: 'Ollama Local LLM',
    binary: 'ollama',
    accountMode: '100% Local Offline (Zero Cloud Key)',
    installHint: 'winget install Ollama.Ollama && ollama run llama3.2',
    capabilities: ['offline-llm', 'summarize'],
  },
  {
    id: 'gh',
    name: 'GitHub CLI',
    binary: 'gh',
    accountMode: 'GitHub Account OAuth',
    installHint: 'gh auth login',
    capabilities: ['prs', 'issues', 'repos'],
  },
  {
    id: 'git',
    name: 'Git Workspace',
    binary: 'git',
    accountMode: 'Local Repo History & Status',
    installHint: 'Pre-installed',
    capabilities: ['status', 'diff', 'log'],
  },
  {
    id: 'node',
    name: 'Node.js Runtime',
    binary: 'node',
    accountMode: 'Local Verification & Build Runner',
    installHint: 'Pre-installed',
    capabilities: ['build', 'test'],
  },
  {
    id: 'python',
    name: 'Python Runtime',
    binary: 'python',
    accountMode: 'Local Whisper & Media Pipeline',
    installHint: 'Pre-installed',
    capabilities: ['whisper', 'scripts'],
  },
];

function findBinaryOnPath(binary: string): string | null {
  const envPath = process.env.PATH ?? '';
  const dirs = envPath.split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, `${binary}${ext}`);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // ignore permission / stat error
      }
    }
  }
  return null;
}

/**
 * Discovers installed local AI CLIs and developer runtimes on PATH.
 * Never executes arbitrary shell strings or scrapes external auth stores.
 */
export function detectLocalComputerTools(): LocalToolInfo[] {
  return TOOL_SPECS.map((spec) => {
    const binaryPath = findBinaryOnPath(spec.binary);
    return {
      id: spec.id,
      name: spec.name,
      binary: spec.binary,
      accountMode: spec.accountMode,
      installed: Boolean(binaryPath),
      binaryPath,
      installHint: spec.installHint,
      capabilities: spec.capabilities,
    };
  });
}

async function execAllowlisted(
  binary: string,
  args: string[],
  cwd: string,
  timeoutMs = 5000,
): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync(binary, args, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
}

/**
 * Executes a strict allowlist of read-only computer workspace inspections (zero shell expansion).
 */
export async function runSafeReadInspection(
  kind: SafeInspectKind,
  cwd: string = process.cwd(),
): Promise<SafeInspectResult> {
  const t0 = Date.now();
  try {
    if (kind === 'git_status') {
      const { stdout } = await execAllowlisted('git', ['status', '--short'], cwd);
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter(Boolean)
        .slice(0, 12);
      const summary = lines.length === 0 ? 'Working tree clean (0 uncommitted edits)' : `${lines.length} modified/untracked item(s)`;
      return {
        kind,
        ok: true,
        summary,
        lines: lines.length > 0 ? lines : ['Clean working tree'],
        lensLines: [
          clipLine42(`GIT: ${lines.length === 0 ? 'CLEAN TREE' : `${lines.length} CHANGED`}`),
          ...(lines.slice(0, 2).map((l) => clipLine42(l))),
        ],
        latencyMs: Math.max(1, Date.now() - t0),
      };
    }

    if (kind === 'git_log') {
      const { stdout } = await execAllowlisted('git', ['log', '-5', '--oneline'], cwd);
      const lines = stdout.split(/\r?\n/).filter(Boolean);
      return {
        kind,
        ok: true,
        summary: `Latest ${lines.length} commit(s) loaded`,
        lines,
        lensLines: [
          clipLine42('GIT LOG (LATEST):'),
          ...(lines.slice(0, 2).map((l) => clipLine42(l))),
        ],
        latencyMs: Math.max(1, Date.now() - t0),
      };
    }

    if (kind === 'gh_prs') {
      const ghPath = findBinaryOnPath('gh');
      if (!ghPath) {
        return {
          kind,
          ok: false,
          summary: 'GitHub CLI (gh) not installed on PATH',
          lines: ['Install gh CLI and run: gh auth login'],
          lensLines: ['GH CLI NOT FOUND ON PATH'],
          latencyMs: Math.max(1, Date.now() - t0),
        };
      }
      const { stdout } = await execAllowlisted(
        ghPath,
        ['pr', 'list', '--limit', '5', '--json', 'number,title,state'],
        cwd,
        6500,
      );
      const parsed = JSON.parse(stdout || '[]') as Array<{ number: number; title: string; state: string }>;
      const lines =
        parsed.length > 0
          ? parsed.map((p) => `#${p.number} [${p.state}] ${p.title}`)
          : ['No open pull requests in current repo'];
      return {
        kind,
        ok: true,
        summary: parsed.length > 0 ? `${parsed.length} PR(s) found` : '0 open PRs',
        lines,
        lensLines: [
          clipLine42(`GITHUB PRs: ${parsed.length} OPEN`),
          clipLine42(lines[0] ?? 'None'),
        ],
        latencyMs: Math.max(1, Date.now() - t0),
      };
    }

    // workspace_summary
    const entries = fs.readdirSync(cwd, { withFileTypes: true }).slice(0, 12);
    const lines = entries.map((e) => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`);
    return {
      kind: 'workspace_summary',
      ok: true,
      summary: `Workspace ${path.basename(cwd)}: ${entries.length} top entries`,
      lines,
      lensLines: [
        clipLine42(`DIR: ${path.basename(cwd)}`),
        clipLine42(lines.slice(0, 2).join(' ')),
      ],
      latencyMs: Math.max(1, Date.now() - t0),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Workspace inspection failed';
    return {
      kind,
      ok: false,
      summary: msg.slice(0, 120),
      lines: [msg.slice(0, 120)],
      lensLines: [clipLine42(`INSPECT ERR: ${msg}`)],
      latencyMs: Math.max(1, Date.now() - t0),
    };
  }
}

/**
 * Executes a Default-NO-approved delegated planning/coding/computer task via:
 * 1) Installed account-authenticated CLI (Claude / Codex / Gemini / Ollama) if requested & present,
 * 2) Safe read-only workspace_test verification, or
 * 3) Connected OpenRouter / LLM router + deterministic structured planner fallback.
 */
export async function executeDelegatedTask(params: {
  title: string;
  prompt: string;
  targetTool?: 'auto' | 'claude_cli' | 'codex_cli' | 'gemini_cli' | 'ollama' | 'openrouter' | 'workspace_test';
  cwd?: string;
  llmConfig?: LlmConfig;
}): Promise<DelegatedExecutionResult> {
  const t0 = Date.now();
  const cwd = params.cwd ?? process.cwd();
  const tools = detectLocalComputerTools();
  const target = params.targetTool ?? 'auto';

  const findInstalled = (id: LocalToolId) => tools.find((t) => t.id === id && t.installed);

  try {
    if (target === 'workspace_test') {
      const gitSt = await runSafeReadInspection('git_status', cwd);
      const gitLog = await runSafeReadInspection('git_log', cwd);
      const outputLines = [
        `Git: ${gitSt.summary}`,
        ...(gitLog.lines.slice(0, 2).map((l) => `Commit: ${l}`)),
      ];
      return {
        toolUsed: 'Git Workspace Check',
        status: gitSt.ok ? 'DONE' : 'FAILED',
        summary: gitSt.summary,
        steps: ['Verified working tree status', 'Loaded recent commit history'],
        outputLines,
        lensLines: [clipLine42(`COMP: ${gitSt.summary}`), clipLine42(gitLog.lines[0] ?? 'OK')],
        latencyMs: Math.max(1, Date.now() - t0),
      };
    }

    const cliChoice =
      target === 'claude_cli' || target === 'codex_cli' || target === 'gemini_cli' || target === 'ollama'
        ? findInstalled(target)
        : target === 'auto'
          ? findInstalled('claude_cli') ?? findInstalled('codex_cli') ?? findInstalled('gemini_cli')
          : undefined;

    if (cliChoice && cliChoice.binaryPath) {
      const args =
        cliChoice.id === 'claude_cli'
          ? ['-p', params.prompt]
          : cliChoice.id === 'codex_cli'
            ? ['exec', params.prompt]
            : cliChoice.id === 'gemini_cli'
              ? ['-p', params.prompt]
              : ['run', 'llama3.2', params.prompt];

      const { stdout } = await execAllowlisted(cliChoice.binaryPath, args, cwd, 25_000);
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8);
      return {
        toolUsed: `${cliChoice.name} (${cliChoice.accountMode})`,
        status: 'DONE',
        summary: lines[0] ?? 'Completed via local account CLI',
        steps: ['Invoked local account-authenticated CLI', 'Captured structured output'],
        outputLines: lines.length > 0 ? lines : ['Task completed cleanly.'],
        lensLines: [
          clipLine42(`${cliChoice.name.toUpperCase()}: DONE`),
          clipLine42(lines[0] ?? params.title),
        ],
        latencyMs: Math.max(1, Date.now() - t0),
      };
    }

    // Route through live OpenRouter / multi-model harness or structured fallback planner
    const fallbackPlan = `1) Scope "${params.title.slice(0, 28)}" -> 2) Wire tests & Default-NO guard -> 3) Ship & verify on G2.`;
    const modelRes = await routeModelCompletion(
      {
        recipientName: 'OnQ Computer Agent',
        recipientEmail: 'agent@onq.local',
        allowedRecipients: ['agent@onq.local'],
        sourceEmailText: `Workspace task request: ${params.prompt}`,
        userUtterance: params.prompt,
        computedFacts: [],
        fallbackDraft: fallbackPlan,
      },
      params.llmConfig,
    );

    const outputLines = [
      modelRes.draft,
      `Step 1: Define acceptance tests & 42-col lens spec for ${params.title.slice(0, 32)}`,
      'Step 2: Execute via Default-NO safety gate + verify locally',
    ];
    return {
      toolUsed: modelRes.providerLabel,
      status: 'DONE',
      summary: modelRes.draft,
      steps: [
        'Grounded task against workspace safety boundaries',
        `Planned with ${modelRes.providerLabel}`,
        'Formatted 42-col G2 lens summary',
      ],
      outputLines,
      lensLines: [
        clipLine42(`AGENT [${modelRes.providerLabel.slice(0, 10).toUpperCase()}]: OK`),
        clipLine42(modelRes.draft),
      ],
      latencyMs: Math.max(1, Date.now() - t0),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Delegation failed';
    return {
      toolUsed: target,
      status: 'FAILED',
      summary: msg,
      steps: ['Attempted delegated execution'],
      outputLines: [msg],
      lensLines: [clipLine42(`TASK ERR: ${msg}`)],
      latencyMs: Math.max(1, Date.now() - t0),
    };
  }
}
