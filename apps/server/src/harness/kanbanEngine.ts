export type KanbanLane = 'needs_you' | 'running' | 'scheduled' | 'done';

export interface KanbanCard {
  id: string;
  lane: KanbanLane;
  title: string;
  agentName: string;
  model: string;
  summary: string;
  cronSpec?: string;
  updatedAtIso: string;
  canApprove?: boolean;
  actionCommand?: string;
  scriptPath?: string;
  roleTemplate?: 'architect' | 'market_analyst' | 'bot_engineer' | 'security_auditor';
}

export type BotScreenControlAction =
  | 'takeover'
  | 'release'
  | 'click'
  | 'double_click'
  | 'scroll_up'
  | 'scroll_down'
  | 'enter'
  | 'tab';

export interface WatchScreenState {
  active: boolean;
  appName: string;
  holder: 'agent' | 'human';
  leaseEpoch: number;
  resolution: { w: number; h: number };
  cursor: { x: number; y: number; targetLabel: string };
  lines: string[];
  actionPending?: string;
  lastControl?: string;
  updatedAtIso: string;
}

export interface SilentQuickChip {
  id: string;
  label: string;
  kind: 'command' | 'liveui' | 'telegram' | 'scout';
  payload: string;
}

export const SILENT_QUICK_CHIPS: SilentQuickChip[] = [
  { id: 'chip_late', label: 'Running 15m late (Stage)', kind: 'command', payload: 'Push my next meeting 15 minutes and notify Priya' },
  { id: 'chip_tg', label: 'Push Telegram Brief', kind: 'telegram', payload: 'brief_push' },
  { id: 'chip_pomodoro', label: 'Build Pomodoro App', kind: 'liveui', payload: 'Build a Pomodoro focus timer' },
  { id: 'chip_yt', label: 'Find AI YouTube Videos', kind: 'scout', payload: 'Find top new AI agent YouTube videos today' },
  { id: 'chip_market', label: 'BTC / TAO Market Bot', kind: 'liveui', payload: 'Show BTC TAO market watch signals' },
  { id: 'chip_compare', label: 'Model Router Matrix', kind: 'liveui', payload: 'Compare AI models' },
  { id: 'chip_game', label: 'Play G2 Reflex Arena', kind: 'liveui', payload: 'Launch reflex mini-game' },
];

const INITIAL_TARGETS = [
  { x: 184, y: 112, label: 'Run AI YouTube Feed Fetch' },
  { x: 342, y: 168, label: 'Write data/bots/ai_scout.py' },
  { x: 268, y: 224, label: 'Stage Default-NO Telegram Brief' },
  { x: 420, y: 94, label: 'Inspect Calendar 409 Fence' },
];

export class KanbanAndScreenManager {
  private cards: KanbanCard[];
  private screen: WatchScreenState;
  private targetIdx = 0;

  constructor(nowIso = new Date().toISOString()) {
    this.cards = [
      {
        id: 'kb_needs_1',
        lane: 'needs_you',
        title: 'Push VC Sync 15m + Email Priya',
        agentName: 'OnQ Coordinator',
        model: 'Claude / OpenRouter',
        summary: 'Waiting for explicit YES ring tap (Default-NO lock active)',
        updatedAtIso: nowIso,
        canApprove: true,
        actionCommand: 'Push my next meeting 15 minutes and tell Priya I am walking from another building',
      },
      {
        id: 'kb_run_1',
        lane: 'running',
        title: 'Live Corridor & Calendar Conflict Watch',
        agentName: 'Proactive Watchdog',
        model: 'Local Guard',
        summary: 'Polling Google Calendar + Gmail + Notion every 60s for drift',
        updatedAtIso: nowIso,
      },
      {
        id: 'kb_sched_1',
        lane: 'scheduled',
        title: 'AI YouTube Daily Scout Digest',
        agentName: 'YouTube Scout Bot',
        model: 'OpenRouter Free',
        summary: 'Fetches AI creators XML RSS and queues top releases to Telegram',
        cronSpec: '0 */2 * * *',
        updatedAtIso: nowIso,
        actionCommand: 'Find top new AI agent YouTube videos today',
      },
      {
        id: 'kb_sched_2',
        lane: 'scheduled',
        title: '24/7 Lead Follow-up Outreach Queue',
        agentName: 'Outreach Scheduler',
        model: 'GPT-4o / Fallback',
        summary: 'Prepares contextual Gmail & Telegram follow-ups (Default-NO gated)',
        cronSpec: '30 9 * * 1-5',
        updatedAtIso: nowIso,
      },
      {
        id: 'kb_done_1',
        lane: 'done',
        title: 'SQLite Unified Memory Synced',
        agentName: 'Memory Indexer',
        model: 'SQLite WAL',
        summary: 'Persisted decisions, tasks & meeting context into local encrypted vault',
        updatedAtIso: nowIso,
      },
    ];

    this.screen = {
      active: true,
      appName: 'OnQ Local Agent Sandbox',
      holder: 'agent',
      leaseEpoch: 1,
      resolution: { w: 720, h: 450 },
      cursor: {
        x: INITIAL_TARGETS[0].x,
        y: INITIAL_TARGETS[0].y,
        targetLabel: INITIAL_TARGETS[0].label,
      },
      actionPending: 'Idle · Watching 24/7 corridor + inbox drift',
      lines: [
        '[agent@onq-host] ~/workspace/oncue-even-g2',
        '> watcher.poll(google_calendar, gmail, telegram)',
        '  calendar: 2 events synced | next: VC Sync - Priya Nair',
        '  safety: Default-NO lock armed (0 unconfirmed writes)',
        '  cursor -> [Run AI YouTube Feed Fetch] (184, 112)',
      ],
      updatedAtIso: nowIso,
    };
  }

