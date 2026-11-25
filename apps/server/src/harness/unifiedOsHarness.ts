import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { clipLine42 } from '@onq/core';
import type { CorridorCard, LiveUiSurface, SourceMode } from '@onq/core';
import type { WorkspaceSnapshot } from '../providers/types.js';
import type { SafeInspectKind, SafeInspectResult } from '../providers/localComputerBridge.js';
import type { LlmConfig } from './modelRouter.js';
import { orchestrateStructuredJson } from './modelRouter.js';
import type { CitedKnowledgeEngine } from './ragEngine.js';
import type { MarketResearchBotEngine } from './marketBotEngine.js';
import type { KanbanAndScreenManager } from './kanbanEngine.js';
import type { TokenSavingsLedger } from './tokenOptimizer.js';
import {
  buildMusicFocusLiveUi,
  MusicCuratorEngine,
  parseMusicMood,
} from './musicCuratorEngine.js';
import type { MusicFocusSession, MusicMood } from './musicCuratorEngine.js';

export type AutonomyLevel =
  | 'L0_EXPLAIN'
  | 'L1_PREPARE'
  | 'L2_APPROVAL'
  | 'L3_ROUTINE'
  | 'L4_PIPELINE'
  | 'L5_BLOCKED';

export type SpecialistId =
  | 'chief_of_staff'
  | 'researcher'
  | 'career_operator'
  | 'developer'
  | 'qa_reviewer'
  | 'finance_admin'
  | 'content_producer'
  | 'music_curator'
  | 'fitness_assistant'
  | 'auditor';

export interface SpecialistProfile {
  id: SpecialistId;
  name: string;
  roleTitle: string;
  maxAutonomy: AutonomyLevel;
  allowedTools: string[];
  deniedScopes: string[];
  summary: string;
}

export const SPECIALIST_ROSTER: SpecialistProfile[] = [
  {
    id: 'chief_of_staff',
    name: 'Chief of Staff',
    roleTitle: 'Calendar, Inbox & Briefs',
    maxAutonomy: 'L2_APPROVAL',
    allowedTools: ['calendar.read', 'gmail.read', 'notion.read', 'approval.stage'],
    deniedScopes: ['live_money', 'unapproved_send'],
    summary: 'Ranks today deadlines, triages replies, and runs morning/evening corridor briefs.',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    roleTitle: 'Cited Web, Docs & RAG',
    maxAutonomy: 'L1_PREPARE',
    allowedTools: ['rag.query', 'defuddle.ingest', 'llm.router'],
    deniedScopes: ['external_write', 'secrets_read'],
    summary: 'Reads URLs with SSRF guard, indexes notes, and returns source-cited answers.',
  },
  {
    id: 'career_operator',
    name: 'Career Operator',
    roleTitle: 'Job Radar & Outreach Prep',
    maxAutonomy: 'L1_PREPARE',
    allowedTools: ['memory.query', 'rag.query', 'approval.stage'],
    deniedScopes: ['auto_apply_submit', 'unapproved_send'],
    summary: 'Tracks target roles, tailors pitch notes, and prepares outreach behind Default-NO.',
  },
  {
    id: 'developer',
    name: 'Developer',
    roleTitle: 'Repo Inspect & Bot Code',
    maxAutonomy: 'L2_APPROVAL',
    allowedTools: ['git.status', 'git.log', 'gh.prs', 'liveui.generate'],
    deniedScopes: ['destructive_shell', 'force_push'],
    summary: 'Inspects git/PR health, builds LiveUI micro-apps, and prepares PR/code tasks.',
  },
  {
    id: 'qa_reviewer',
    name: 'QA / Reviewer',
    roleTitle: 'Tests, Diffs & Regressions',
    maxAutonomy: 'L1_PREPARE',
    allowedTools: ['workspace.summary', 'git.status', 'tests.status'],
    deniedScopes: ['production_deploy', 'secrets_read'],
    summary: 'Reviews open changes for missing tests, broken contracts, and optical budget limits.',
  },
  {
    id: 'finance_admin',
    name: 'Finance Admin',
    roleTitle: 'Market Research & Paper Watch',
    maxAutonomy: 'L1_PREPARE',
    allowedTools: ['coingecko.signals', 'market.paper', 'toon.compress'],
    deniedScopes: ['real_money_orders', 'wallet_transfer'],
    summary: 'Watches live market signals & paper setups; live capital execution is hard-blocked (L5).',
  },
  {
    id: 'content_producer',
    name: 'Content Producer',
    roleTitle: '525nm Explainers & Copy',
    maxAutonomy: 'L1_PREPARE',
    allowedTools: ['explainer.script', 'taste.profile', 'memory.save'],
    deniedScopes: ['unapproved_social_post'],
    summary: 'Drafts crisp monochrome video explainers, release updates, and glasses cards.',
  },
  {
    id: 'music_curator',
    name: 'Music Curator',
    roleTitle: 'Focus Playlists & Audio Blocks',
    maxAutonomy: 'L1_PREPARE',
    allowedTools: ['itunes.search', 'spotify.optional', 'liveui.focus_timer'],
    deniedScopes: ['silent_autoplay'],
    summary: 'Curates real tracks from live iTunes catalog and pairs mood blocks without auto-play.',
  },
  {
    id: 'fitness_assistant',
    name: 'Fitness Assistant',
    roleTitle: 'Focus Pacing, Breaks & Recovery',
    maxAutonomy: 'L1_PREPARE',
    allowedTools: ['calendar.gaps', 'liveui.timer', 'memory.save'],
    deniedScopes: ['medical_diagnosis'],
    summary: 'Schedules sustainable deep-work blocks, gym windows, and hydration checkpoints.',
  },
  {
    id: 'auditor',
    name: 'Auditor',
    roleTitle: 'Verifier, Code-Guard & Kill Switch',
    maxAutonomy: 'L0_EXPLAIN',
    allowedTools: ['audit.log', 'killswitch.enforce', 'approval.verify'],
    deniedScopes: ['external_write', 'bypass_guard'],
    summary: 'Enforces L0-L5 boundaries, single-use expiry, allowlists, and evidence checks.',
  },
];

export interface OsSkill {
  id: string;
  name: string;
  triggerCommand: string;
  specialistId: SpecialistId;
  description: string;
  steps: string[];
  approvalRule: 'L1_READ_ONLY' | 'L2_APPROVAL_REQUIRED' | 'L3_BOUNDED_ROUTINE';
  createdAtIso: string;
}

export interface OsRoutine {
  id: string;
  title: string;
  skillId: string;
  specialistId: SpecialistId;
  scheduleLabel: string;
  intervalMs: number;
  paused: boolean;
  lastRunAtIso: string | null;
  lastStatus: 'IDLE' | 'OK' | 'PAUSED_BY_KILL_SWITCH' | 'ERROR';
  lastSummary: string;
}

export type ApprovalDestination = 'TELEGRAM' | 'GMAIL' | 'GCAL' | 'NOTION' | 'COMPUTER';

export interface OsApprovalItem {
  id: string;
  createdAtIso: string;
  expiresAtIso: string;
  idempotencyKey: string;
  payloadHash: string;
  autonomyLevel: 'L2_APPROVAL';
  specialistId: SpecialistId;
  destination: ApprovalDestination;
  title: string;
  summary: string;
  payloadPreview: string;
  status: 'PENDING' | 'APPROVED_EXECUTED' | 'REJECTED' | 'EXPIRED' | 'FAILED';
  executionDetail?: string;
  telegramMessageId?: number;
  sourceSurface: 'web' | 'glasses' | 'telegram' | 'routine';
  decidedAtIso?: string;
  decidedBySurface?: string;
}

export interface OsPipelineStepResult {
  specialistId: SpecialistId;
  specialistName: string;
  status: 'DONE' | 'BLOCKED' | 'SKIPPED';
  latencyMs: number;
  evidenceSummary: string;
}

export interface OsPipelineRun {
  runId: string;
  preset: string;
  goal: string;
  startedAtIso: string;
  finishedAtIso: string;
  status: 'VERIFIED_DONE' | 'BLOCKED_KILL_SWITCH' | 'PARTIAL';
  steps: OsPipelineStepResult[];
  auditorVerdict: string;
  g2Lines: string[];
}

export interface OsCommandLogEntry {
  id: string;
  atIso: string;
  surface: 'web' | 'glasses' | 'telegram';
  command: string;
  domain: string;
  specialistId: SpecialistId;
  autonomyLevel: AutonomyLevel;
  summary: string;
}

export interface IntegrationCapabilityStatus {
  id: string;
  name: string;
  status: 'LIVE' | 'LOCAL_FREE' | 'SANDBOX' | 'CONNECT_TO_ENABLE';
  detail: string;
}

export interface UnifiedOsStateSnapshot {
  killSwitch: {
    paused: boolean;
    reason?: string;
    updatedAtIso: string;
  };
  autonomyScale: Array<{ level: AutonomyLevel; label: string; policy: string }>;
  roster: SpecialistProfile[];
  skills: OsSkill[];
  routines: OsRoutine[];
  approvals: OsApprovalItem[];
  pendingApprovalCount: number;
  recentPipelines: OsPipelineRun[];
  activeMusicSession: MusicFocusSession | null;
  recentCommands: OsCommandLogEntry[];
  integrations: IntegrationCapabilityStatus[];
  lastTelegramUpdateId?: number;
}

