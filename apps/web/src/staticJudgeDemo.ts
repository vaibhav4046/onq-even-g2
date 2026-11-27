import type {
  ActionPreview,
  CommitReceipt,
  ConflictLockDetail,
  CorridorCard,
  LiveUiSurface,
  MeetingSessionState,
} from '@onq/core';

/** True only when hosted on GitHub Pages or explicitly launched with `?demo=static`. */
export function isStaticJudgeDemo(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const demoParam = new URLSearchParams(window.location.search).get('demo');
  return host.endsWith('github.io') || demoParam === 'static';
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readReqBody(init?: RequestInit): Record<string, unknown> {
  if (!init?.body || typeof init.body !== 'string') return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function installStaticJudgeDemoFetch(): void {
  if (!isStaticJudgeDemo()) return;
  const g = globalThis as typeof globalThis & { __onqStaticDemoInstalled?: boolean };
  if (g.__onqStaticDemoInstalled) return;
  g.__onqStaticDemoInstalled = true;

  const origFetch = window.fetch.bind(window);
  let seq = 1;
  let paused = false;
  let meeting: MeetingSessionState | null = null;
  let preferredLlm: 'auto' | 'claude' | 'openrouter' | 'chatgpt' | 'omniroute' | 'rules' = 'auto';

  const initialEvents = () => [
    {
      eventId: 'evt-vc-priya',
      title: 'Investor call',
      startIso: '2026-11-24T14:00:00.000Z',
      endIso: '2026-11-24T14:30:00.000Z',
      attendeeName: 'Investor contact',
    },
    {
      eventId: 'evt-design-busy',
      title: 'Design Review (Busy Lock)',
      startIso: '2026-11-24T14:45:00.000Z',
      endIso: '2026-11-24T15:15:00.000Z',
      attendeeName: 'Partner contact',
    },
  ];
  const initialThreads = () => [
    {
      threadId: 'thr-priya-1',
      fromName: 'Investor contact',
      fromEmail: 'investor@sample.example',
      snippet: 'Can we push 15m? Q4 deck ready?',
      sentMessages: [] as Array<{ to: string; body: string; atIso: string; mode: string }>,
    },
  ];
  const initialTasks = () => [
    {
      pageId: 'notion-task-1',
      title: 'Finalize Q4 deck notes',
      completed: false,
      schemaType: 'checkbox',
    },
    {
      pageId: 'notion-task-2',
      title: 'Send Q4 metrics to Partner contact',
      completed: false,
      schemaType: 'status',
    },
  ];

  let calendarEvents = initialEvents();
  let gmailThreads = initialThreads();
  let notionTasks = initialTasks();
  let receipts: CommitReceipt[] = [];
  let auditLog: Array<{ id: string; atIso: string; kind: string; detail: string }> = [
    {
      id: 'aud-init',
      atIso: '2026-11-27T08:00:00.000Z',
      kind: 'BOOT_SANDBOX',
      detail: 'Zero-key GitHub Pages Judge Studio ready (Ollama / Connectors mirrored in browser sandbox).',
    },
  ];
  const previews = new Map<string, ActionPreview>();

  const buildCards = (): CorridorCard[] => {
    const nowIso = new Date().toISOString();
    const vc = calendarEvents[0];
    const startHhmm = vc.startIso.slice(11, 16);
    const pendingTask = notionTasks.find((t) => !t.completed)?.title ?? 'All Q4 tasks complete';
    return [
      {
        id: 'card-vc-priya',
        sourceMode: 'DEMO',
        syncedAtIso: nowIso,
        provenanceLabel: 'DEMO · GCAL+GMAIL',
        kind: 'MEETING',
        title: vc.title,
        timeMeta: `${startHhmm} GMT`,
        startIso: vc.startIso,
        endIso: vc.endIso,
        contextLine1: 'Ask: Can we push 15m? Q4 deck ready?',
        contextLine2: 'GDrive: Q4_Deck_v3.pdf | NOTION: 2 due',
        triageRule: 'IMMINENT_MTG',
        etag: `etag-${vc.startIso}`,
        calendarEventId: vc.eventId,
        gmailThreadId: 'thr-priya-1',
        attendeeEmail: 'investor@sample.example',
        attendeeName: 'Investor contact',
        driveDocTitle: 'Q4_Deck_v3.pdf',
        driveSnippet: 'ARR +42% QoQ · Runway 18m verified.',
        quickActions: [
          {
            id: 'qa-push-15',
            label: 'Push 15m + tell Investor',
            intent: 'RESCHEDULE_AND_NOTIFY',
            commandText: 'Push 15m and tell Investor',
          },
          {
            id: 'qa-try-lock',
            label: 'Try 14:45 (409 Lock)',
            intent: 'RESCHEDULE_AND_NOTIFY',
            commandText: 'Move VC sync to 14:45',
          },
          {
            id: 'qa-live-scribe',
            label: 'Start Live Scribe',
            intent: 'CREATE_ACTION_PACK',
            commandText: '__START_LIVE_SCRIBE__',
          },
        ],
      },
      {
        id: 'card-notion-due',
        sourceMode: 'DEMO',
        syncedAtIso: nowIso,
        provenanceLabel: 'DEMO · NOTION',
        kind: 'NOTION_DUE',
        title: `Notion: ${notionTasks.filter((t) => !t.completed).length} due`,
        timeMeta: 'NOTION',
        startIso: nowIso,
        endIso: nowIso,
        contextLine1: pendingTask,
        contextLine2: 'Schema 2026-03-11 | Tap to check off',
        triageRule: 'NOTION_OVERDUE',
        etag: 'notion-etag-1',
        notionPageId: notionTasks[0]?.pageId,
        quickActions: [
          {
            id: 'qa-notion-done',
            label: 'Mark Q4 deck notes done',
            intent: 'COMPLETE_NOTION_TASK',
            commandText: 'Mark Q4 deck notes done in Notion',
          },
        ],
      },
      {
        id: 'card-telegram-bridge',
        sourceMode: 'DEMO',
        syncedAtIso: nowIso,
        provenanceLabel: 'TELEGRAM DEMO',
        kind: 'EMAIL_ASK',
        title: 'TG: @onq_g2_copilot_bot',
        timeMeta: 'TELEGRAM',
        startIso: nowIso,
        endIso: nowIso,
        contextLine1: 'Watched DM: Send updated deck link?',
        contextLine2: 'Watched DM | Tap to draft reply',
        triageRule: 'ASK_DEADLINE',
        etag: 'tg-etag-1',
        quickActions: [
          {
            id: 'qa-tg-reply',
            label: 'Reply TG: On my way in 5m',
            intent: 'RESCHEDULE_AND_NOTIFY',
            commandText: 'Reply on Telegram: on my way in 5m',
          },
        ],
      },
      {
        id: 'card-computer-proactive',
        sourceMode: 'DEMO',
        syncedAtIso: nowIso,
        provenanceLabel: 'PC HOST · AUTO',
        kind: 'MEETING',
        title: 'PC Host: Ollama qwen3:1.7b',
        timeMeta: 'PC AI',
        startIso: nowIso,
        endIso: nowIso,
        contextLine1: 'APPS: CLAUDE, CODEX, OLLAMA',
        contextLine2: 'INF: COMPUTER (Hosted) | API opt',
        triageRule: 'IMMINENT_MTG',
        etag: 'pc-etag-1',
        quickActions: [
          {
            id: 'qa-pc-pr-gate',
            label: 'Prep PR Gate (/code prep pr)',
            intent: 'DELEGATE_COMPUTER_TASK',
            commandText: '__OS_PREP_PR__',
          },
          {
            id: 'qa-pc-career',
            label: 'Career Pack (/jobs AI roles)',
            intent: 'PLAN_PROJECT',
            commandText: '__OS_CAREER_PACK__',
          },
        ],
      },
      {
        id: 'card-unified-os',
        sourceMode: 'DEMO',
        syncedAtIso: nowIso,
        provenanceLabel: paused ? 'KILL SWITCH (423)' : 'ONQ OS · L0-L5',
        kind: 'MEETING',
        title: paused ? 'KILL SWITCH ACTIVE (423)' : 'OnQ OS: 10-Agent Crew',
        timeMeta: paused ? 'PAUSED' : 'UNIFIED OS',
        startIso: nowIso,
        endIso: nowIso,
        contextLine1: paused ? 'Routines paused | Writes blocked' : 'L0-L5 Active | 5 Skills Ready',
        contextLine2: 'Morning Brief | PR Gate | Career Pack',
        triageRule: 'UPCOMING',
        etag: `os-${paused}`,
        quickActions: [
          {
            id: 'qa-os-pr',
            label: 'Coding PR Gate (/code prep pr)',
            intent: 'DELEGATE_COMPUTER_TASK',
            commandText: '__OS_PREP_PR__',
          },
        ],
      },
    ];
  };

  let osState: Record<string, unknown> = {
    killSwitch: { paused: false, updatedAtIso: '2026-11-27T08:00:00.000Z' },
    autonomyScale: [
      { level: 'L0_READ', label: 'L0 Read-Only', policy: 'Observe Workspace & Telegram cleanly.' },
      { level: 'L1_SUGGEST', label: 'L1 Draft/Suggest', policy: 'Synthesize briefs & Code-Guard drafts.' },
      { level: 'L2_APPROVAL', label: 'L2 Default-NO Gate', policy: 'Requires explicit YES + 2s undo ring.' },
      { level: 'L5_BLOCKED', label: 'L5 Hard Block', policy: 'Blocks force push, secret leaks, spam.' },
    ],
    roster: [
      { id: 'chief', name: 'OnQ Chief', roleTitle: 'Morning & Corridor Orchestrator', maxAutonomy: 'L2_APPROVAL', allowedTools: ['calendar', 'gmail', 'notion'], summary: 'Coordinates 90s corridor loop.' },
      { id: 'developer', name: 'PC Dev Lead', roleTitle: 'Coding PR Gate & Git Inspector', maxAutonomy: 'L2_APPROVAL', allowedTools: ['git_diff_stat', 'vitest'], summary: 'Preps safe PRs; blocks force-push.' },
      { id: 'career_scout', name: 'Career Scout', roleTitle: 'Job Tracker & Code-Guard Outreach', maxAutonomy: 'L2_APPROVAL', allowedTools: ['notion', 'gmail'], summary: 'Matches roles behind Default-NO.' },
    ],
    skills: [
      { id: 'sk-morning', name: 'Morning Brief', triggerCommand: '/morning', specialistId: 'chief', description: '7x42 digest of Cal, Gmail, Notion, TG', steps: ['Read GCal', 'Rank Gmail/TG', 'Stage Notion check-off'], approvalRule: 'L2 Default-NO' },
      { id: 'sk-pr', name: 'Coding PR Gate', triggerCommand: '/code prep pr', specialistId: 'developer', description: 'Inspect git diff + test pass + dry-run PR', steps: ['git diff --stat', 'Secret scan', 'Stage Default-NO PR'], approvalRule: 'L5 blocks --force' },
    ],
    routines: [
      { id: 'rt-morning', title: '08:00 Morning Brief', skillId: 'sk-morning', specialistId: 'chief', scheduleLabel: 'Daily 08:00', paused: false, lastRunAtIso: '2026-11-27T08:00:00.000Z', lastStatus: 'READY', lastSummary: 'Brief staged cleanly.' },
    ],
    approvals: [] as unknown[],
    pendingApprovalCount: 0,
    recentPipelines: [],
    activeMusicSession: null as Record<string, unknown> | null,
    recentCommands: [] as unknown[],
    integrations: [
      { id: 'ollama', name: 'Ollama qwen3:1.7b', status: 'LOCAL_FREE', detail: 'Zero-key browser judge mirror' },
      { id: 'telegram', name: 'Telegram @onq_g2_copilot_bot', status: 'SANDBOX', detail: 'Watched chats behind Default-NO' },
      { id: 'gws', name: 'Google Workspace + Notion', status: 'SANDBOX', detail: 'Sample workspace active' },
    ],
    telegramPoller: { active: false, processedCount: 0, lastError: null },
  };

  const liveUiSurface: LiveUiSurface = {
    id: 'liveui-judge',
    title: 'OnQ Judge Studio · 4-Layer Safety',
    subtitle: 'Tap any control to test live G2 state transitions without keys',
    components: [
      { id: 'c1', kind: 'kpi', label: 'TESTS', value: '537 PASS', status: 'ok' },
      { id: 'c2', kind: 'kpi', label: '409 LOCK', value: '31 ms · 0 LLM', status: 'ok' },
      { id: 'c3', kind: 'toggle', label: 'Kill Switch', active: false },
    ],
  };

  const stagePreviewFor = (cmd: string, cardId?: string, slotStartIso?: string, slotEndIso?: string): ActionPreview | ConflictLockDetail => {
    const low = cmd.toLowerCase();
    if (!slotStartIso && /14:45|2:45|conflict/i.test(low)) {
      auditLog.unshift({ id: `aud-${seq++}`, atIso: new Date().toISOString(), kind: 'CONFLICT_409', detail: 'Blocked busy slot 14:45 (Design Review) in 31ms with 0 LLM calls.' });
      return {
        code: 'CONFLICT_CALENDAR_BUSY',
        message: '14:45 conflicts: Design Review (14:45-15:15)',
        conflictingTitle: 'Design Review (Busy Lock)',
        nextFreeStartIso: '2026-11-24T15:15:00.000Z',
        nextFreeEndIso: '2026-11-24T15:45:00.000Z',
        nextFreeLabel: '15:15 GMT (FREE)',
      };
    }

    const token = `prv-static-${seq++}`;
    const key = `idem-static-${seq}`;
    const expiresAtIso = new Date(Date.now() + 45_000).toISOString();
    let preview: ActionPreview;

    if (low.includes('telegram')) {
      preview = {
        previewToken: token,
        idempotencyKey: key,
        expiresAtIso,
        intent: 'TELEGRAM_ACTION',
        defaultSelection: 'NO',
        cardId: cardId ?? 'card-telegram-bridge',
        summaryLines: [
          'TG: Send to @investor_alex',
          'BODY: On my way in 5m — sync shifted.',
          'GUARD: Watched DM + Default-NO',
        ],
        operations: [
          { provider: 'TELEGRAM', op: 'SEND_TELEGRAM', targetLabel: '@investor_alex', afterValue: 'On my way in 5m — sync shifted.' },
        ],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      };
    } else if (low.includes('notion') || low.includes('mark q4')) {
      preview = {
        previewToken: token,
        idempotencyKey: key,
        expiresAtIso,
        intent: 'COMPLETE_NOTION_TASK',
        defaultSelection: 'NO',
        cardId: cardId ?? 'card-notion-due',
        summaryLines: [
          'NOTION: Mark "Finalize Q4 deck notes" DONE',
          'SCHEMA: 2026-03-11 data_sources',
          'GUARD: Reversible 30s Undo',
        ],
        operations: [
          { provider: 'NOTION', op: 'MARK_DONE', targetLabel: 'Finalize Q4 deck notes', beforeValue: 'Pending', afterValue: 'Completed' },
        ],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      };
    } else {
      const nextTime = slotStartIso ? slotStartIso.slice(11, 16) : '14:15';
      const nextEnd = slotEndIso ?? '2026-11-24T14:45:00.000Z';
      const nextStart = slotStartIso ?? '2026-11-24T14:15:00.000Z';
      preview = {
        previewToken: token,
        idempotencyKey: key,
        expiresAtIso,
        intent: 'RESCHEDULE_AND_NOTIFY',
        defaultSelection: 'NO',
        cardId: cardId ?? 'card-vc-priya',
        summaryLines: [
          `GCAL: 14:00 -> ${nextTime} GMT (FREE)`,
          'MAIL: Notify Investor contact (thread)',
          'GUARD: Code-Guard PASS | 30s Undo',
        ],
        operations: [
          { provider: 'GCAL', op: 'MOVE_EVENT', targetLabel: 'Investor call', beforeValue: '2026-11-24T14:00:00.000Z|2026-11-24T14:30:00.000Z', afterValue: `${nextStart}|${nextEnd}` },
          { provider: 'GMAIL', op: 'SEND_REPLY', targetLabel: 'investor@sample.example (thr-priya-1)', afterValue: `Moving Investor call to ${nextTime} GMT — Q4 deck ready.` },
        ],
        safetyChecks: { calendarConflictFree: true, threadFresh: true, recipientVerified: true, factGuardPassed: true },
      };
    }
    previews.set(token, preview);
    return preview;
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    let parsed: URL;
    try {
      parsed = new URL(rawUrl, window.location.origin);
    } catch {
      return origFetch(input, init);
    }
    if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith('/api/')) {
      return origFetch(input, init);
    }

    const p = parsed.pathname;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const body = readReqBody(init);

    if (p === '/api/health') {
      return jsonRes(200, { ok: true, mode: 'DEMO', voiceEngine: 'AssemblyAI STT-3.7 + TTS-1 (Judge Studio)' });
    }
    if (p === '/api/auth/me') return jsonRes(200, { authenticated: false });
    if (p === '/api/demo/session') return jsonRes(200, { sessionToken: 'static-judge-demo', mode: 'DEMO' });
    if (p === '/api/corridor') {
      return jsonRes(200, {
        cards: buildCards(),
        sourceMode: 'DEMO',
        provenanceLabel: 'DEMO · JUDGE STUDIO',
        syncedAtIso: new Date().toISOString(),
        weatherLabel: '24C Clear',
        weatherWebLabel: '24°C Clear',
        agentGrid: [
          { label: 'AGENTS', value: '5' },
          { label: 'CRONS', value: '8' },
          { label: 'BOTS', value: '2' },
          { label: 'BRIEF', value: '08:00' },
        ],
      });
    }
    if (p === '/api/weather') {
      return jsonRes(200, {
        ok: true,
        weather: { tempC: 24, condition: 'Clear', city: 'Dubai', source: 'fallback', g2Label: '24C Clear', webLabel: '24°C Clear' },
      });
    }
    if (p === '/api/harness/pool') {
      return jsonRes(200, {
        ok: true,
        pool: {
          strategy: 'weighted_least_latency_circuit_breaker',
          hostCpuCap: 8,
          totalInflight: 0,
          totalDispatched: 14,
          totalFailovers: 0,
          nodes: [
            { id: 'ollama', label: 'Ollama qwen3:1.7b', tier: 'hosted_pc', healthy: true, circuit: 'CLOSED', ewmaLatencyMs: 180, inflight: 0, maxConcurrency: 4 },
            { id: 'omniroute', label: 'OmniRoute Gateway', tier: 'hosted_pc', healthy: true, circuit: 'CLOSED', ewmaLatencyMs: 240, inflight: 0, maxConcurrency: 4 },
            { id: 'rules', label: 'Deterministic Rules', tier: 'deterministic', healthy: true, circuit: 'CLOSED', ewmaLatencyMs: 8, inflight: 0, maxConcurrency: 6 },
          ],
        },
      });
    }
    if (p === '/api/os/scheduler') {
      return jsonRes(200, {
        ok: true,
        scheduler: { enabled: true, timeHhmm: '08:00', weatherCity: 'Dubai', lat: 25.2048, lon: 55.2708, includeTelegram: true, includeCrons: true },
      });
    }
    if (p === '/api/os/bots') {
      return jsonRes(200, {
        ok: true,
        bots: [
          { id: 'bot_pr_watch', name: 'PR & CI Digest Bot', trigger: 'Daily 08:00', action: '/code prep pr', enabled: true },
        ],
      });
    }
    if (p === '/api/workspace/state') {
      return jsonRes(200, { snapshot: { calendarEvents, gmailThreads, notionTasks }, receipts, auditLog });
    }
    if (p === '/api/workspace/reset') {
      calendarEvents = initialEvents();
      gmailThreads = initialThreads();
      notionTasks = initialTasks();
      receipts = [];
      paused = false;
      meeting = null;
      return jsonRes(200, { ok: true });
    }
    if (p === '/api/actions/stage' && method === 'POST') {
      if (paused) return jsonRes(423, { error: 'Kill Switch LOCKED (423) — click Kill Switch to resume.' });
      const resOrLock = stagePreviewFor(
        String(body.commandText ?? ''),
        typeof body.cardId === 'string' ? body.cardId : undefined,
        typeof body.slotStartIso === 'string' ? body.slotStartIso : undefined,
        typeof body.slotEndIso === 'string' ? body.slotEndIso : undefined,
      );
      if ('code' in resOrLock) return jsonRes(409, resOrLock);
      return jsonRes(200, resOrLock);
    }
    if (p === '/api/actions/commit' && method === 'POST') {
      if (paused) return jsonRes(423, { error: 'Kill Switch LOCKED (423)' });
      const existing = receipts.find((r) => r.idempotencyKey === body.idempotencyKey);
      if (existing) return jsonRes(200, existing);
      const preview = previews.get(String(body.previewToken ?? ''));
      if (!preview) return jsonRes(404, { error: 'Preview expired; stage again.' });
      for (const op of preview.operations) {
        if (op.provider === 'GCAL' && op.afterValue.includes('|')) {
          const [s, e] = op.afterValue.split('|');
          calendarEvents[0] = { ...calendarEvents[0], startIso: s, endIso: e };
        } else if (op.provider === 'NOTION') {
          notionTasks[0] = { ...notionTasks[0], completed: true };
        } else if (op.provider === 'GMAIL') {
          gmailThreads[0].sentMessages.push({ to: 'investor@sample.example', body: op.afterValue, atIso: new Date().toISOString(), mode: 'DEMO' });
        }
      }
      const receipt: CommitReceipt = {
        receiptId: `rcp-static-${seq++}`,
        idempotencyKey: preview.idempotencyKey,
        committedAtIso: new Date().toISOString(),
        status: 'COMMITTED',
        sourceMode: 'DEMO',
        summaryLines: preview.summaryLines.map((l) => `OK ${l}`),
        operations: preview.operations.map((op) => ({ ...op, reversible: true })),
        undoExpiresAtIso: new Date(Date.now() + 30_000).toISOString(),
        canUndo: true,
      };
      receipts.unshift(receipt);
      auditLog.unshift({ id: `aud-${seq++}`, atIso: receipt.committedAtIso, kind: 'COMMIT', detail: receipt.summaryLines.join(' | ') });
      return jsonRes(200, receipt);
    }
    if (p === '/api/actions/undo' && method === 'POST') {
      const target = receipts.find((r) => r.idempotencyKey === body.idempotencyKey) ?? receipts[0];
      calendarEvents = initialEvents();
      notionTasks = initialTasks();
      const undone: CommitReceipt = target
        ? { ...target, status: 'UNDONE', canUndo: false, summaryLines: ['UNDONE REVERSIBLY', 'CALENDAR + NOTION RESTORED'] }
        : { receiptId: 'rcp-undo', idempotencyKey: 'undo', committedAtIso: new Date().toISOString(), status: 'UNDONE', sourceMode: 'DEMO', summaryLines: ['UNDONE'], operations: [], canUndo: false };
      receipts = receipts.map((r) => (r.receiptId === undone.receiptId ? undone : r));
      auditLog.unshift({ id: `aud-${seq++}`, atIso: new Date().toISOString(), kind: 'UNDO', detail: '30s surgical undo restored prior state.' });
      return jsonRes(200, undone);
    }
    if (p === '/api/stt' && method === 'POST') {
      const h = init?.headers;
      const preset = h instanceof Headers ? h.get('X-OnQ-Preset') : h && !Array.isArray(h) ? (h as Record<string, string>)['X-OnQ-Preset'] : null;
      return jsonRes(200, { rejectedSilent: false, transcript: preset || 'Push 15m and tell Investor', rms: 0.72, sttEngine: 'AssemblyAI STT-3.7 (Judge Sandbox)' });
    }
    if (p === '/api/telegram/automate') {
      const preview = stagePreviewFor('Reply on Telegram: on my way in 5m', 'card-telegram-bridge');
      return jsonRes(200, { preview, generatedText: 'On my way in 5m — Investor call shifted.' });
    }
    if (p === '/api/os/command' && method === 'POST') {
      const cmd = String(body.text ?? '').trim();
      const low = cmd.toLowerCase();
      if (paused && !low.startsWith('/resume')) {
        return jsonRes(423, { ok: false, g2Lines: ['KILL SWITCH LOCKED (423)', 'Routines paused cleanly', 'Click Kill Switch to resume'], reply: 'Kill Switch locked (423).' });
      }
      if (low.includes('--force') || low.includes('rm -rf')) {
        return jsonRes(200, { ok: false, command: cmd, domain: 'code', specialistId: 'developer', autonomyLevel: 'L5_BLOCKED', reply: 'L5 HARD-BLOCKED: Force push and destructive commands never execute.', g2Lines: ['L5 HARD BLOCKED', 'Destructive git push denied', 'Safe PR Gate remains isolated'] });
      }
      if (low.startsWith('/morning')) {
        return jsonRes(200, { ok: true, command: cmd, domain: 'morning', specialistId: 'chief', autonomyLevel: 'L1_SUGGEST', reply: 'Morning Brief synced across Calendar, Gmail, Notion, and Telegram.', g2Lines: ['MORNING BRIEF (08:15)', 'GCAL: Investor call 14:00', 'MAIL: Push 15m? Q4 deck ready', 'NOTION: Finalize Q4 deck notes', 'TG: @investor_alex watched DM'] });
      }
      if (low.startsWith('/code')) {
        return jsonRes(200, { ok: true, command: cmd, domain: 'code', specialistId: 'developer', autonomyLevel: 'L2_APPROVAL', reply: 'Coding PR Gate ready: 537/537 tests pass, 0 secrets leaked, L5 blocks force push.', g2Lines: ['CODING PR GATE (LOCAL PC)', 'TESTS: 537/537 PASS · 0 SEC', 'DIFF: +42 -11 clean TS/G2', 'L5: Force push HARD BLOCKED', 'STAGE: Default-NO -> PR Draft'] });
      }
      if (low.startsWith('/project career_pack') || low.startsWith('/jobs')) {
        return jsonRes(200, { ok: true, command: cmd, domain: 'career', specialistId: 'career_scout', autonomyLevel: 'L2_APPROVAL', reply: 'Career Pack: 3 AI Engineer roles logged to Notion tracker + Code-Guard recruiter draft (Default-NO).', g2Lines: ['CAREER PACK (TUNNEL)', 'MATCHES: 3 Staff AI roles', 'NOTION: Tracker row staged', 'GMAIL: Code-Guard draft ready', 'GATE: Zero spam (Default-NO)'] });
      }
      if (low.startsWith('/music')) {
        return jsonRes(200, { ok: true, command: cmd, domain: 'music', specialistId: 'chief', autonomyLevel: 'L1_SUGGEST', reply: 'Deep Focus 45m audio session armed (plays on paired phone/earbuds; G2 has no speaker).', g2Lines: ['FOCUS MUSIC · 45:00', 'STREAM: Paired Earbuds Only', 'MODE: Deep Focus 92 BPM', 'DO NOT DISTURB: Active'] });
      }
      return jsonRes(200, { ok: true, command: cmd, domain: 'os', specialistId: 'chief', autonomyLevel: 'L1_SUGGEST', reply: `Executed "${cmd}" in zero-key Judge Studio.`, g2Lines: ['ONQ UNIFIED OS (DEMO)', `CMD: ${cmd.slice(0, 36)}`, '537 Tests · 10/10 Security', 'Ready on G2 & Telegram'] });
    }
    if (p === '/api/os/killswitch' && method === 'POST') {
      paused = typeof body.paused === 'boolean' ? body.paused : !paused;
      osState = { ...osState, killSwitch: { paused, reason: paused ? 'Paused by judge demo' : undefined, updatedAtIso: new Date().toISOString() } };
      return jsonRes(200, { ok: true, state: osState });
    }
    if (p === '/api/os/state') return jsonRes(200, osState);
    if (p === '/api/meeting/demo-run') {
      meeting = {
        active: true,
        startedAtIso: new Date().toISOString(),
        elapsedSec: 252,
        speakerCount: 2,
        providerMode: 'DEMO_SANDBOX',
        attendees: ['You', 'Investor contact'],
        turns: [
          { id: 't1', speakerLabel: 'Speaker A', attendeeName: 'You', text: 'Let us lock Q4 metrics for Thursday.', atIso: new Date().toISOString(), isWearer: true, isFinal: true },
          { id: 't2', speakerLabel: 'Speaker B', attendeeName: 'Investor contact', text: 'Send Q4 deck to Partner contact by Thursday 15:00.', atIso: new Date().toISOString(), isWearer: false, isFinal: true },
        ],
        decisions: [{ id: 'd1', summary: 'Lock Q4 metrics for Thursday', speaker: 'You', atIso: new Date().toISOString() }],
        actions: [{ id: 'a1', title: 'Send Q4 deck to Partner contact', owner: 'Investor contact' }],
      };
      return jsonRes(200, meeting);
    }
    if (p === '/api/meeting/ask') {
      return jsonRes(200, { lines: ['MEETING ANSWER (RAM)', 'Q4 deck due Thu 15:00 GMT', 'To: Partner contact', 'Earbuds TTS-1 ready'] });
    }
    if (p === '/api/meeting/wrapup') {
      return jsonRes(200, { preview: stagePreviewFor('Push 15m and tell Investor') });
    }
    if (p === '/api/meeting/wipe') {
      meeting = null;
      return jsonRes(200, { ok: true });
    }
    if (p === '/api/connectors/status' || p === '/api/connectors/connect') {
      if (typeof body.preferredLlm === 'string') preferredLlm = body.preferredLlm as typeof preferredLlm;
      const status = {
        accountName: 'Judge Sandbox',
        accountEmail: null,
        vaultEncrypted: true,
        activeLlmProvider: 'Ollama qwen3:1.7b (Judge Sandbox)',
        preferredLlm,
        openRouterModel: 'anthropic/claude-sonnet-4',
        omniRouteUrl: 'http://127.0.0.1:20128/v1',
        omniRouteModel: 'auto',
        voiceEngine: 'AssemblyAI STT-3.7 + TTS-1',
        googleOAuthConfigured: false,
        notionOAuthConfigured: false,
        openRouterOAuthReady: false,
        googleAuthUrl: null,
        connectors: {
          googleWorkspace: { connected: false, mode: 'DEMO', detail: 'Sample workspace active in static studio' },
          notion: { connected: false, mode: 'DEMO', detail: 'Sample 2026-03-11 schema active' },
          claude: { connected: false, mode: 'DEMO', detail: 'Optional API key' },
          openrouter: { connected: false, mode: 'DEMO', detail: 'Optional API key' },
          chatgpt: { connected: false, mode: 'DEMO', detail: 'Optional API key' },
          assemblyai: { connected: true, mode: 'DEMO', detail: 'STT-3.7 + TTS-1 mirrored' },
          telegram: { connected: true, mode: 'DEMO', detail: '@onq_g2_copilot_bot watched chats' },
        },
      };
      return jsonRes(200, p === '/api/connectors/connect' ? { status } : status);
    }
    if (p === '/api/proactive/status' || p === '/api/proactive/toggle' || p === '/api/proactive/pulse' || p === '/api/proactive/synthesize') {
      return jsonRes(200, {
        running: true,
        intervalMs: 30000,
        pulseCount: 4,
        lastPulseAtIso: new Date().toISOString(),
        insights: [
          { id: 'ins-1', atIso: new Date().toISOString(), category: 'MEETING', severity: 'action', title: 'Investor call in 12m', detail: 'Shift 15m behind Default-NO or test 14:45 409 lock.' },
          { id: 'ins-2', atIso: new Date().toISOString(), category: 'TELEGRAM', severity: 'info', title: 'Watched DM ready', detail: 'Only watched Telegram chats sync to G2.' },
        ],
        activeHarness: null,
      });
    }
    if (p === '/api/computer/tools') {
      return jsonRes(200, {
        tasks: [],
        tools: [
          { id: 'ollama', name: 'Ollama (qwen3:1.7b)', binary: 'ollama', accountMode: 'LOCAL_FREE', installed: true, installHint: 'Run locally for $0 tokens' },
          { id: 'claude_cli', name: 'Claude Code CLI', binary: 'claude', accountMode: 'LOCAL_SUB', installed: true, installHint: 'Runs on your PC' },
        ],
      });
    }
    if (p === '/api/computer/power-source') {
      return jsonRes(200, {
        counts: { hostedReady: 3, hostedStandby: 1, cloudOptional: 4, mcpServers: 8, openBotAgents: 4 },
        hostedReady: [{ id: 'ollama', name: 'Ollama qwen3:1.7b', tier: 'HOSTED_READY', status: 'connected', wakeable: false, detail: '$0 local host inference', fixHint: '' }],
        hostedStandby: [],
        mcpServers: [{ source: 'claude', name: 'github' }, { source: 'claude', name: 'playwright' }],
        honestBoundary: 'Static GitHub Pages Judge Studio mirrors the local OnQ Server telemetry cleanly without touching any remote API keys.',
      });
    }
    if (p === '/api/remote/bridge') {
      return jsonRes(200, { mode: 'LOCAL_LOOPBACK', publicUrl: null, vacationReady: false, commands: { tunnel: 'npm run tunnel', tailscaleFunnel: 'tailscale funnel 8787', packForRemote: 'ONQ_RELAY_URL=... npm run pack' } });
    }
    if (p === '/api/host/profile') {
      return jsonRes(200, { host: { name: 'OnQ Judge Studio (Browser Sandbox)', platform: 'Web / EvenHub 0.9.5', uptimeSec: 3600 }, routing: { inferenceMode: 'auto', preferredLlm }, harnesses: { items: [{ id: 'ollama', kind: 'local', status: 'connected', models: ['qwen3:1.7b'], lastProbeMs: 12 }] }, dataSources: { items: [] } });
    }
    if (p === '/api/sources') return jsonRes(200, { sources: [{ source: 'gcal', effective: 'sample', reason: 'Judge sandbox' }, { source: 'telegram', effective: 'sample', reason: 'Judge sandbox' }] });
    if (p === '/api/memory') return jsonRes(200, { memories: [{ id: 'm1', kind: 'meeting', title: 'Q4 Deck Review', summary: 'Send Q4 metrics Thursday 15:00 GMT', source: 'Notion', createdAtIso: '2026-11-27T08:00:00.000Z' }] });
    if (p === '/api/liveui') return jsonRes(200, { surface: liveUiSurface, silentChips: [] });
    if (p === '/api/harness/tokens') return jsonRes(200, { summary: { estimatedSavedTokens: 1420, reductionPct: 48 } });
    if (p === '/api/preferences') return jsonRes(200, { taste: { verbosity: 'concise' } });
    if (p === '/api/emulator/status') return jsonRes(200, { running: false, mode: 'static-judge-demo' });

    return jsonRes(200, { ok: true, items: [], devices: [], runs: [] });
  };
}