  listCards(): KanbanCard[] {
    return this.cards.map((c) => ({ ...c }));
  }

  addCard(input: {
    title: string;
    lane?: KanbanLane;
    agentName?: string;
    model?: string;
    summary?: string;
    cronSpec?: string;
    actionCommand?: string;
    scriptPath?: string;
    roleTemplate?: 'architect' | 'market_analyst' | 'bot_engineer' | 'security_auditor';
  }): KanbanCard {
    const roleDefaults =
      input.roleTemplate === 'architect'
        ? { agent: 'System Architect (GStack)', model: 'Claude / Opus', prefix: '[ARCH] ' }
        : input.roleTemplate === 'market_analyst'
          ? { agent: 'Market Research Quant', model: 'Grok / OpenRouter', prefix: '[MKT] ' }
          : input.roleTemplate === 'bot_engineer'
            ? { agent: 'Python Bot Engineer (Ruflo)', model: 'OmniRoute / Codex', prefix: '[BOT] ' }
            : input.roleTemplate === 'security_auditor'
              ? { agent: 'Code-Guard Auditor', model: 'Local Verifier', prefix: '[SEC] ' }
              : null;

    const card: KanbanCard = {
      id: `kb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      lane: input.lane ?? 'needs_you',
      title: `${roleDefaults?.prefix ?? ''}${input.title.trim()}`,
      agentName: input.agentName?.trim() || roleDefaults?.agent || 'OnQ Autonomous Agent',
      model: input.model?.trim() || roleDefaults?.model || 'OpenRouter / Claude',
      summary: input.summary?.trim() || input.title.trim(),
      cronSpec: input.cronSpec,
      canApprove: (input.lane ?? 'needs_you') === 'needs_you',
      actionCommand: input.actionCommand,
      scriptPath: input.scriptPath,
      roleTemplate: input.roleTemplate,
      updatedAtIso: new Date().toISOString(),
    };
    this.cards = [card, ...this.cards].slice(0, 24);
    this.pushScreenLog(`+ kanban [${card.lane}]: ${card.title}`);
    return card;
  }

  actOnCard(id: string, action: 'approve' | 'retry' | 'schedule' | 'complete' | 'archive'): KanbanCard | null {
    const idx = this.cards.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    if (action === 'archive') {
      const [removed] = this.cards.splice(idx, 1);
      this.pushScreenLog(`archived card: ${removed.title}`);
      return removed;
    }
    const card = { ...this.cards[idx], updatedAtIso: new Date().toISOString() };
    if (action === 'approve') {
      card.lane = 'running';
      card.canApprove = false;
      card.summary = `Approved by wearer · executing on ${card.agentName}`;
    } else if (action === 'retry') {
      card.lane = 'running';
      card.summary = 'Retrying task cleanly under Default-NO safety gate';
    } else if (action === 'schedule') {
      card.lane = 'scheduled';
      card.cronSpec = card.cronSpec || '*/30 * * * *';
      card.summary = `Pinned to 24/7 loop (${card.cronSpec})`;
    } else if (action === 'complete') {
      card.lane = 'done';
      card.canApprove = false;
      card.summary = 'Completed & archived into Unified SQLite Memory';
    }
    this.cards[idx] = card;
    this.pushScreenLog(`kanban ${action}: ${card.title} -> ${card.lane}`);
    return card;
  }

  getScreen(): WatchScreenState {
    return {
      ...this.screen,
      cursor: { ...this.screen.cursor },
      lines: [...this.screen.lines],
    };
  }

  pushScreenLog(line: string, appName?: string): void {
    const nowIso = new Date().toISOString();
    if (appName) this.screen.appName = appName;
    this.screen.lines = [...this.screen.lines.slice(-6), line.slice(0, 72)];
    this.screen.updatedAtIso = nowIso;
  }

  controlScreen(action: BotScreenControlAction): WatchScreenState {
    const nowIso = new Date().toISOString();
    if (action === 'takeover') {
      this.screen.holder = 'human';
      this.screen.leaseEpoch += 1;
      this.screen.actionPending = 'Wearer holds mouse/ring input lease (agent paused)';
      this.screen.lastControl = 'takeover';
      this.pushScreenLog(`[lease #${this.screen.leaseEpoch}] HUMAN TAKEOVER -> cursor unlocked`);
    } else if (action === 'release') {
      this.screen.holder = 'agent';
      this.screen.leaseEpoch += 1;
      this.screen.actionPending = 'Agent lease restored · continuing 24/7 watch';
      this.screen.lastControl = 'release';
      this.pushScreenLog(`[lease #${this.screen.leaseEpoch}] released back to agent`);
    } else {
      // Allowlisted pointer/key interactions from G2 glasses / R1 ring
      if (this.screen.holder !== 'human') {
        this.screen.holder = 'human';
        this.screen.leaseEpoch += 1;
      }
      if (action === 'scroll_down' || action === 'tab') {
        this.targetIdx = (this.targetIdx + 1) % INITIAL_TARGETS.length;
      } else if (action === 'scroll_up') {
        this.targetIdx = (this.targetIdx - 1 + INITIAL_TARGETS.length) % INITIAL_TARGETS.length;
      }
      const tgt = INITIAL_TARGETS[this.targetIdx];
      this.screen.cursor = { x: tgt.x, y: tgt.y, targetLabel: tgt.label };
      this.screen.lastControl = action;
      this.screen.actionPending = `${action.toUpperCase()} @ ${tgt.label}`;
      this.pushScreenLog(`[glasses ${action}] -> ${tgt.label} (${tgt.x}, ${tgt.y})`);
    }
    this.screen.updatedAtIso = nowIso;
    return this.getScreen();
  }
}