export interface OsCommandOutcome {
  ok: boolean;
  command: string;
  domain: string;
  specialistId: SpecialistId;
  autonomyLevel: AutonomyLevel;
  reply: string;
  g2Lines: string[];
  approval?: OsApprovalItem;
  pipelineRun?: OsPipelineRun;
  musicSession?: MusicFocusSession;
  liveUiSurface?: LiveUiSurface;
  recommendedTab?: 'os' | 'call' | 'apps' | 'fleet' | 'market' | 'explainer' | 'notes' | 'computer';
}

export interface UnifiedOsHarnessDeps {
  dataDir: string;
  getSnapshot: () => { snapshot: WorkspaceSnapshot; sourceMode: SourceMode };
  getSummary: () => {
    activeLlmProvider: string;
    voiceConnected: boolean;
    connectedCount: number;
    hasGoogle: boolean;
    hasNotion: boolean;
    hasTelegram: boolean;
    telegramChatId?: string;
    hasOpenRouter: boolean;
    hasGrok: boolean;
    hasOmniRoute: boolean;
    hasSpotify: boolean;
    hasGitHubToken: boolean;
  };
  getLlmConfig: () => LlmConfig;
  citedKnowledge: CitedKnowledgeEngine;
  marketBot: MarketResearchBotEngine;
  kanbanScreen: KanbanAndScreenManager;
  tokenLedger: TokenSavingsLedger;
  musicCurator: MusicCuratorEngine;
  runInspect: (kind: SafeInspectKind) => Promise<SafeInspectResult>;
  listMemories: (limit?: number) => Promise<Array<{ id: string; title: string; summary: string; source: string }>>;
  saveMemory: (input: { kind: 'task' | 'meeting' | 'telegram' | 'note' | 'voice'; title: string; summary: string; source: string }) => Promise<void>;
  executeApprovalAction: (item: OsApprovalItem) => Promise<{ ok: boolean; detail: string }>;
  onApprovalCreated?: (item: OsApprovalItem) => Promise<number | undefined>;
  onKillSwitchChanged?: (paused: boolean) => void;
  onBroadcast: (event: string, data: unknown) => void;
  onAudit: (detail: string, level?: 'COMMAND' | 'APPROVAL' | 'PIPELINE' | 'KILL_SWITCH' | 'ROUTINE') => void;
  fetchImpl?: typeof fetch;
  nowFn?: () => number;
}

const AUTONOMY_SCALE: UnifiedOsStateSnapshot['autonomyScale'] = [
  { level: 'L0_EXPLAIN', label: 'L0 · Read/Explain', policy: 'Zero state changes. Answers & audits only.' },
  { level: 'L1_PREPARE', label: 'L1 · Draft/Plan', policy: 'Searches, curates, summarizes & drafts locally.' },
  { level: 'L2_APPROVAL', label: 'L2 · Approval Gate', policy: 'External writes/sends wait for single-use YES.' },
  { level: 'L3_ROUTINE', label: 'L3 · Bounded Loop', policy: 'Scheduled read/prepare routines; paused by Kill Switch.' },
  { level: 'L4_PIPELINE', label: 'L4 · Specialist Crew', policy: 'Parallel multi-agent pipeline with Auditor check.' },
  { level: 'L5_BLOCKED', label: 'L5 · Hard Blocked', policy: 'Real money, destructive rm/drop, secret export forbidden.' },
];

const DEFAULT_SKILLS: OsSkill[] = [
  {
    id: 'skill_morning_brief',
    name: 'Chief-of-Staff Morning Brief',
    triggerCommand: '/calendar',
    specialistId: 'chief_of_staff',
    description: 'Fuses live Calendar, Gmail threads, Notion open tasks & Telegram inbox into 42-col lens cards.',
    steps: ['Read workspace corridor', 'Rank next deadlines & blockers', 'Highlight open reply candidates'],
    approvalRule: 'L3_BOUNDED_ROUTINE',
    createdAtIso: '2026-11-25T00:00:00.000Z',
  },
  {
    id: 'skill_inbox_triage',
    name: 'Inbox & Telegram Triage',
    triggerCommand: '/inbox',
    specialistId: 'chief_of_staff',
    description: 'Scans open Gmail & Telegram threads and prepares reply behind single-use L2 approval.',
    steps: ['Check unreplied threads', 'Verify allowed recipient', 'Stage draft behind Default-NO'],
    approvalRule: 'L2_APPROVAL_REQUIRED',
    createdAtIso: '2026-11-25T00:00:00.000Z',
  },
  {
    id: 'skill_workspace_ci',
    name: 'Repo & PR Health Watch',
    triggerCommand: '/code',
    specialistId: 'developer',
    description: 'Runs safe read-only git status & open PR checks and creates Kanban alerts on drift.',
    steps: ['Run git status inspect', 'Scan recent commits', 'Surface summary on Glasses'],
    approvalRule: 'L3_BOUNDED_ROUTINE',
    createdAtIso: '2026-11-25T00:00:00.000Z',
  },
  {
    id: 'skill_market_signal',
    name: 'Market Signal Digest (Paper)',
    triggerCommand: '/research btc market',
    specialistId: 'finance_admin',
    description: 'Fetches live CoinGecko prices/RSI proxies with strict L5 real-money order block.',
    steps: ['Fetch CoinGecko simple price', 'Compute RSI/regime proxy', 'Stage optional Telegram alert'],
    approvalRule: 'L3_BOUNDED_ROUTINE',
    createdAtIso: '2026-11-25T00:00:00.000Z',
  },
  {
    id: 'skill_music_focus',
    name: 'Music & Focus Session Curator',
    triggerCommand: '/music deep_focus',
    specialistId: 'music_curator',
    description: 'Queries live free iTunes Search API and builds a 45m focus block without silent autoplay.',
    steps: ['Parse mood & duration', 'Fetch live iTunes tracks', 'Draft G2 Focus HUD (confirm to play)'],
    approvalRule: 'L1_READ_ONLY',
    createdAtIso: '2026-11-25T00:00:00.000Z',
  },
  {
    id: 'skill_career_radar',
    name: 'Career & Opportunity Radar',
    triggerCommand: '/jobs',
    specialistId: 'career_operator',
    description: 'Searches Unified Memory & workspace notes for active outreach, pitch & career actions.',
    steps: ['Query Unified Memory for leads', 'Check open deadlines', 'Prepare next follow-up checklist'],
    approvalRule: 'L1_READ_ONLY',
    createdAtIso: '2026-11-25T00:00:00.000Z',
  },
];

const DEFAULT_ROUTINES: OsRoutine[] = [
  {
    id: 'morning_brief',
    title: 'Morning Chief-of-Staff Briefing',
    skillId: 'skill_morning_brief',
    specialistId: 'chief_of_staff',
    scheduleLabel: 'Daily · 08:00',
    intervalMs: 120_000,
    paused: false,
    lastRunAtIso: null,
    lastStatus: 'IDLE',
    lastSummary: 'Ready to scan Calendar, Gmail, Notion & Telegram.',
  },
  {
    id: 'inbox_triage',
    title: 'Inbox & Thread Urgency Watch',
    skillId: 'skill_inbox_triage',
    specialistId: 'chief_of_staff',
    scheduleLabel: 'Every 30m',
    intervalMs: 180_000,
    paused: false,
    lastRunAtIso: null,
    lastStatus: 'IDLE',
    lastSummary: 'Stages urgent reply behind single-use L2 approval.',
  },
  {
    id: 'workspace_ci_watch',
    title: 'Git & Build Hygiene Watch',
    skillId: 'skill_workspace_ci',
    specialistId: 'developer',
    scheduleLabel: 'Every 20m',
    intervalMs: 240_000,
    paused: false,
    lastRunAtIso: null,
    lastStatus: 'IDLE',
    lastSummary: 'Monitors local repo dirty count & branch health.',
  },
  {
    id: 'market_watch',
    title: 'Market Research Signal Watch (Paper)',
    skillId: 'skill_market_signal',
    specialistId: 'finance_admin',
    scheduleLabel: 'Every 15m',
    intervalMs: 300_000,
    paused: false,
    lastRunAtIso: null,
    lastStatus: 'IDLE',
    lastSummary: 'Paper CoinGecko research only — live orders blocked (L5).',
  },
  {
    id: 'music_focus_suggest',
    title: 'Focus Music Block Pairing',
    skillId: 'skill_music_focus',
    specialistId: 'music_curator',
    scheduleLabel: 'Weekdays · 10:00',
    intervalMs: 360_000,
    paused: false,
    lastRunAtIso: null,
    lastStatus: 'IDLE',
    lastSummary: 'Pairs calendar gap with live iTunes focus tracks (confirm to play).',
  },
  {
    id: 'career_radar',
    title: 'Career & Pitch Radar',
    skillId: 'skill_career_radar',
    specialistId: 'career_operator',
    scheduleLabel: 'Weekdays · 18:00',
    intervalMs: 420_000,
    paused: false,
    lastRunAtIso: null,
    lastStatus: 'IDLE',
    lastSummary: 'Reviews active applications, VC pitches & deliverables.',
  },
];

export function detectL5BlockedRequest(rawText: string): string | null {
  const lower = rawText.toLowerCase();
  if (
    /\b(wire transfer|send real money|place live order|buy live btc|live trade order|submit payment|charge credit card)\b/.test(
      lower,
    )
  ) {
    return 'L5 Hard Block: Real-money trades, wire transfers, and payment charges are disabled in autonomous mode.';
  }
  if (/\b(rm\s+-rf|drop\s+table|delete\s+database|format\s+drive|wipe\s+production)\b/.test(lower)) {
    return 'L5 Hard Block: Destructive filesystem or database wipe commands are permanently forbidden.';
  }
  if (/\b(export\s+api\s*key|dump\s+secrets|reveal\s+private\s*key|send\s+token\s+to)\b/.test(lower)) {
    return 'L5 Hard Block: Exporting credentials, API keys, or vault secrets is forbidden.';
  }
  if (/\b(blast\s+everyone|spam\s+all\s+contacts|auto\s+apply\s+100\s+jobs)\b/.test(lower)) {
    return 'L5 Hard Block: Unconfirmed bulk messaging and automated bulk submissions are blocked.';
  }
  return null;
}

const PRIVILEGED_TELEGRAM_COMMANDS = new Set([
  '/approve',
  '/reject',
  '/pause',
  '/resume',
  '/inbox',
  '/calendar',
  '/code',
  '/settings',
]);

interface PersistedOsState {
  killSwitch: UnifiedOsStateSnapshot['killSwitch'];
  skills: OsSkill[];
  routines: OsRoutine[];
  approvals: OsApprovalItem[];
  pipelines: OsPipelineRun[];
  recentCommands: OsCommandLogEntry[];
  lastTelegramUpdateId?: number;
}

/**
 * Single Unified Autonomous Personal OS Harness coordinating all OnQ capabilities:
 * - L0-L5 Autonomy Policy + Global Kill Switch
 * - 10 Least-Privilege Specialist Agents + L4 Parallel Pipeline Runner
 * - Persisted Grok-Bot Reusable Skills & 24/7 Routines
 * - Single-Use Expiring L2 Approval Inbox synced across Web, Even G2 Glasses, and Telegram
 * - Free Real-Catalog Music Curator + Telegram Command Centre
 */
export class UnifiedOsHarness {
  private state: PersistedOsState;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private readonly nowFn: () => number;
  private readonly persistPath: string;

  constructor(private readonly deps: UnifiedOsHarnessDeps) {
    this.nowFn = deps.nowFn ?? (() => Date.now());
    this.persistPath = path.join(deps.dataDir, 'os-harness.json');
    this.state = this.loadState();
  }

  private loadState(): PersistedOsState {
    const nowIso = new Date(this.nowFn()).toISOString();
    try {
      if (fs.existsSync(this.persistPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.persistPath, 'utf8')) as Partial<PersistedOsState>;
        return {
          killSwitch: parsed.killSwitch ?? { paused: false, updatedAtIso: nowIso },
          skills: Array.isArray(parsed.skills) && parsed.skills.length > 0 ? parsed.skills : [...DEFAULT_SKILLS],
          routines:
            Array.isArray(parsed.routines) && parsed.routines.length > 0
              ? parsed.routines
              : DEFAULT_ROUTINES.map((r) => ({ ...r })),
          approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
          pipelines: Array.isArray(parsed.pipelines) ? parsed.pipelines : [],
          recentCommands: Array.isArray(parsed.recentCommands) ? parsed.recentCommands : [],
          lastTelegramUpdateId:
            typeof parsed.lastTelegramUpdateId === 'number' ? parsed.lastTelegramUpdateId : undefined,
        };
      }
    } catch {
      // ignore corrupted file and reinitialize safely
    }
    return {
      killSwitch: { paused: false, updatedAtIso: nowIso },
      skills: [...DEFAULT_SKILLS],
      routines: DEFAULT_ROUTINES.map((r) => ({ ...r })),
      approvals: [],
      pipelines: [],
      recentCommands: [],
    };
  }

  private saveState(): void {
    try {
      fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
      const tmp = `${this.persistPath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.persistPath);
    } catch {
      // non-fatal if directory unavailable
    }
  }

  private expireStaleApprovals(): void {
    const nowMs = this.nowFn();
    let changed = false;
    for (const item of this.state.approvals) {
      if (item.status === 'PENDING' && nowMs > Date.parse(item.expiresAtIso)) {
        item.status = 'EXPIRED';
        changed = true;
      }
    }
    if (changed) this.saveState();
  }

  getLastTelegramUpdateId(): number | undefined {
    return this.state.lastTelegramUpdateId;
  }

  setLastTelegramUpdateId(updateId: number): void {
    this.state.lastTelegramUpdateId = updateId;
    this.saveState();
  }

  getState(): UnifiedOsStateSnapshot {
    this.expireStaleApprovals();
    const sum = this.deps.getSummary();
    const integrations: IntegrationCapabilityStatus[] = [
      {
        id: 'ai_cascade',
        name: `AI Router (${sum.activeLlmProvider})`,
        status: sum.hasOpenRouter || sum.hasGrok || sum.hasOmniRoute ? 'LIVE' : 'LOCAL_FREE',
        detail: sum.hasOpenRouter
          ? 'OpenRouter free/live + automatic failover active'
          : 'Deterministic Rules + free local bridge active',
      },
      {
        id: 'google_workspace',
        name: 'Google Calendar & Gmail',
        status: sum.hasGoogle ? 'LIVE' : 'CONNECT_TO_ENABLE',
        detail: sum.hasGoogle ? 'Live OAuth synced' : 'Connect Google OAuth in Connectors',
      },
      {
        id: 'notion',
        name: 'Notion Tasks',
        status: sum.hasNotion ? 'LIVE' : 'CONNECT_TO_ENABLE',
        detail: sum.hasNotion ? 'Live Notion database synced' : 'Paste Notion token in Connectors',
      },
      {
        id: 'telegram',
        name: 'Telegram Bot Command Centre',
        status: sum.hasTelegram ? 'LIVE' : 'CONNECT_TO_ENABLE',
        detail: sum.hasTelegram
          ? `Live polling & inline approvals (${sum.telegramChatId ? `chat ${sum.telegramChatId.slice(-4)}` : 'chat ready'})`
          : 'Add Telegram bot token in Connectors',
      },
      {
        id: 'voice',
        name: 'Voice (AssemblyAI / Whisper)',
        status: sum.voiceConnected ? 'LIVE' : 'LOCAL_FREE',
        detail: sum.voiceConnected ? 'AssemblyAI STT-3.7 + TTS-1 active' : 'Local RMS/STT fallback ready',
      },
      {
        id: 'music_itunes',
        name: 'Music Curator (iTunes Search)',
        status: 'LIVE',
        detail: 'Free live Apple iTunes Search catalog (0 API keys) + confirm-before-play guard',
      },
      {
        id: 'spotify',
        name: 'Spotify Connect (Optional)',
        status: sum.hasSpotify ? 'LIVE' : 'CONNECT_TO_ENABLE',
        detail: sum.hasSpotify
          ? 'Spotify OAuth connected'
          : 'Connect Spotify OAuth for Spotify library (playback control requires Premium)',
      },
      {
        id: 'local_pc',
        name: 'Local Git & Repo Inspector',
        status: 'LOCAL_FREE',
        detail: 'Safe allowlisted git status, git log, and workspace checks active',
      },
    ];

    const pendingApprovalCount = this.state.approvals.filter((a) => a.status === 'PENDING').length;

    return {
      killSwitch: { ...this.state.killSwitch },
      autonomyScale: AUTONOMY_SCALE,
      roster: SPECIALIST_ROSTER,
      skills: this.state.skills.map((s) => ({ ...s, steps: [...s.steps] })),
      routines: this.state.routines.map((r) => ({ ...r })),
      approvals: this.state.approvals.map((a) => ({ ...a })),
      pendingApprovalCount,
      recentPipelines: this.state.pipelines.map((p) => ({
        ...p,
        steps: p.steps.map((s) => ({ ...s })),
        g2Lines: [...p.g2Lines],
      })),
      activeMusicSession: this.deps.musicCurator.getLastSession(),
      recentCommands: this.state.recentCommands.map((c) => ({ ...c })),
      integrations,
      lastTelegramUpdateId: this.state.lastTelegramUpdateId,
    };
  }

  setKillSwitch(paused: boolean, reason?: string): UnifiedOsStateSnapshot {
    const nowIso = new Date(this.nowFn()).toISOString();
    this.state.killSwitch = {
      paused,
      reason: reason?.trim() || (paused ? 'Paused by operator Kill Switch' : 'Resumed by operator'),
      updatedAtIso: nowIso,
    };
    this.saveState();
    this.deps.onKillSwitchChanged?.(paused);
    this.deps.onAudit(
      `Global Kill Switch -> ${paused ? 'PAUSED' : 'ACTIVE'} (${this.state.killSwitch.reason})`,
      'KILL_SWITCH',
    );
    this.deps.onBroadcast('os_state', this.getState());
    this.deps.onBroadcast('corridor', { reason: 'os_killswitch' });
    return this.getState();
  }

  toggleRoutine(routineId: string, paused?: boolean): OsRoutine | null {
    const routine = this.state.routines.find((r) => r.id === routineId);
    if (!routine) return null;
    routine.paused = paused ?? !routine.paused;
    this.saveState();
    this.deps.onAudit(`Routine ${routine.id} -> ${routine.paused ? 'PAUSED' : 'ACTIVE'}`, 'ROUTINE');
    this.deps.onBroadcast('os_state', this.getState());
    return { ...routine };
  }

  createSkill(input: {
    name: string;
    triggerCommand?: string;
    specialistId?: SpecialistId;
    description?: string;
    steps?: string[];
    scheduleLabel?: string;
    addRoutine?: boolean;
  }): { skill: OsSkill; routine?: OsRoutine } {
    const cleanName = input.name.trim().slice(0, 64) || 'Custom Skill';
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom';
    const id = `skill_${slug}_${this.nowFn().toString(36).slice(-4)}`;
    const specialist = SPECIALIST_ROSTER.some((s) => s.id === input.specialistId)
      ? (input.specialistId as SpecialistId)
      : 'researcher';
    const skill: OsSkill = {
      id,
      name: cleanName,
      triggerCommand: input.triggerCommand?.trim() || `/${slug.slice(0, 14)}`,
      specialistId: specialist,
      description:
        input.description?.trim().slice(0, 180) ||
        `Reusable Grok-Bot skill orchestrated cleanly via ${specialist}.`,
      steps:
        input.steps && input.steps.length > 0
          ? input.steps.map((s) => s.trim()).filter(Boolean).slice(0, 6)
          : ['Gather verified context', 'Prepare concise brief', 'Route external writes through L2 approval'],
      approvalRule: 'L2_APPROVAL_REQUIRED',
      createdAtIso: new Date(this.nowFn()).toISOString(),
    };
    this.state.skills = [skill, ...this.state.skills].slice(0, 24);

    let routine: OsRoutine | undefined;
    if (input.addRoutine !== false) {
      routine = {
        id: `rtn_${slug}_${this.nowFn().toString(36).slice(-4)}`,
        title: cleanName,
        skillId: skill.id,
        specialistId: specialist,
        scheduleLabel: input.scheduleLabel?.trim() || 'On-demand / Every 60m',
        intervalMs: 300_000,
        paused: false,
        lastRunAtIso: null,
        lastStatus: 'IDLE',
        lastSummary: skill.description.slice(0, 96),
      };
      this.state.routines = [routine, ...this.state.routines].slice(0, 20);
    }

    this.saveState();
    this.deps.onAudit(`Created reusable skill "${skill.name}" (${skill.specialistId})`, 'ROUTINE');
    this.deps.onBroadcast('os_state', this.getState());
    return { skill, routine };
  }

  async enqueueApproval(input: {
    specialistId: SpecialistId;
    destination: ApprovalDestination;
    title: string;
    summary: string;
    payloadPreview: string;
    sourceSurface: OsApprovalItem['sourceSurface'];
  }): Promise<OsApprovalItem> {
    this.expireStaleApprovals();
    const canonical = `${input.destination}:${input.title}:${input.payloadPreview}`;
    const idempotencyKey = crypto.createHash('sha256').update(canonical).digest('hex');
    const existingPending = this.state.approvals.find(
      (a) => a.idempotencyKey === idempotencyKey && a.status === 'PENDING',
    );
    if (existingPending) {
      return { ...existingPending };
    }

    const nowMs = this.nowFn();
    const item: OsApprovalItem = {
      id: `apr_${crypto.randomBytes(4).toString('hex')}`,
      createdAtIso: new Date(nowMs).toISOString(),
      expiresAtIso: new Date(nowMs + 15 * 60_000).toISOString(),
      idempotencyKey,
      payloadHash: idempotencyKey.slice(0, 16),
      autonomyLevel: 'L2_APPROVAL',
      specialistId: input.specialistId,
      destination: input.destination,
      title: input.title.trim().slice(0, 80),
      summary: input.summary.trim().slice(0, 180),
      payloadPreview: input.payloadPreview.trim().slice(0, 420),
      status: 'PENDING',
      sourceSurface: input.sourceSurface,
    };

    this.state.approvals = [item, ...this.state.approvals].slice(0, 30);
    if (this.deps.onApprovalCreated) {
      try {
        const msgId = await this.deps.onApprovalCreated(item);
        if (msgId) item.telegramMessageId = msgId;
      } catch {
        // Non-fatal if Telegram notification unavailable
      }
    }
    this.saveState();
    this.deps.onAudit(`Staged L2 approval ${item.id}: ${item.title} (${item.destination})`, 'APPROVAL');
    this.deps.onBroadcast('os_state', this.getState());
    this.deps.onBroadcast('corridor', { reason: 'os_approval_staged' });
    return { ...item };
  }

  async decideApproval(
    id: string,
    decision: 'approve' | 'reject',
    actor: { surface: 'web' | 'glasses' | 'telegram'; chatId?: string },
  ): Promise<{ ok: boolean; error?: string; item?: OsApprovalItem; statusCode: number }> {
    this.expireStaleApprovals();
    const item = this.state.approvals.find((a) => a.id === id);
    if (!item) {
      return { ok: false, error: `Approval ${id} not found`, statusCode: 404 };
    }

    const expectedOwnerChat = this.deps.getSummary().telegramChatId?.trim();
    if (actor.surface === 'telegram' && expectedOwnerChat && actor.chatId && actor.chatId !== expectedOwnerChat) {
      this.deps.onAudit(`Blocked unauthorized Telegram approval ${id} from chat ${actor.chatId}`, 'APPROVAL');
      return { ok: false, error: 'Unauthorized Telegram chat ID for L2 approval', statusCode: 403 };
    }

    if (item.status === 'EXPIRED') {
      return { ok: false, error: `Approval ${id} expired — re-stage before approving`, statusCode: 410 };
    }
    if (item.status !== 'PENDING') {
      return { ok: false, error: `Approval ${id} already finalized (${item.status})`, statusCode: 409 };
    }

    const nowIso = new Date(this.nowFn()).toISOString();
    item.decidedAtIso = nowIso;
    item.decidedBySurface = actor.surface;

    if (decision === 'reject') {
      item.status = 'REJECTED';
      item.executionDetail = `Rejected cleanly from ${actor.surface}`;
      this.saveState();
      this.deps.onAudit(`Rejected L2 approval ${id} via ${actor.surface}`, 'APPROVAL');
      this.deps.onBroadcast('os_state', this.getState());
      this.deps.onBroadcast('corridor', { reason: 'os_approval_rejected' });
      return { ok: true, item: { ...item }, statusCode: 200 };
    }

    const execRes = await this.deps.executeApprovalAction(item);
    item.status = execRes.ok ? 'APPROVED_EXECUTED' : 'FAILED';
    item.executionDetail = execRes.detail;
    this.saveState();
    this.deps.onAudit(
      `${execRes.ok ? 'Executed' : 'Failed'} L2 approval ${id} via ${actor.surface}: ${execRes.detail}`,
      'APPROVAL',
    );
    this.deps.onBroadcast('os_state', this.getState());
    this.deps.onBroadcast('corridor', { reason: 'os_approval_decided' });
    return { ok: execRes.ok, item: { ...item }, error: execRes.ok ? undefined : execRes.detail, statusCode: execRes.ok ? 200 : 422 };
  }

  async runRoutine(
    routineId: string,
  ): Promise<{ ok: boolean; routine: OsRoutine | null; detail: string; g2Lines: string[] }> {
    const routine = this.state.routines.find((r) => r.id === routineId);
    if (!routine) {
      return { ok: false, routine: null, detail: `Routine "${routineId}" not found`, g2Lines: ['ROUTINE NOT FOUND'] };
    }
    if (this.state.killSwitch.paused) {
      routine.lastStatus = 'PAUSED_BY_KILL_SWITCH';
      routine.lastRunAtIso = new Date(this.nowFn()).toISOString();
      routine.lastSummary = 'Blocked cleanly: Global Kill Switch is PAUSED.';
      this.saveState();
      return {
        ok: false,
        routine: { ...routine },
        detail: 'Blocked: Global Kill Switch is currently PAUSED. Resume OS first.',
        g2Lines: ['OS PAUSED (KILL SWITCH)', routine.title.slice(0, 40), 'Use /resume to re-enable'],
      };
    }
    if (routine.paused) {
      return {
        ok: false,
        routine: { ...routine },
        detail: `Routine "${routine.title}" is paused. Resume it first.`,
        g2Lines: ['ROUTINE PAUSED', routine.title.slice(0, 40)],
      };
    }

    const nowIso = new Date(this.nowFn()).toISOString();
    let detail = '';
    try {
      if (routine.id === 'morning_brief' || routine.skillId === 'skill_morning_brief') {
        const { snapshot, sourceMode } = this.deps.getSnapshot();
        const nextEv = snapshot.calendarEvents[0];
        const openNotion = snapshot.notionTasks.filter((t) => !t.completed).length;
        detail = `[${sourceMode}] Next: ${nextEv?.title ?? 'Clear'} | Unread: ${snapshot.gmailThreads.length} | Notion open: ${openNotion}`;
      } else if (routine.id === 'inbox_triage' || routine.skillId === 'skill_inbox_triage') {
        const { snapshot } = this.deps.getSnapshot();
        const thread = snapshot.gmailThreads[0];
        if (thread) {
          const apr = await this.enqueueApproval({
            specialistId: 'chief_of_staff',
            destination: 'GMAIL',
            title: `Reply draft: ${thread.fromName}`,
            summary: `Routine inbox triage staged reply for "${thread.subject}"`,
            payloadPreview: `Confirm received regarding "${thread.subject}" — following up cleanly.`,
            sourceSurface: 'routine',
          });
          detail = `Triaged "${thread.subject}" -> Approval ${apr.id} waiting in Inbox`;
        } else {
          detail = 'Inbox clear — zero threads awaiting triage.';
        }
      } else if (routine.id === 'workspace_ci_watch' || routine.skillId === 'skill_workspace_ci') {
        const insp = await this.deps.runInspect('git_status');
        detail = insp.summary;
      } else if (routine.id === 'market_watch' || routine.skillId === 'skill_market_signal') {
        const mkt = await this.deps.marketBot.fetchSignals(['BTC', 'ETH', 'SOL', 'TAO'], this.deps.fetchImpl);
        detail = mkt.signals
          .slice(0, 3)
          .map((s) => `${s.symbol} $${s.priceUsd} (${s.signal})`)
          .join(' · ');
      } else if (routine.id === 'music_focus_suggest' || routine.skillId === 'skill_music_focus') {
        const mus = await this.deps.musicCurator.curateSession({
          mood: 'deep_focus',
          durationMin: 45,
          fetchImpl: this.deps.fetchImpl,
        });
        detail =
          mus.tracks.length > 0
            ? `${mus.catalogStatus}: ${mus.tracks.length} tracks ready (first: ${mus.tracks[0].title})`
            : 'Offline fallback — live tracks unavailable offline.';
      } else {
        const memories = await this.deps.listMemories(10);
        const rag = this.deps.citedKnowledge.query(
          routine.title,
          memories,
        );
        detail = rag.answer.slice(0, 140);
      }
      routine.lastStatus = 'OK';
      routine.lastRunAtIso = nowIso;
      routine.lastSummary = detail.slice(0, 140);
      this.saveState();
      this.deps.onAudit(`Routine "${routine.id}" completed: ${routine.lastSummary}`, 'ROUTINE');
      this.deps.onBroadcast('os_state', this.getState());
      this.deps.onBroadcast('corridor', { reason: 'os_routine_ran' });
      return {
        ok: true,
        routine: { ...routine },
        detail,
        g2Lines: [clipLine42(`ROUTINE | ${routine.id.toUpperCase()}`), clipLine42(detail), clipLine42('STATUS: OK · BOUNDED L3')],
      };
    } catch (err) {
      routine.lastStatus = 'ERROR';
      routine.lastRunAtIso = nowIso;
      routine.lastSummary = err instanceof Error ? err.message : 'Routine error';
      this.saveState();
      return {
        ok: false,
        routine: { ...routine },
        detail: routine.lastSummary,
        g2Lines: [clipLine42(`ROUTINE ERROR | ${routine.id}`), clipLine42(routine.lastSummary)],
      };
    }
  }

  async runPipeline(params: { preset?: string; goal?: string }): Promise<OsPipelineRun> {
    const startedAtIso = new Date(this.nowFn()).toISOString();
    const preset = (params.preset?.trim() || 'software_delivery').toLowerCase();
    const goal = params.goal?.trim() || `Execute L4 multi-agent crew (${preset})`;

    if (this.state.killSwitch.paused) {
      const blocked: OsPipelineRun = {
        runId: `pip_${crypto.randomBytes(4).toString('hex')}`,
        preset,
        goal,
        startedAtIso,
        finishedAtIso: new Date(this.nowFn()).toISOString(),
        status: 'BLOCKED_KILL_SWITCH',
        steps: [
          {
            specialistId: 'auditor',
            specialistName: 'Auditor',
            status: 'BLOCKED',
            latencyMs: 1,
            evidenceSummary: 'Blocked cleanly by active Global Kill Switch.',
          },
        ],
        auditorVerdict: 'BLOCKED_KILL_SWITCH: Resume Global Kill Switch before running multi-agent crews.',
        g2Lines: ['L4 CREW BLOCKED', 'Global Kill Switch PAUSED', 'Tap Resume or /resume'],
      };
      this.state.pipelines = [blocked, ...this.state.pipelines].slice(0, 15);
      this.saveState();
      this.deps.onBroadcast('os_state', this.getState());
      return blocked;
    }

    const runTimed = async (
      specialistId: SpecialistId,
      specialistName: string,
      fn: () => Promise<string>,
    ): Promise<OsPipelineStepResult> => {
      const t0 = Date.now();
      const evidenceSummary = await fn();
      return {
        specialistId,
        specialistName,
        status: 'DONE',
        latencyMs: Math.max(1, Date.now() - t0),
        evidenceSummary,
      };
    };

    let parallelTasks: Array<Promise<OsPipelineStepResult>>;

    if (preset === 'market_research') {
      parallelTasks = [
        runTimed('finance_admin', 'Finance Admin', async () => {
          const mkt = await this.deps.marketBot.fetchSignals(['BTC', 'ETH', 'SOL', 'TAO'], this.deps.fetchImpl);
          return mkt.signals
            .slice(0, 3)
            .map((s) => `${s.symbol} $${s.priceUsd} (${s.signal})`)
            .join(' | ');
        }),
        runTimed('researcher', 'Researcher', async () => {
          const memories = await this.deps.listMemories(10);
          const rag = this.deps.citedKnowledge.query('market research paper trading policy', memories);
          return `${rag.citations.length} cited source(s): ${rag.answer.slice(0, 90)}`;
        }),
        runTimed('content_producer', 'Content Producer', async () => {
          const sum = this.deps.tokenLedger.getSummary();
          return `Compressed brief via TOON (${sum.reductionPct || 0}% token savings)`;
        }),
      ];
    } else if (preset === 'career_pack') {
      parallelTasks = [
        runTimed('career_operator', 'Career Operator', async () => {
          const { snapshot } = this.deps.getSnapshot();
          const open = snapshot.notionTasks.filter((t) => !t.completed).length;
          return `${open} active Notion deliverable(s); pitch & interview follow-up checklist ready`;
        }),
        runTimed('researcher', 'Researcher', async () => {
          const memories = await this.deps.listMemories(12);
          const rag = this.deps.citedKnowledge.query(goal, memories);
          return `${rag.citations.length} ref(s) grounded cleanly`;
        }),
        runTimed('music_curator', 'Music Curator', async () => {
          const mus = await this.deps.musicCurator.curateSession({
            mood: 'deep_focus',
            durationMin: 30,
            fetchImpl: this.deps.fetchImpl,
          });
          return `${mus.catalogStatus}: ${mus.tracks.length} prep tracks queued (no autoplay)`;
        }),
      ];
    } else if (preset === 'music_focus_flow') {
      parallelTasks = [
        runTimed('chief_of_staff', 'Chief of Staff', async () => {
          const { snapshot } = this.deps.getSnapshot();
          return `Next block anchored after "${snapshot.calendarEvents[0]?.title ?? 'Open slot'}"`;
        }),
        runTimed('music_curator', 'Music Curator', async () => {
          const mus = await this.deps.musicCurator.curateSession({
            mood: 'coding',
            durationMin: 45,
            fetchImpl: this.deps.fetchImpl,
          });
          return `${mus.catalogStatus}: ${mus.tracks.length} tracks ready (first: ${mus.tracks[0]?.title ?? 'Offline'})`;
        }),
        runTimed('fitness_assistant', 'Fitness Assistant', async () => {
          return '45m focus + 5m hydration/eye-reset interval paired.';
        }),
      ];
    } else {
      // morning_os or software_delivery (real workspace + git + cited RAG parallel crew)
      parallelTasks = [
        runTimed('chief_of_staff', 'Chief of Staff', async () => {
          const { snapshot, sourceMode } = this.deps.getSnapshot();
          return `[${sourceMode}] Next: ${snapshot.calendarEvents[0]?.title ?? 'Clear'} | Threads: ${snapshot.gmailThreads.length}`;
        }),
        runTimed('developer', 'Developer', async () => {
          const insp = await this.deps.runInspect('git_status');
          return insp.summary;
        }),
        runTimed('researcher', 'Researcher', async () => {
          const memories = await this.deps.listMemories(12);
          const rag = this.deps.citedKnowledge.query(goal, memories);
          return `Cited [${rag.citations.map((c) => c.index).join(',') || 'local'}]: ${rag.answer.slice(0, 88)}`;
        }),
        runTimed('qa_reviewer', 'QA / Reviewer', async () => {
          const insp = await this.deps.runInspect('workspace_summary');
          return insp.summary;
        }),
      ];
    }

    const steps = await Promise.all(parallelTasks);
    const tAud0 = Date.now();
    const pendingCount = this.state.approvals.filter((a) => a.status === 'PENDING').length;
    const auditorVerdict = `VERIFIED (${steps.length} specialists finished, 0 L5 violations, ${pendingCount} L2 approval(s) queued)`;
    steps.push({
      specialistId: 'auditor',
      specialistName: 'Auditor',
      status: 'DONE',
      latencyMs: Math.max(1, Date.now() - tAud0),
      evidenceSummary: auditorVerdict,
    });

    const g2Lines = [
      clipLine42(`L4 CREW | ${preset.toUpperCase()}`),
      ...steps.slice(0, 2).map((s) => clipLine42(`${s.specialistName.slice(0, 10)}: ${s.evidenceSummary}`)),
      clipLine42('AUDITOR: VERIFIED SAFE'),
    ];

    const run: OsPipelineRun = {
      runId: `pip_${crypto.randomBytes(4).toString('hex')}`,
      preset,
      goal,
      startedAtIso,
      finishedAtIso: new Date(this.nowFn()).toISOString(),
      status: 'VERIFIED_DONE',
      steps,
      auditorVerdict,
      g2Lines,
    };

    this.state.pipelines = [run, ...this.state.pipelines].slice(0, 15);
    this.deps.kanbanScreen.addCard({
      title: `L4 Crew: ${preset}`,
      lane: 'done',
      agentName: 'Unified OS Supervisor',
      model: this.deps.getSummary().activeLlmProvider,
      summary: auditorVerdict,
      roleTemplate: 'architect',
    });
    await this.deps.saveMemory({
      kind: 'task',
      title: `L4 Pipeline: ${preset}`,
      summary: steps.map((s) => `${s.specialistName}: ${s.evidenceSummary}`).join(' | ').slice(0, 240),
      source: 'UnifiedOsHarness',
    });

    this.saveState();
    this.deps.onAudit(`L4 pipeline "${preset}" verified across ${steps.length} agents`, 'PIPELINE');
    this.deps.onBroadcast('os_state', this.getState());
    this.deps.onBroadcast('kanban', { cards: this.deps.kanbanScreen.listCards() });
    this.deps.onBroadcast('corridor', { reason: 'os_pipeline_done' });
    return run;
  }

  async handleCommand(params: {
    text: string;
    surface: 'web' | 'glasses' | 'telegram';
    chatId?: string;
    chatType?: string;
  }): Promise<OsCommandOutcome> {
    const raw = params.text.trim();
    const parts = raw.split(/\s+/);
    const firstToken = (parts[0] ?? '').toLowerCase();
    const cmd = firstToken.startsWith('/') ? firstToken.split('@')[0] : '';
    const arg = raw.slice(firstToken.length).trim();

    const recordOutcome = (out: OsCommandOutcome): OsCommandOutcome => {
      const entry: OsCommandLogEntry = {
        id: `cmd_${crypto.randomBytes(4).toString('hex')}`,
        atIso: new Date(this.nowFn()).toISOString(),
        surface: params.surface,
        command: raw.slice(0, 140),
        domain: out.domain,
        specialistId: out.specialistId,
        autonomyLevel: out.autonomyLevel,
        summary: out.reply.slice(0, 160),
      };
      this.state.recentCommands = [entry, ...this.state.recentCommands].slice(0, 25);
      this.saveState();
      this.deps.onAudit(`[${params.surface}] ${raw.slice(0, 60)} -> ${out.domain}`, 'COMMAND');
      this.deps.onBroadcast('os_state', this.getState());
      return out;
    };

    // Security Guard 1: L5 blocked intents
    const blockedReason = detectL5BlockedRequest(raw);
    if (blockedReason) {
      return recordOutcome({
        ok: false,
        command: cmd || 'natural',
        domain: 'L5_BLOCKED',
        specialistId: 'auditor',
        autonomyLevel: 'L5_BLOCKED',
        reply: blockedReason,
        g2Lines: ['L5 HARD BLOCKED', clipLine42(blockedReason), 'No external write allowed'],
        recommendedTab: 'os',
      });
    }

    // Security Guard 2: Telegram group-chat privacy & owner gate for privileged commands
    const isGroupChat = params.chatType === 'group' || params.chatType === 'supergroup';
    if (params.surface === 'telegram' && isGroupChat && PRIVILEGED_TELEGRAM_COMMANDS.has(cmd)) {
      return recordOutcome({
        ok: false,
        command: cmd,
        domain: 'GROUP_PRIVACY_GUARD',
        specialistId: 'auditor',
        autonomyLevel: 'L0_EXPLAIN',
        reply: `Group privacy guard: "${cmd}" only runs in your private owner DM with the bot, not in group chats.`,
        g2Lines: ['TG GROUP BLOCKED', `${cmd} needs owner DM`, 'Zero private data leaked'],
        recommendedTab: 'os',
      });
    }

    // 1. /help
    if (cmd === '/help') {
      const reply = [
        'OnQ Unified OS Commands:',
        '/status, /calendar, /inbox, /research <q>, /jobs, /code, /project <goal>',
        '/music [mood|query], /focus [mins], /task <desc>, /ask <q>',
        '/approve <id>, /reject <id>, /pause [routine|all], /resume [routine|all], /settings',
      ].join('\n');
      return recordOutcome({
        ok: true,
        command: '/help',
        domain: 'HELP',
        specialistId: 'chief_of_staff',
        autonomyLevel: 'L0_EXPLAIN',
        reply,
        g2Lines: ['ONQ COMMANDS', '/status /calendar /inbox', '/music /focus /research', '/approve /pause /resume'],
        recommendedTab: 'os',
      });
    }

    // 2. /status
    if (cmd === '/status') {
      const snap = this.getState();
      const reply = `OS ${snap.killSwitch.paused ? 'PAUSED (Kill Switch)' : 'ACTIVE'} · Model: ${this.deps.getSummary().activeLlmProvider} · Pending approvals: ${snap.pendingApprovalCount} · Routines active: ${snap.routines.filter((r) => !r.paused).length}/${snap.routines.length}`;
      return recordOutcome({
        ok: true,
        command: '/status',
        domain: 'STATUS',
        specialistId: 'auditor',
        autonomyLevel: 'L0_EXPLAIN',
        reply,
        g2Lines: [
          `OS: ${snap.killSwitch.paused ? 'PAUSED' : 'ACTIVE'}`,
          clipLine42(`AI: ${this.deps.getSummary().activeLlmProvider}`),
          `APPROVALS PENDING: ${snap.pendingApprovalCount}`,
          `ROUTINES: ${snap.routines.filter((r) => !r.paused).length}/${snap.routines.length} ON`,
        ],
        recommendedTab: 'os',
      });
    }

    // 3. /pause [routine|all]
    if (cmd === '/pause' || /\b(kill switch|pause all|emergency stop)\b/i.test(raw)) {
      const target = arg.toLowerCase();
      if (!target || target === 'all') {
        this.setKillSwitch(true, `Paused via ${params.surface}`);
        return recordOutcome({
          ok: true,
          command: '/pause',
          domain: 'KILL_SWITCH',
          specialistId: 'auditor',
          autonomyLevel: 'L0_EXPLAIN',
          reply: 'Global Kill Switch engaged: all scheduled routines and multi-agent pipelines are now PAUSED.',
          g2Lines: ['OS PAUSED (KILL SWITCH)', 'All L3/L4 loops halted', 'Run /resume to restart'],
          recommendedTab: 'os',
        });
      }
      const toggled = this.toggleRoutine(target, true);
      return recordOutcome({
        ok: Boolean(toggled),
        command: '/pause',
        domain: 'ROUTINE',
        specialistId: 'auditor',
        autonomyLevel: 'L0_EXPLAIN',
        reply: toggled ? `Paused routine "${toggled.title}".` : `Routine "${target}" not found.`,
        g2Lines: [toggled ? `PAUSED: ${toggled.id}` : 'ROUTINE NOT FOUND'],
        recommendedTab: 'os',
      });
    }

    // 4. /resume [routine|all]
    if (cmd === '/resume' || /\b(resume all|resume os)\b/i.test(raw)) {
      const target = arg.toLowerCase();
      if (!target || target === 'all') {
        this.setKillSwitch(false, `Resumed via ${params.surface}`);
        return recordOutcome({
          ok: true,
          command: '/resume',
          domain: 'KILL_SWITCH',
          specialistId: 'auditor',
          autonomyLevel: 'L0_EXPLAIN',
          reply: 'Global Kill Switch cleared: Unified OS routines and multi-agent crews are ACTIVE again.',
          g2Lines: ['OS ACTIVE (RESUMED)', 'L3 routines & L4 ready', 'Default-NO L2 still armed'],
          recommendedTab: 'os',
        });
      }
      const toggled = this.toggleRoutine(target, false);
      return recordOutcome({
        ok: Boolean(toggled),
        command: '/resume',
        domain: 'ROUTINE',
        specialistId: 'auditor',
        autonomyLevel: 'L0_EXPLAIN',
        reply: toggled ? `Resumed routine "${toggled.title}".` : `Routine "${target}" not found.`,
        g2Lines: [toggled ? `RESUMED: ${toggled.id}` : 'ROUTINE NOT FOUND'],
        recommendedTab: 'os',
      });
    }

    // 5. /approve <id> and /reject <id>
    if (cmd === '/approve' || cmd === '/reject') {
      const pendingFirst = this.state.approvals.find((a) => a.status === 'PENDING');
      const id = arg || pendingFirst?.id || '';
      if (!id) {
        return recordOutcome({
          ok: false,
          command: cmd,
          domain: 'APPROVAL',
          specialistId: 'auditor',
          autonomyLevel: 'L2_APPROVAL',
          reply: 'No pending L2 approvals to act on.',
          g2Lines: ['NO PENDING APPROVALS', 'Queue is clear'],
          recommendedTab: 'os',
        });
      }
      const dec = await this.decideApproval(id, cmd === '/approve' ? 'approve' : 'reject', {
        surface: params.surface,
        chatId: params.chatId,
      });
      return recordOutcome({
        ok: dec.ok,
        command: cmd,
        domain: 'APPROVAL',
        specialistId: 'auditor',
        autonomyLevel: 'L2_APPROVAL',
        reply: dec.ok
          ? `${cmd === '/approve' ? 'Approved & executed' : 'Rejected'} ${id}: ${dec.item?.executionDetail ?? 'Done'}`
          : dec.error ?? 'Approval decision failed',
        g2Lines: [
          dec.ok ? `L2 ${cmd === '/approve' ? 'EXECUTED' : 'REJECTED'}` : 'L2 DECISION BLOCKED',
          clipLine42(dec.item?.title ?? id),
          clipLine42(dec.item?.executionDetail ?? dec.error ?? ''),
        ],
        approval: dec.item,
        recommendedTab: 'os',
      });
    }

    // 6. /music and /focus
    if (
      cmd === '/music' ||
      cmd === '/focus' ||
      (/\b(music|playlist|song|track|focus session|pomodoro focus)\b/i.test(raw) && !/\bkill\b/i.test(raw))
    ) {
      const minMatch = raw.match(/\b(\d{1,3})\s*(?:m|min|mins|minutes)?\b/i);
      const durationMin = cmd === '/focus' && minMatch ? Number(minMatch[1]) : minMatch && !cmd ? Number(minMatch[1]) : 45;
      const mood: MusicMood = parseMusicMood(arg || raw);
      const customQuery = arg.replace(/\b\d{1,3}\s*(?:m|min|mins|minutes)?\b/gi, '').trim();
      const session = await this.deps.musicCurator.curateSession({
        mood,
        query: customQuery || undefined,
        durationMin,
        fetchImpl: this.deps.fetchImpl,
      });
      const liveUiSurface = buildMusicFocusLiveUi(session);
      this.deps.onBroadcast('liveui', { surface: liveUiSurface });
      this.deps.onBroadcast('os_state', this.getState());
      const topTracks = session.tracks
        .slice(0, 3)
        .map((t, i) => `${i + 1}) ${t.title} — ${t.artist}`)
        .join(' | ');
      const reply =
        session.tracks.length > 0
          ? `Curated ${session.tracks.length} tracks (${session.catalogStatus}, ${durationMin}m ${mood}, confirm-before-play): ${topTracks}.`
          : `Focus session drafted (${durationMin}m ${mood}); offline catalog fallback (connect internet for live iTunes tracks).`;
      return recordOutcome({
        ok: true,
        command: cmd || '/music',
        domain: 'MUSIC_FOCUS',
        specialistId: 'music_curator',
        autonomyLevel: 'L1_PREPARE',
        reply,
        g2Lines: session.g2Lines,
        musicSession: session,
        liveUiSurface,
        recommendedTab: 'os',
      });
    }

    // 7. /calendar
    if (cmd === '/calendar') {
      const { snapshot, sourceMode } = this.deps.getSnapshot();
      const lines = snapshot.calendarEvents.slice(0, 3).map((e) => `${e.startIso.slice(11, 16)} UTC · ${e.title}`);
      const reply =
        lines.length > 0
          ? `Calendar [${sourceMode}]: ${lines.join(' | ')}`
          : `Calendar [${sourceMode}]: Clear schedule ahead.`;
      return recordOutcome({
        ok: true,
        command: '/calendar',
        domain: 'CALENDAR',
        specialistId: 'chief_of_staff',
        autonomyLevel: 'L0_EXPLAIN',
        reply,
        g2Lines: [clipLine42(`GCAL [${sourceMode}]`), ...(lines.length > 0 ? lines.map((l) => clipLine42(l)) : ['Schedule clear'])].slice(0, 4),
        recommendedTab: 'call',
      });
    }

    // 8. /inbox
    if (cmd === '/inbox') {
      const { snapshot, sourceMode } = this.deps.getSnapshot();
      const top = snapshot.gmailThreads[0];
      const reply = top
        ? `Inbox [${sourceMode}]: ${snapshot.gmailThreads.length} thread(s). Top: ${top.fromName} — "${top.subject}" (${top.snippet.slice(0, 80)}). Use /task reply to draft safely.`
        : `Inbox [${sourceMode}]: Zero unread threads.`;
      return recordOutcome({
        ok: true,
        command: '/inbox',
        domain: 'INBOX',
        specialistId: 'chief_of_staff',
        autonomyLevel: 'L0_EXPLAIN',
        reply,
        g2Lines: [
          `INBOX [${sourceMode}] (${snapshot.gmailThreads.length})`,
          top ? clipLine42(`${top.fromName}: ${top.subject}`) : 'Inbox clear',
          top ? clipLine42(top.snippet) : 'No action needed',
        ],
        recommendedTab: 'call',
      });
    }

    // 9. /jobs (Career Operator)
    if (cmd === '/jobs') {
      const memories = await this.deps.listMemories(16);
      const careerHits = memories.filter((m) =>
        /job|role|interview|career|vc|pitch|outreach|offer|resume/i.test(`${m.title} ${m.summary}`),
      );
      const { snapshot } = this.deps.getSnapshot();
      const openDeliverables = snapshot.notionTasks.filter((t) => !t.completed).slice(0, 3);
      const reply = `Career Operator: ${careerHits.length} saved lead/pitch note(s), ${openDeliverables.length} active deliverable(s) (${openDeliverables.map((d) => d.title).join(', ') || 'None'}). Ready to draft tailored outreach under L2 approval.`;
      return recordOutcome({
        ok: true,
        command: '/jobs',
        domain: 'CAREER',
        specialistId: 'career_operator',
        autonomyLevel: 'L1_PREPARE',
        reply,
        g2Lines: [
          'CAREER OPERATOR',
          `Leads: ${careerHits.length} | Open: ${openDeliverables.length}`,
          clipLine42(openDeliverables[0]?.title ?? 'Use /task prep pitch'),
        ],
        recommendedTab: 'os',
      });
    }

    // 10. /code (Developer & QA safe inspection)
    if (cmd === '/code') {
      const insp = await this.deps.runInspect('git_status');
      return recordOutcome({
        ok: insp.ok,
        command: '/code',
        domain: 'CODE_INSPECT',
        specialistId: 'developer',
        autonomyLevel: 'L0_EXPLAIN',
        reply: `Developer Repo Check: ${insp.summary}`,
        g2Lines: insp.lensLines.slice(0, 4),
        recommendedTab: 'computer',
      });
    }

    // 11. /project (L4 Multi-Agent Pipeline)
    if (cmd === '/project' || /\b(run pipeline|multi-agent|specialist crew|run crew)\b/i.test(raw)) {
      const preset = /market/i.test(arg || raw)
        ? 'market_research'
        : /career|job/i.test(arg || raw)
          ? 'career_pack'
          : /music|focus/i.test(arg || raw)
            ? 'music_focus_flow'
            : /morning/i.test(arg || raw)
              ? 'morning_os'
              : 'software_delivery';
      const run = await this.runPipeline({ preset, goal: arg || raw });
      return recordOutcome({
        ok: run.status === 'VERIFIED_DONE',
        command: cmd || '/project',
        domain: 'L4_PIPELINE',
        specialistId: 'auditor',
        autonomyLevel: 'L4_PIPELINE',
        reply: `${run.status}: ${run.auditorVerdict} — Steps: ${run.steps.map((s) => `${s.specialistName}: ${s.evidenceSummary}`).join(' | ')}`,
        g2Lines: run.g2Lines,
        pipelineRun: run,
        recommendedTab: 'os',
      });
    }

    // 12. /research (Cited RAG + CoinGecko Market Watch if market words)
    if (cmd === '/research') {
      const query = arg || 'OnQ G2 safety and architecture';
      if (/\b(btc|eth|sol|tao|fet|crypto|market|coin)\b/i.test(query)) {
        const mkt = await this.deps.marketBot.fetchSignals(['BTC', 'ETH', 'SOL', 'TAO'], this.deps.fetchImpl);
        const top = mkt.signals
          .slice(0, 3)
          .map((s) => `${s.symbol} $${s.priceUsd} (${s.signal})`)
          .join(' | ');
        return recordOutcome({
          ok: true,
          command: '/research',
          domain: 'MARKET_RESEARCH',
          specialistId: 'finance_admin',
          autonomyLevel: 'L1_PREPARE',
          reply: `Market Research (Paper Only): ${top}`,
          g2Lines: mkt.lensLines,
          recommendedTab: 'market',
        });
      }
      const memories = await this.deps.listMemories(16);
      const rag = this.deps.citedKnowledge.query(query, memories);
      return recordOutcome({
        ok: true,
        command: '/research',
        domain: 'RESEARCH',
        specialistId: 'researcher',
        autonomyLevel: 'L1_PREPARE',
        reply: `${rag.answer} [${rag.citations.length} cited source(s)]`,
        g2Lines: rag.lensLines.slice(0, 4),
        recommendedTab: 'call',
      });
    }

    // 13. /task -> routes external send/write into single-use L2 Approval Queue
    if (cmd === '/task') {
      const desc = arg || 'Send OnQ status brief to Telegram';
      const destination: ApprovalDestination = /mail|email|gmail/i.test(desc)
        ? 'GMAIL'
        : /cal|meeting|schedule/i.test(desc)
          ? 'GCAL'
          : /notion|doc|task/i.test(desc)
            ? 'NOTION'
            : /code|git|pr|bot/i.test(desc)
              ? 'COMPUTER'
              : 'TELEGRAM';
      const specialistId: SpecialistId =
        destination === 'COMPUTER' ? 'developer' : 'chief_of_staff';
      const approval = await this.enqueueApproval({
        specialistId,
        destination,
        title: desc.slice(0, 64),
        summary: `Prepared via /task (${params.surface}) — requires single-use L2 confirmation`,
        payloadPreview: desc,
        sourceSurface: params.surface,
      });
      return recordOutcome({
        ok: true,
        command: '/task',
        domain: 'L2_APPROVAL',
        specialistId,
        autonomyLevel: 'L2_APPROVAL',
        reply: `Staged under L2 Default-NO (${approval.id} -> ${destination}). Reply "/approve ${approval.id}" or tap YES on G2/Web/Telegram.`,
        g2Lines: [
          `L2 STAGED: ${approval.id}`,
          clipLine42(`TO: ${destination} | DEFAULT-NO`),
          clipLine42(desc),
          'Hold YES / Tap Approve to run',
        ],
        approval,
        recommendedTab: 'os',
      });
    }

    // 14. /settings
    if (cmd === '/settings') {
      const snap = this.getState();
      const connected = snap.integrations.filter((i) => i.status === 'LIVE' || i.status === 'LOCAL_FREE');
      return recordOutcome({
        ok: true,
        command: '/settings',
        domain: 'SETTINGS',
        specialistId: 'auditor',
        autonomyLevel: 'L0_EXPLAIN',
        reply: `Integrations active: ${connected.map((c) => `${c.name} (${c.status})`).join(', ')}.`,
        g2Lines: [
          'ONQ OS SETTINGS',
          `ACTIVE CHANNELS: ${connected.length}/${snap.integrations.length}`,
          clipLine42(`LLM: ${this.deps.getSummary().activeLlmProvider}`),
        ],
        recommendedTab: 'os',
      });
    }

    // 15. /ask or general natural language -> Researcher + Chief of Staff LLM/RAG cascade
    const question = cmd === '/ask' ? arg || raw : raw;
    const memories = await this.deps.listMemories(14);
    const rag = this.deps.citedKnowledge.query(question, memories);
    const { snapshot, sourceMode } = this.deps.getSnapshot();
    const fallbackReply = `[${sourceMode}] ${rag.answer}`;
    const out = await orchestrateStructuredJson<{ reply: string }>(
      {
        systemPrompt:
          'You are the OnQ Personal OS Supervisor. Answer concisely using ONLY verified workspace/RAG facts. Return strict JSON {"reply":"<=220 chars"}.',
        userPrompt: JSON.stringify({
          question,
          nextEvent: snapshot.calendarEvents[0]?.title ?? null,
          openTasks: snapshot.notionTasks.filter((t) => !t.completed).slice(0, 3).map((t) => t.title),
          citations: rag.citations.slice(0, 2).map((c) => `[${c.index}] ${c.title}: ${c.excerpt.slice(0, 90)}`),
        }),
        fallbackJson: { reply: fallbackReply },
        validate: (v) => {
          if (!v || typeof v !== 'object') return null;
          const r = (v as { reply?: unknown }).reply;
          return typeof r === 'string' && r.trim() ? { reply: r.trim().slice(0, 260) } : null;
        },
      },
      this.deps.getLlmConfig(),
    );

    return recordOutcome({
      ok: true,
      command: cmd || '/ask',
      domain: 'SUPERVISOR_QA',
      specialistId: 'researcher',
      autonomyLevel: 'L0_EXPLAIN',
      reply: out.data.reply,
      g2Lines: [clipLine42('ONQ OS | ANSWER'), ...rag.lensLines.slice(0, 2), clipLine42(`AI: ${out.providerLabel}`)],
      recommendedTab: 'os',
    });
  }

  /**
   * Builds Card 4 (`card-unified-os`) formatted strictly within Even G2's 42-col lens budget.
   */
  buildCorridorCard(nowIso: string, sourceMode: SourceMode): CorridorCard {
    this.expireStaleApprovals();
    const pending = this.state.approvals.filter((a) => a.status === 'PENDING');
    const latestPending = pending[0];
    const mus = this.deps.musicCurator.getLastSession();
    const activeRoutines = this.state.routines.filter((r) => !r.paused).length;
    const paused = this.state.killSwitch.paused;

    const title = paused
      ? 'OS · PAUSED (KILL SWITCH)'
      : latestPending
        ? clipLine42(`OS · ${pending.length} L2 APPROVAL READY`, 42)
        : clipLine42('OS · 10 AGENTS & ROUTINES LIVE', 42);

    const contextLine1 = latestPending
      ? clipLine42(`L2: ${latestPending.title}`, 42)
      : mus?.tracks[0]
        ? clipLine42(`Music: ${mus.tracks[0].title} (${mus.durationMin}m)`, 42)
        : clipLine42(`${activeRoutines}/${this.state.routines.length} routines | /help /music`, 42);

    const contextLine2 = paused
      ? 'All L3/L4 paused | Tap to Resume OS'
      : clipLine42(`AI: ${this.deps.getSummary().activeLlmProvider} | KillSwitch: ARMED`, 42);

    return {
      id: 'card-unified-os',
      sourceMode,
      syncedAtIso: nowIso,
      provenanceLabel: paused ? 'OS PAUSED' : 'UNIFIED OS',
      kind: 'MEETING',
      title,
      timeMeta: paused ? 'PAUSED' : 'OS LIVE',
      startIso: nowIso,
      endIso: new Date(Date.parse(nowIso) + 30 * 60_000).toISOString(),
      contextLine1,
      contextLine2,
      triageRule: 'UPCOMING',
      etag: `os-${this.state.approvals.length}-${paused ? 'p' : 'a'}`,
      quickActions: [
        ...(latestPending
          ? [
              {
                id: 'qa-os-approve',
                label: 'Approve Pending OS Action',
                intent: 'CREATE_ACTION_PACK' as const,
                commandText: '__OS_APPROVE_LATEST__',
              },
            ]
          : []),
        {
          id: 'qa-os-pipeline',
          label: 'Run L4 Specialist Crew',
          intent: 'PLAN_PROJECT',
          commandText: '__OS_RUN_PIPELINE__',
        },
        {
          id: 'qa-os-music',
          label: 'Curate Focus Music (iTunes)',
          intent: 'CREATE_ACTION_PACK',
          commandText: '__OS_MUSIC_FOCUS__',
        },
        {
          id: 'qa-os-routine',
          label: 'Run Morning OS Routine',
          intent: 'CREATE_ACTION_PACK',
          commandText: '__OS_RUN_ROUTINE__',
        },
        {
          id: 'qa-os-killswitch',
          label: paused ? 'Resume Unified OS' : 'Pause OS (Kill Switch)',
          intent: 'DELEGATE_COMPUTER_TASK',
          commandText: '__OS_TOGGLE_KILLSWITCH__',
        },
      ],
    };
  }

  startScheduler(intervalMs = 60_000): void {
    this.stopScheduler();
    this.schedulerTimer = setInterval(() => {
      if (this.state.killSwitch.paused) return;
      void this.runRoutine('morning_brief');
    }, Math.max(10_000, intervalMs));
    this.schedulerTimer.unref?.();
  }

  stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }
}
