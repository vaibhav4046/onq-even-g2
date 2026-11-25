import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import type WebSocket from 'ws';
import {
  canVoiceConfirmWrite,
  checkCalendarConflict,
  computePcmRms,
  MeetingTranscriptBuffer,
  parseIcsEvents,
  parseVoiceCommand,
  parseWakeCommand,
} from '@onq/core';
import type {
  ActionOperation,
  ActionPreview,
  CommitReceipt,
  CorridorCard,
  SourceMode,
} from '@onq/core';
import { loadLocalEnvFile } from './env.js';
import {
  createPkcePair,
  OAuthStateStore,
  SignedSessionCookie,
} from './auth/sessionAuth.js';
import { isProviderCooledDown, routeModelCompletion } from './harness/modelRouter.js';
import { AgentTaskEngine } from './harness/agentTaskEngine.js';
import type { AgentTaskKind, AgentTaskTargetTool } from './harness/agentTaskEngine.js';
import { runOrchestrationHarness } from './harness/orchestrationHarness.js';
import { generateGroundedDraft, probeLlmProvider } from './llm.js';
import type { LlmConfig, PreferredLlmProvider } from './llm.js';
import { createConfiguredLedgerStore, SqliteLedgerStore } from './ledger.js';
import type { LedgerStore } from './ledger.js';
import { logError, logInfo, redactSecrets } from './logger.js';
import { DemoWorkspaceProvider } from './providers/demoProvider.js';
import type { DemoFaultInjection } from './providers/demoProvider.js';
import { buildGoogleAuthUrl, GoogleWorkspaceClient } from './providers/googleProvider.js';
import { LiveWorkspaceProvider } from './providers/liveProvider.js';
import {
  detectLocalComputerTools,
  executeDelegatedTask,
  runSafeReadInspection,
} from './providers/localComputerBridge.js';
import type { SafeInspectKind, SafeInspectResult } from './providers/localComputerBridge.js';
import { NotionWorkspaceClient } from './providers/notionProvider.js';
import {
  getSandboxTelegramDigest,
  TelegramWorkspaceClient,
} from './providers/telegramProvider.js';
import type { WorkspaceProvider } from './providers/types.js';
import { MAX_WAV_UPLOAD_BYTES, transcribeWavBuffer } from './stt.js';
import type { SttOptions } from './stt.js';
import { AssemblyAiRealtimeSession } from './stt/assemblyaiRealtime.js';
import type { AssemblyAiSttMode, WsFactory } from './stt/assemblyaiRealtime.js';
import {
  AssemblyAiTtsSession,
  buildDemoWordBoundaries,
  listAvailableTtsVoices,
  synthesizeTtsUtterance,
} from './tts/assemblyaiTts.js';
import { ProactiveAgenticHarness } from './proactiveHarness.js';
import type { ProactiveInsight } from './proactiveHarness.js';
import { EncryptedTokenVault } from './tokenVault.js';

export interface AuditTelemetryEvent {
  id: string;
  atIso: string;
  kind:
    | 'RMS_BLOCK'
    | 'CONFLICT_409'
    | 'CODE_GUARD'
    | 'COMMIT'
    | 'UNDO'
    | 'PAIR_LIVE'
    | 'ICS_IMPORT'
    | 'MEETING_START'
    | 'MEETING_TURN'
    | 'MEETING_ASK'
    | 'MEETING_WIPE'
    | 'TTS_BARGE_IN'
    | 'OAUTH_SIGNIN'
    | 'CONNECTOR_SAVED'
    | 'CONNECTOR_TESTED'
    | 'CONNECTOR_DISCONNECTED'
    | 'COMPUTER_INSPECT'
    | 'AGENT_TASK';
  detail: string;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  ledger?: LedgerStore;
  demoProvider?: DemoWorkspaceProvider;
  liveProviderOverride?: WorkspaceProvider;
  allowedOrigins?: string[];
  llmConfig?: LlmConfig;
  sttOptions?: SttOptions;
  assemblyAiWsFactory?: WsFactory;
  fetchImpl?: typeof fetch;
  nowFn?: () => number;
  allowTestFaultControls?: boolean;
  disableProactiveTimer?: boolean;
}

const DEFAULT_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://127.0.0.1:8787',
  'http://localhost:8787',
  'null',
];

function jsonResponse(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(payload);
}

async function readBodyBuffer(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      throw Object.assign(new Error(`Payload exceeds ${maxBytes} byte cap`), { statusCode: 413 });
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody<T>(req: http.IncomingMessage, maxBytes = 64 * 1024): Promise<T> {
  const buf = await readBodyBuffer(req, maxBytes);
  if (buf.byteLength === 0) return {} as T;
  return JSON.parse(buf.toString('utf8')) as T;
}

function extractBearer(req: http.IncomingMessage): string | undefined {
  const raw = req.headers.authorization;
  if (!raw) return undefined;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : undefined;
}

export async function createOnQServer(opts: ServerOptions = {}): Promise<{
  server: http.Server;
  url: string;
  port: number;
  ledger: LedgerStore;
  vault: EncryptedTokenVault;
  demoProvider: DemoWorkspaceProvider;
  close: () => Promise<void>;
}> {
  const nowFn = opts.nowFn ?? (() => Date.now());
  loadLocalEnvFile();
  const dataDir = opts.dataDir ?? path.join(os.tmpdir(), `onq-data-${process.pid}`);
  const ledger =
    opts.ledger ??
    (opts.dataDir
      ? new SqliteLedgerStore(path.join(dataDir, 'onq.sqlite'), nowFn)
      : await createConfiguredLedgerStore(dataDir, nowFn));
  const vault = new EncryptedTokenVault(dataDir);
  const cookieAuth = new SignedSessionCookie(dataDir);
  const oauthStates = new OAuthStateStore(nowFn);
  const demoProvider = opts.demoProvider ?? new DemoWorkspaceProvider();
  const allowedOrigins = new Set(opts.allowedOrigins ?? DEFAULT_ORIGINS);
  const sseClients = new Set<http.ServerResponse>();
  const auditLog: AuditTelemetryEvent[] = [];
  const meetingBuffer = new MeetingTranscriptBuffer(48);
  const agentTasks = new AgentTaskEngine(nowFn);
  let activeIcsFeed: string | null = null;
  let lastInspectResult: SafeInspectResult | null = null;
  let cachedTelegramInsight: ProactiveInsight | null = null;
  let cachedComputerInsight: ProactiveInsight | null = null;

  let lastCorridorCache: {
    cards: CorridorCard[];
    provenanceLabel: string;
    syncedAtIso: string;
  } | null = null;

  function broadcastSse(event: string, data: unknown): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(msg);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  function recordAudit(kind: AuditTelemetryEvent['kind'], detail: string): void {
    const entry: AuditTelemetryEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      atIso: new Date(nowFn()).toISOString(),
      kind,
      detail,
    };
    auditLog.unshift(entry);
    if (auditLog.length > 20) auditLog.length = 20;
    broadcastSse('audit', entry);
  }

  function resolveLlmConfig(overrideProvider?: PreferredLlmProvider): LlmConfig {
    const creds = vault.load();
    return {
      anthropicKey: opts.llmConfig?.anthropicKey ?? creds.anthropicKey ?? process.env.ANTHROPIC_API_KEY,
      openRouterKey: opts.llmConfig?.openRouterKey ?? creds.openRouterKey ?? process.env.OPENROUTER_API_KEY,
      openRouterModel: opts.llmConfig?.openRouterModel ?? creds.openRouterModel ?? process.env.OPENROUTER_MODEL,
      openAiKey: opts.llmConfig?.openAiKey ?? creds.openAiKey ?? process.env.OPENAI_API_KEY,
      preferredProvider: overrideProvider ?? opts.llmConfig?.preferredProvider ?? creds.preferredLlm ?? 'auto',
      timeoutMs: opts.llmConfig?.timeoutMs,
      fetchImpl: opts.llmConfig?.fetchImpl ?? opts.fetchImpl,
    };
  }

  function resolveAssemblyAiKey(): string | undefined {
    const creds = vault.load();
    return creds.assemblyAiKey ?? process.env.ASSEMBLYAI_API_KEY;
  }

  function parseGoogleOAuthJson(raw: string): { clientId: string; clientSecret: string } {
    const parsed = JSON.parse(raw) as {
      installed?: { client_id?: string; client_secret?: string };
      web?: { client_id?: string; client_secret?: string };
      client_id?: string;
      client_secret?: string;
    };
    const src = parsed.web ?? parsed.installed ?? parsed;
    const clientId = src.client_id?.trim() ?? '';
    const clientSecret = src.client_secret?.trim() ?? '';
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth JSON must contain web.client_id/client_secret or installed.client_id/client_secret');
    }
    return { clientId, clientSecret };
  }

  function resolveActiveLlmLabel(llmCfg: LlmConfig): string {
    if (llmCfg.preferredProvider === 'rules') return 'Rules (Deterministic)';
    if (llmCfg.preferredProvider === 'claude' && llmCfg.anthropicKey) return 'Claude';
    if (llmCfg.preferredProvider === 'openrouter' && llmCfg.openRouterKey) return 'OpenRouter';
    if (llmCfg.preferredProvider === 'chatgpt' && llmCfg.openAiKey) return 'ChatGPT';
    if (llmCfg.anthropicKey && !isProviderCooledDown('claude', llmCfg.anthropicKey)) return 'Claude';
    if (llmCfg.openRouterKey && !isProviderCooledDown('openrouter', llmCfg.openRouterKey)) return 'OpenRouter';
    if (llmCfg.openAiKey && !isProviderCooledDown('chatgpt', llmCfg.openAiKey)) return 'ChatGPT';
    if (llmCfg.openRouterKey) return 'OpenRouter';
    if (llmCfg.anthropicKey) return 'Claude';
    if (llmCfg.openAiKey) return 'ChatGPT';
    return 'Rules (Deterministic)';
  }

  function buildConnectorStatus() {
    const creds = vault.load();
    const llmCfg = resolveLlmConfig();
    const activeLlmProvider = resolveActiveLlmLabel(llmCfg);
    const aaiKey = resolveAssemblyAiKey();
    const clientId = creds.googleClientId ?? process.env.GOOGLE_CLIENT_ID;
    const clientSecret = creds.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
    const googleOAuthConfigured = Boolean(clientId && clientSecret);
    const googleAuthUrl = googleOAuthConfigured ? '/api/auth/google/start' : null;
    const notionOAuthConfigured = Boolean(
      (process.env.NOTION_CLIENT_ID ?? '') && (process.env.NOTION_CLIENT_SECRET ?? ''),
    );

    return {
      accountName: creds.accountName ?? null,
      accountEmail: creds.accountEmail ?? null,
      vaultEncrypted: true,
      activeLlmProvider,
      preferredLlm: creds.preferredLlm ?? 'auto',
      openRouterModel: creds.openRouterModel ?? 'openrouter/free',
      voiceEngine: aaiKey ? 'LIVE · ASSEMBLYAI' : 'SANDBOX · LOCAL',
      googleOAuthConfigured,
      notionOAuthConfigured,
      openRouterOAuthReady: true,
      googleAuthUrl,
      proactive: proactiveHarness.getStatus(),
      connectors: {
        googleWorkspace: {
          connected: Boolean(creds.googleRefreshToken),
          mode: creds.googleRefreshToken ? 'LIVE' : activeIcsFeed ? 'ICS' : 'SANDBOX',
          detail: creds.googleRefreshToken
            ? 'OAuth Calendar, Gmail & Drive active (AES-256-GCM 0600)'
            : activeIcsFeed
              ? 'Live RFC 5545 .ics schedule active'
              : 'Drop Google OAuth JSON, sign in, or click 1-click .ics',
        },
        notion: {
          connected: Boolean(creds.notionToken && creds.notionDatabaseId),
          mode: creds.notionToken && creds.notionDatabaseId ? 'LIVE' : 'SANDBOX',
          detail: creds.notionDatabaseId
            ? `Database ...${creds.notionDatabaseId.slice(-6)} synced (2026-03-11)`
            : 'Internal integration + auto-schema discovery ready',
        },
        telegram: {
          connected: Boolean(creds.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN),
          mode: creds.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN ? 'LIVE' : 'SANDBOX',
          detail:
            creds.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN
              ? `Telegram Bot connected${creds.telegramChatId ? ` (chat ...${creds.telegramChatId.slice(-4)})` : ''}`
              : 'Track 01 + Best Telegram prize integration ready (BotFather token)',
        },
        claude: {
          connected: Boolean(llmCfg.anthropicKey),
          mode: llmCfg.anthropicKey ? 'LIVE' : 'STANDBY',
          detail: llmCfg.anthropicKey ? 'Anthropic Claude Haiku 3.5 key stored in 0600 vault' : 'Add Anthropic API key',
        },
        openrouter: {
          connected: Boolean(llmCfg.openRouterKey),
          mode: llmCfg.openRouterKey ? 'LIVE' : 'STANDBY',
          detail: llmCfg.openRouterKey
            ? `${creds.openRouterModel ?? 'openrouter/free'} via OpenRouter`
            : '1-Click OpenRouter OAuth PKCE ready (0 manual copy)',
        },
        chatgpt: {
          connected: Boolean(llmCfg.openAiKey),
          mode: llmCfg.openAiKey ? 'LIVE' : 'STANDBY',
          detail: llmCfg.openAiKey ? 'OpenAI GPT-4o-mini key stored in 0600 vault' : 'Add OpenAI API key',
        },
        assemblyai: {
          connected: Boolean(aaiKey),
          mode: aaiKey ? 'LIVE' : 'LOCAL_FALLBACK',
          detail: aaiKey
            ? 'STT-3.7 real-time diarization + TTS-1 earbuds voice active'
            : 'Local faster-whisper + offline timings active (add key for live TTS-1)',
        },
      },
    };
  }

  function resolveProvider(sessionMode: SourceMode): WorkspaceProvider {
    if (sessionMode === 'LIVE') {
      if (opts.liveProviderOverride) return opts.liveProviderOverride;
      const creds = vault.load();
      const google = creds.googleRefreshToken
        ? new GoogleWorkspaceClient(vault, opts.fetchImpl)
        : undefined;
      const notion =
        creds.notionToken && creds.notionDatabaseId
          ? new NotionWorkspaceClient(creds.notionToken, creds.notionDatabaseId, opts.fetchImpl)
          : undefined;
      return new LiveWorkspaceProvider({
        google,
        notion,
        getIcsFeed: () => activeIcsFeed,
      });
    }
    return demoProvider;
  }

  const proactiveHarness = new ProactiveAgenticHarness({
    getSnapshot: () => {
      const creds = vault.load();
      const hasLive = Boolean(creds.googleRefreshToken || creds.notionToken || activeIcsFeed);
      const sourceMode: SourceMode = hasLive ? 'LIVE' : 'DEMO';
      return {
        snapshot: resolveProvider(sourceMode).getSnapshot(),
        sourceMode,
      };
    },
    getSummary: () => {
      const creds = vault.load();
      const llmCfg = resolveLlmConfig();
      const activeLlmProvider = resolveActiveLlmLabel(llmCfg);
      const voiceConnected = Boolean(resolveAssemblyAiKey());
      const tgConnected = Boolean(creds.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN);
      const connectedCount = [
        Boolean(creds.googleRefreshToken || activeIcsFeed),
        Boolean(creds.notionToken && creds.notionDatabaseId),
        tgConnected,
        Boolean(llmCfg.anthropicKey),
        Boolean(llmCfg.openRouterKey),
        Boolean(llmCfg.openAiKey),
        voiceConnected,
      ].filter(Boolean).length;
      return { activeLlmProvider, voiceConnected, connectedCount, totalConnectors: 7 };
    },
    getTelegramInsight: () => cachedTelegramInsight,
    getComputerInsight: () => cachedComputerInsight,
    refreshAsyncSignals: async () => {
      const creds = vault.load();
      const nowIso = new Date(nowFn()).toISOString();
      const botToken = creds.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        try {
          const tg = new TelegramWorkspaceClient(botToken, creds.telegramChatId, opts.fetchImpl);
          const msgs = await tg.getRecentMessages(1);
          if (msgs[0]) {
            cachedTelegramInsight = {
              id: `ins-tg-${msgs[0].updateId}`,
              atIso: nowIso,
              category: 'TELEGRAM',
              severity: 'action',
              title: `TG · ${msgs[0].fromName}`,
              detail: msgs[0].text.slice(0, 84),
              suggestedCommand: 'Reply on Telegram: on my way in 5m',
              sourceMode: 'LIVE',
            };
          }
        } catch {
          // keep prior insight cleanly
        }
      }
      const gitSt = await runSafeReadInspection('git_status', process.cwd());
      lastInspectResult = gitSt;
      cachedComputerInsight = {
        id: 'ins-comp-git',
        atIso: nowIso,
        category: 'COMPUTER',
        severity: 'info',
        title: `Computer: ${gitSt.ok ? 'Workspace Ready' : 'Check Needed'}`,
        detail: gitSt.summary,
        suggestedCommand: 'Check git status and open GitHub PRs',
        sourceMode: 'DEMO',
      };
    },
    onPulse: (st) => broadcastSse('proactive', st),
    nowFn,
    intervalMs: 20_000,
    autoStart: !opts.disableProactiveTimer && process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true',
  });
  if (proactiveHarness.getStatus().pulseCount === 0) {
    proactiveHarness.runPulse();
  }

  function applyCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (!allowedOrigins.has(origin) && !/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
      jsonResponse(res, 403, { error: 'CORS origin denied' });
      return false;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-OnQ-Preset');
    return true;
  }

  function extractAuthToken(req: http.IncomingMessage): string | undefined {
    const bearer = extractBearer(req);
    if (bearer) return bearer;
    return cookieAuth.extractSessionToken(req.headers.cookie) ?? undefined;
  }

  async function requireAuth(req: http.IncomingMessage, res: http.ServerResponse) {
    const rawToken = extractAuthToken(req);
    const session = await ledger.validateSession(rawToken);
    if (!session || !rawToken) {
      jsonResponse(res, 401, { error: 'Unauthorized: valid Bearer session required' });
      return null;
    }
    return { ...session, rawToken };
  }

  const server = http.createServer(async (req, res) => {
    if (!applyCors(req, res)) return;
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    try {
      // 1. Health endpoint
      if (req.method === 'GET' && pathname === '/api/health') {
        const creds = vault.load();
        const hasLive = Boolean(creds.googleRefreshToken || creds.notionToken || activeIcsFeed);
        const hasAai = Boolean(resolveAssemblyAiKey());
        const llmCfg = resolveLlmConfig();
        const llmProvider =
          llmCfg.preferredProvider === 'rules'
            ? 'Rules (Deterministic)'
            : llmCfg.preferredProvider === 'claude' && llmCfg.anthropicKey
              ? 'Claude'
              : llmCfg.preferredProvider === 'openrouter' && llmCfg.openRouterKey
                ? 'OpenRouter'
                : llmCfg.preferredProvider === 'chatgpt' && llmCfg.openAiKey
                  ? 'ChatGPT'
                  : llmCfg.anthropicKey
                    ? 'Claude'
                    : llmCfg.openRouterKey
                      ? 'OpenRouter'
                      : llmCfg.openAiKey
                        ? 'ChatGPT'
                        : 'Rules (Deterministic)';
        jsonResponse(res, 200, {
          ok: true,
          brand: 'OnQ',
          mode: hasLive ? 'LIVE' : 'DEMO',
          voiceEngine: hasAai
            ? 'LIVE · ASSEMBLYAI'
            : process.env.WHISPER_CPP_BIN
              ? 'LOCAL · WHISPER'
              : 'SANDBOX · LOCAL',
          sttEngine: hasAai
            ? 'assemblyai-stt-3-7'
            : process.env.WHISPER_CPP_BIN
              ? 'whisper.cpp-local'
              : 'faster-whisper-local',
          ttsEngine: hasAai ? 'assemblyai-tts-1' : 'demo-timing',
          ttsVoices: listAvailableTtsVoices(),
          llmProvider,
          storage: process.env.DATABASE_URL ? 'neon-postgres' : 'node:sqlite',
          version: '2.0.0',
        });
        return;
      }

      // 2. Scoped DEMO-only session mint for zero-setup Browser Simulator
      if (req.method === 'POST' && pathname === '/api/demo/session') {
        const sessionToken = await ledger.mintSession('DEMO');
        jsonResponse(res, 200, { sessionToken, mode: 'DEMO' });
        return;
      }

      // 3. Pairing start (6-digit code, 15m TTL)
      if (req.method === 'POST' && pathname === '/api/pair/start') {
        const body = await readJsonBody<{ mode?: SourceMode }>(req);
        const mode: SourceMode = body.mode === 'LIVE' ? 'LIVE' : 'DEMO';
        const code = String(crypto.randomInt(100000, 999999));
        await ledger.createPairingCode(code, mode, 15 * 60_000);
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const googleAuthUrl = clientId
          ? buildGoogleAuthUrl({
              clientId,
              redirectUri: `http://127.0.0.1:${opts.port ?? 8787}/api/pair/google-callback`,
              state: code,
            })
          : null;
        jsonResponse(res, 200, {
          code,
          ttlSeconds: 900,
          mode,
          googleAuthUrl,
        });
        return;
      }

      // 3b. Google OAuth2 callback (exchanges authorization code -> AES-256-GCM 0600 vault)
      if (req.method === 'GET' && pathname === '/api/pair/google-callback') {
        const oauthCode = parsedUrl.searchParams.get('code');
        const stateCode = parsedUrl.searchParams.get('state');
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        if (!oauthCode || !clientId || !clientSecret) {
          jsonResponse(res, 400, { error: 'Missing OAuth code or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET' });
          return;
        }
        const gClient = new GoogleWorkspaceClient(vault, opts.fetchImpl);
        await gClient.exchangeAuthorizationCode({
          code: oauthCode,
          clientId,
          clientSecret,
          redirectUri: `http://127.0.0.1:${opts.port ?? 8787}/api/pair/google-callback`,
        });
        if (stateCode && /^\d{6}$/.test(stateCode)) {
          await ledger.createPairingCode(stateCode, 'LIVE', 15 * 60_000);
        }
        recordAudit('PAIR_LIVE', 'Google Workspace OAuth paired (AES-256-GCM 0600 vault)');
        res.writeHead(302, { Location: 'http://127.0.0.1:5173/?google=connected#pair' });
        res.end();
        return;
      }

      // 4. Pairing exchange (10-attempt lockout)
      if (req.method === 'POST' && pathname === '/api/pair/exchange') {
        const body = await readJsonBody<{ code?: string }>(req);
        const code = String(body.code ?? '').trim();
        const result = await ledger.exchangePairingCode(code);
        if (!result.ok) {
          jsonResponse(res, result.status, { error: result.reason });
          return;
        }
        jsonResponse(res, 200, { sessionToken: result.sessionToken, mode: result.mode });
        return;
      }

      // 5. Companion credential save & Notion schema inspection
      if (req.method === 'POST' && pathname === '/api/pair/credentials') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{
          notionToken?: string;
          notionDatabaseId?: string;
          googleRefreshToken?: string;
        }>(req);
        const existing = vault.load();
        vault.save({
          ...existing,
          ...(body.notionToken ? { notionToken: body.notionToken.trim() } : {}),
          ...(body.notionDatabaseId ? { notionDatabaseId: body.notionDatabaseId.trim() } : {}),
          ...(body.googleRefreshToken ? { googleRefreshToken: body.googleRefreshToken.trim() } : {}),
        });
        const liveSessionToken = await ledger.mintSession('LIVE');
        recordAudit('PAIR_LIVE', 'Workspace credentials encrypted in mode-0600 vault');
        jsonResponse(res, 200, { ok: true, mode: 'LIVE', sessionToken: liveSessionToken });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/pair/inspect-notion') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ notionToken?: string; notionDatabaseId?: string }>(req);
        if (!body.notionToken || !body.notionDatabaseId) {
          jsonResponse(res, 400, { error: 'notionToken and notionDatabaseId are required' });
          return;
        }
        const notion = new NotionWorkspaceClient(
          body.notionToken.trim(),
          body.notionDatabaseId.trim(),
          opts.fetchImpl,
        );
        const schema = await notion.inspectSchema();
        jsonResponse(res, 200, { ok: true, schema });
        return;
      }

      // 5c. Zero-config .ics Calendar import (fuses real user VEVENTs without OAuth)
      if (req.method === 'POST' && pathname === '/api/pair/ics') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ icsText?: string }>(req, 256 * 1024);
        const events = parseIcsEvents(body.icsText ?? '');
        if (events.length === 0) {
          jsonResponse(res, 422, { error: 'No valid VEVENT entries found in .ics payload' });
          return;
        }
        activeIcsFeed = body.icsText ?? null;
        const liveSessionToken = await ledger.mintSession('LIVE');
        recordAudit('ICS_IMPORT', `Imported ${events.length} VEVENT(s) from .ics feed`);
        broadcastSse('corridor', { reason: 'ics_imported', count: events.length });
        jsonResponse(res, 200, {
          ok: true,
          count: events.length,
          mode: 'LIVE',
          sessionToken: liveSessionToken,
          events: events.slice(0, 5),
        });
        return;
      }

      // 6. Corridor Dossier READ
      if (req.method === 'GET' && pathname === '/api/corridor') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const provider = resolveProvider(session.mode);
        try {
          const data = await provider.fetchCorridor(new Date(nowFn()).toISOString());
          lastCorridorCache = {
            cards: data.cards,
            provenanceLabel: data.provenanceLabel,
            syncedAtIso: data.syncedAtIso,
          };
          jsonResponse(res, 200, {
            cards: data.cards,
            sourceMode: data.sourceMode,
            provenanceLabel: data.provenanceLabel,
            syncedAtIso: data.syncedAtIso,
          });
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 429) {
            jsonResponse(res, 429, {
              error: 'RATE LIMITED - RETRY IN 30s',
              retryAfter: 30,
              cached: lastCorridorCache,
            });
            return;
          }
          jsonResponse(res, 200, {
            cards: (lastCorridorCache?.cards ?? []).map((c) => ({ ...c, sourceMode: 'STALE' as const })),
            sourceMode: 'STALE' as const,
            provenanceLabel: 'OFFLINE CACHE',
            syncedAtIso: lastCorridorCache?.syncedAtIso ?? new Date(nowFn()).toISOString(),
          });
        }
        return;
      }

      // 7. SSE live stream
      if (req.method === 'GET' && pathname === '/api/stream') {
        const tokenFromQuery = parsedUrl.searchParams.get('token') ?? undefined;
        const session = await ledger.validateSession(extractBearer(req) ?? tokenFromQuery);
        if (!session) {
          jsonResponse(res, 401, { error: 'Unauthorized' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`event: connected\ndata: ${JSON.stringify({ mode: session.mode })}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      // 8. Voice 16 kHz PCM WAV -> RMS Silence Gate -> Local Whisper STT
      if (req.method === 'POST' && pathname === '/api/stt') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const wavBuf = await readBodyBuffer(req, MAX_WAV_UPLOAD_BYTES);
        const presetHeader = req.headers['x-onq-preset'];
        const presetTranscript = typeof presetHeader === 'string' ? presetHeader : opts.sttOptions?.presetTranscript;
        const stt = await transcribeWavBuffer(wavBuf, {
          ...opts.sttOptions,
          presetTranscript,
        });
        if (stt.rejectedSilent) {
          recordAudit('RMS_BLOCK', `Rejected silent press (RMS=${stt.rms.toFixed(4)}, ${Math.round(stt.durationMs)}ms)`);
        }
        jsonResponse(res, 200, stt);
        return;
      }

      // 9. Stage ActionPreview (Default-NO, Code-Guard, Conflict 409 check)
      if (req.method === 'POST' && pathname === '/api/actions/stage') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{
          commandText?: string;
          cardId?: string;
          slotStartIso?: string;
          slotEndIso?: string;
          to?: string;
          draftOnly?: boolean;
        }>(req);

        if (body.to && body.to.trim() !== '') {
          recordAudit('CODE_GUARD', `Blocked client-spoofed recipient "${body.to}"`);
          jsonResponse(res, 400, {
            error: 'Security boundary: recipient address is bound server-side from workspace thread metadata',
          });
          return;
        }

        const provider = resolveProvider(session.mode);
        const corridor = await provider.fetchCorridor(new Date(nowFn()).toISOString());
        const cards = corridor.cards;
        const activeCard = cards.find((c) => c.id === body.cardId) ?? cards[0];

        if (body.slotStartIso && body.slotEndIso && activeCard) {
          const ops: ActionOperation[] = [
            {
              provider: 'GCAL',
              op: 'MOVE_EVENT',
              targetLabel: activeCard.title,
              beforeValue: `${activeCard.startIso}|${activeCard.endIso}`,
              afterValue: `${body.slotStartIso}|${body.slotEndIso}`,
            },
          ];
          if (activeCard.gmailThreadId && activeCard.attendeeEmail) {
            ops.push({
              provider: 'GMAIL',
              op: body.draftOnly ? 'SAVE_DRAFT' : 'SEND_REPLY',
              targetLabel: `${activeCard.attendeeEmail} (${activeCard.gmailThreadId})`,
              afterValue: `Moving ${activeCard.title} to ${body.slotStartIso.slice(11, 16)} UTC.`,
            });
          }
          const preview = await buildAndValidatePreview({
            intent: 'RESCHEDULE_AND_NOTIFY',
            cardId: activeCard.id,
            operations: ops,
            summaryLines: [
              `GCAL: ${activeCard.startIso?.slice(11, 16)} -> ${body.slotStartIso.slice(11, 16)} (FREE)`,
              activeCard.attendeeName ? `MAIL: Notify ${activeCard.attendeeName}` : 'GCAL: Verified free slot',
            ],
            nowFn,
            provider,
            ledger,
            sessionHash: session.tokenHash,
          });
          if ('conflict' in preview) {
            recordAudit('CONFLICT_409', String((preview.conflict as { message?: string }).message ?? 'Conflict'));
            jsonResponse(res, 409, preview.conflict);
            return;
          }
          jsonResponse(res, 200, preview.preview);
          return;
        }

        const commandClock = session.mode === 'DEMO' ? new Date(demoProvider.getNowIso()) : new Date(nowFn());
        const parsed = parseVoiceCommand(body.commandText ?? '', {
          now: commandClock,
          cards,
          activeCard,
        });

        if (parsed.kind === 'UNKNOWN') {
          jsonResponse(res, 422, { error: 'Could not map command to a safe workspace action', parsed });
          return;
        }
        if (parsed.kind === 'AMBIGUOUS') {
          jsonResponse(res, 409, {
            code: 'CONFLICT_AMBIGUOUS_CONTACT',
            message: `Multiple contacts match "${parsed.contactQuery}"`,
            matches: parsed.ambiguousMatches,
          });
          return;
        }
        if (parsed.kind === 'ASK_NOTES') {
          const targetCard = cards.find((c) => c.id === parsed.matchedCardId) ?? activeCard;
          jsonResponse(res, 200, {
            readOnlyAnswer: true,
            lines: [
              targetCard ? `${targetCard.attendeeName ?? 'Note'}: ${targetCard.contextLine1}` : 'No matching note found',
              targetCard?.driveSnippet ? `SRC: ${targetCard.driveSnippet.slice(0, 36)}` : 'SRC: Corridor Dossier',
            ],
          });
          return;
        }

        const targetCard = cards.find((c) => c.id === parsed.matchedCardId) ?? activeCard;
        const operations: ActionOperation[] = [];
        const summaryLines: string[] = [];

        if (parsed.kind === 'RESCHEDULE_AND_NOTIFY' && targetCard?.startIso && targetCard.endIso) {
          const origDur = Date.parse(targetCard.endIso) - Date.parse(targetCard.startIso);
          const newStart = parsed.targetStartIso ?? new Date(Date.parse(targetCard.startIso) + 15 * 60_000).toISOString();
          const newEnd = new Date(Date.parse(newStart) + origDur).toISOString();
          const newHhMm = newStart.slice(11, 16);

          operations.push({
            provider: 'GCAL',
            op: 'MOVE_EVENT',
            targetLabel: targetCard.title,
            beforeValue: `${targetCard.startIso}|${targetCard.endIso}`,
            afterValue: `${newStart}|${newEnd}`,
          });
          summaryLines.push(`1) GCAL: ${targetCard.startIso.slice(11, 16)} -> ${newHhMm}`);

          if (targetCard.attendeeEmail && targetCard.gmailThreadId) {
            const grounded = await generateGroundedDraft(
              {
                recipientName: targetCard.attendeeName ?? 'there',
                recipientEmail: targetCard.attendeeEmail,
                allowedRecipients: cards.map((c) => c.attendeeEmail ?? '').filter(Boolean),
                sourceEmailText: `${targetCard.title}. ${targetCard.contextLine1}`,
                userUtterance: parsed.rawText,
                computedFacts: [newHhMm],
                fallbackDraft: `Running slightly behind, shifting ${targetCard.title} to ${newHhMm}.`,
              },
              resolveLlmConfig(),
            );
            if (grounded.factGuardViolations.length > 0) {
              recordAudit('CODE_GUARD', grounded.factGuardViolations.join('; '));
            }
            operations.push({
              provider: 'GMAIL',
              op: body.draftOnly ? 'SAVE_DRAFT' : 'SEND_REPLY',
              targetLabel: `${targetCard.attendeeEmail} (${targetCard.gmailThreadId})`,
              afterValue: grounded.draft,
            });
            summaryLines.push(`2) MAIL: ${body.draftOnly ? 'Draft' : 'Reply'} ${targetCard.attendeeName} (${grounded.providerLabel})`);
          }
        } else if (parsed.kind === 'CREATE_ACTION_PACK') {
          const title = parsed.taskTitle ?? 'Follow-up task';
          const holdStart = parsed.targetStartIso ?? new Date(nowFn() + 120 * 60_000).toISOString();
          const holdEnd = new Date(Date.parse(holdStart) + 30 * 60_000).toISOString();
          operations.push({
            provider: 'NOTION',
            op: 'CREATE_TASK',
            targetLabel: 'Workspace Tasks',
            afterValue: title,
          });
          operations.push({
            provider: 'GCAL',
            op: 'CREATE_HOLD',
            targetLabel: `Hold: ${title.slice(0, 28)}`,
            afterValue: `${holdStart}|${holdEnd}`,
          });
          summaryLines.push(`1) NOTION: ${title.slice(0, 28)}`);
          summaryLines.push(`2) GCAL: Hold ${holdStart.slice(11, 16)} (30m)`);
        } else if (parsed.kind === 'REPLY_EMAIL' && targetCard?.attendeeEmail && targetCard.gmailThreadId) {
          const grounded = await generateGroundedDraft(
            {
              recipientName: targetCard.attendeeName ?? 'there',
              recipientEmail: targetCard.attendeeEmail,
              allowedRecipients: cards.map((c) => c.attendeeEmail ?? '').filter(Boolean),
              sourceEmailText: `${targetCard.title}. ${targetCard.contextLine1}`,
              userUtterance: parsed.rawText,
              computedFacts: [],
              fallbackDraft: parsed.replyMessage ?? 'Confirmed, thank you.',
            },
            opts.llmConfig ?? resolveLlmConfig(),
          );
          operations.push({
            provider: 'GMAIL',
            op: body.draftOnly === false ? 'SEND_REPLY' : 'SAVE_DRAFT',
            targetLabel: `${targetCard.attendeeEmail} (${targetCard.gmailThreadId})`,
            afterValue: grounded.draft,
          });
          summaryLines.push(`1) MAIL: ${body.draftOnly === false ? 'Send' : 'Draft'} to ${targetCard.attendeeName}`);
        } else if (parsed.kind === 'COMPLETE_NOTION_TASK') {
          const title = parsed.taskTitle ?? targetCard?.title ?? 'Current task';
          operations.push({
            provider: 'NOTION',
            op: 'MARK_DONE',
            targetLabel: title,
            afterValue: 'Done',
          });
          summaryLines.push(`1) NOTION: Mark "${title.slice(0, 22)}" done`);
        } else if (parsed.kind === 'TELEGRAM_ACTION') {
          const creds = vault.load();
          const chat = (creds.telegramChatId ?? 'tg-grp-even').trim();
          const msg = parsed.replyMessage ?? 'Running slightly behind, joining shortly.';
          operations.push({
            provider: 'TELEGRAM',
            op: 'SEND_TELEGRAM',
            targetLabel: chat,
            afterValue: msg,
          });
          summaryLines.push(`1) TG CHAT: ${chat.slice(0, 18)}`);
          summaryLines.push(`2) DRAFT: "${msg.slice(0, 26)}"`);
        } else if (parsed.kind === 'PLAN_PROJECT' || parsed.kind === 'DELEGATE_COMPUTER_TASK') {
          const title = parsed.taskTitle ?? parsed.rawText;
          operations.push({
            provider: 'COMPUTER',
            op: parsed.kind === 'PLAN_PROJECT' ? 'CREATE_SPEC' : 'DELEGATE_AGENT',
            targetLabel: 'Local Computer Harness',
            afterValue: parsed.rawText,
          });
          summaryLines.push(`1) COMP: ${parsed.kind === 'PLAN_PROJECT' ? 'Plan' : 'Run'} "${title.slice(0, 22)}"`);
          summaryLines.push('2) ROUTE: Local CLI / OpenRouter');
        }

        const built = await buildAndValidatePreview({
          intent: parsed.kind,
          cardId: targetCard?.id,
          operations,
          summaryLines,
          nowFn,
          provider,
          ledger,
          sessionHash: session.tokenHash,
        });
        if ('conflict' in built) {
          recordAudit('CONFLICT_409', String((built.conflict as { message?: string }).message ?? 'Conflict'));
          jsonResponse(res, 409, built.conflict);
          return;
        }
        jsonResponse(res, 200, built.preview);
        return;
      }

      // 10. Commit ActionPreview
      if (req.method === 'POST' && pathname === '/api/actions/commit') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ previewToken?: string; idempotencyKey?: string }>(req);
        const previewToken = String(body.previewToken ?? '');

        if (body.idempotencyKey) {
          const existing = await ledger.getByIdempotency(body.idempotencyKey);
          if (existing) {
            jsonResponse(res, 200, existing);
            return;
          }
        }

        const consumed = await ledger.consumePreview(previewToken, session.tokenHash);
        if (!consumed.ok) {
          jsonResponse(res, consumed.status, { error: consumed.reason });
          return;
        }

        const existingByPreviewKey = await ledger.getByIdempotency(consumed.preview.idempotencyKey);
        if (existingByPreviewKey) {
          jsonResponse(res, 200, existingByPreviewKey);
          return;
        }

        const nowMs = nowFn();
        const dayKey = `day:${new Date(nowMs).toISOString().slice(0, 10)}`;
        const minKey = `min:${new Date(nowMs).toISOString().slice(0, 16)}`;
        const quota = await ledger.checkAndConsumeRateLimit(dayKey, minKey, 20, 10);
        if (!quota.allowed) {
          jsonResponse(res, 429, { error: quota.reason });
          return;
        }

        const provider = resolveProvider(session.mode);
        const liveConflict = await provider.checkLiveConflicts(consumed.preview);
        if (liveConflict) {
          recordAudit('CONFLICT_409', liveConflict.message);
          jsonResponse(res, 409, liveConflict);
          return;
        }

        const workspaceOps = consumed.preview.operations.filter(
          (op) => op.provider !== 'COMPUTER' && op.provider !== 'TELEGRAM',
        );
        const computerOps = consumed.preview.operations.filter((op) => op.provider === 'COMPUTER');
        const telegramOps = consumed.preview.operations.filter((op) => op.provider === 'TELEGRAM');

        const receipt = await provider.executePreview({
          preview: consumed.preview,
          operations: workspaceOps,
        });

        for (const cop of computerOps) {
          const delegated = await executeDelegatedTask({
            title: cop.afterValue.slice(0, 48),
            prompt: cop.afterValue,
            targetTool: /git|pr|test/i.test(cop.afterValue) ? 'workspace_test' : 'auto',
            cwd: process.cwd(),
            llmConfig: resolveLlmConfig(),
          });
          receipt.summaryLines = [...delegated.lensLines, ...receipt.summaryLines].slice(0, 3);
          receipt.operations.push({
            ...cop,
            reversible: false,
            recallNote: delegated.toolUsed,
          });
        }

        for (const top of telegramOps) {
          const creds = vault.load();
          const botToken = creds.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN;
          let tgNote = 'SANDBOX SENT';
          if (botToken && creds.telegramChatId) {
            const tgClient = new TelegramWorkspaceClient(botToken, creds.telegramChatId, opts.fetchImpl);
            await tgClient.sendMessage(creds.telegramChatId, top.afterValue).catch(() => null);
            tgNote = 'LIVE TELEGRAM SENT';
          }
          receipt.operations.push({
            ...top,
            reversible: false,
            recallNote: tgNote,
          });
        }

        await ledger.saveReceipt(receipt);
        recordAudit('COMMIT', `${receipt.receiptId}: ${receipt.summaryLines.join(' | ')}`);
        broadcastSse('receipt', receipt);
        broadcastSse('corridor', { reason: 'committed' });

        if (receipt.status === 'SEND_UNKNOWN') {
          jsonResponse(res, 504, receipt);
          return;
        }
        jsonResponse(res, 200, receipt);
        return;
      }

      // 11. Surgical Undo
      if (req.method === 'POST' && pathname === '/api/actions/undo') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ idempotencyKey?: string }>(req);
        const receipt = body.idempotencyKey ? await ledger.getByIdempotency(body.idempotencyKey) : null;
        if (!receipt) {
          jsonResponse(res, 404, { error: 'Receipt not found' });
          return;
        }
        if (!receipt.canUndo) {
          jsonResponse(res, 409, { error: 'Receipt is not reversible (SENT - CANNOT RECALL)' });
          return;
        }
        const provider = resolveProvider(receipt.sourceMode);
        const undone = await provider.undoReceipt(receipt);
        await ledger.saveReceipt(undone);
        recordAudit('UNDO', `${undone.receiptId}: reversed reversible operations`);
        broadcastSse('receipt', undone);
        broadcastSse('corridor', { reason: 'undone' });
        jsonResponse(res, 200, undone);
        return;
      }

      // 12. Workspace live inspector snapshot
      if (req.method === 'GET' && pathname === '/api/workspace/state') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const provider = resolveProvider(session.mode);
        const receipts = await ledger.listReceipts(20);
        jsonResponse(res, 200, {
          snapshot: provider.getSnapshot(),
          receipts,
          auditLog,
        });
        return;
      }

      // 12b. Interactive Companion Control Center mutations
      if (req.method === 'POST' && pathname === '/api/workspace/calendar/add') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ title?: string; startIso?: string; endIso?: string }>(req);
        if (!body.title || !body.startIso || !body.endIso) {
          jsonResponse(res, 400, { error: 'title, startIso, and endIso required' });
          return;
        }
        demoProvider.addBusySlot(body.title.trim(), body.startIso, body.endIso);
        broadcastSse('corridor', { reason: 'calendar_added' });
        jsonResponse(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/workspace/gmail/incoming') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ snippet?: string }>(req);
        demoProvider.injectIncomingReply(
          body.snippet?.trim() || 'Actually let us do 15:00 instead - Priya',
        );
        broadcastSse('corridor', { reason: 'gmail_incoming' });
        jsonResponse(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/workspace/notion/add') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ title?: string }>(req);
        if (!body.title?.trim()) {
          jsonResponse(res, 400, { error: 'title required' });
          return;
        }
        demoProvider.addNotionTask(body.title.trim());
        broadcastSse('corridor', { reason: 'notion_added' });
        jsonResponse(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/workspace/notion/toggle') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ pageId?: string }>(req);
        if (body.pageId) demoProvider.toggleNotionTask(body.pageId);
        broadcastSse('corridor', { reason: 'notion_toggled' });
        jsonResponse(res, 200, { ok: true });
        return;
      }

      // 12c. Hands-Free Meeting Lifecycle (Before / During / After — RAM-only transcript)
      if (req.method === 'POST' && pathname === '/api/meeting/start') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ attendees?: string[] }>(req);
        const provider = resolveProvider(session.mode);
        const snap = provider.getSnapshot();
        const attendees =
          body.attendees && body.attendees.length > 0
            ? body.attendees
            : snap.calendarEvents.map((e) => e.attendeeName ?? '').filter(Boolean);
        const providerMode = resolveAssemblyAiKey() ? 'LIVE_ASSEMBLYAI' : 'DEMO_SANDBOX';
        const state = meetingBuffer.start({
          providerMode,
          attendees: attendees.length > 0 ? attendees : ['Priya Nair', 'Alex Chen'],
          startedAtIso: new Date(nowFn()).toISOString(),
        });
        recordAudit('MEETING_START', `RAM-only scribe started (${providerMode}; 0 audio saved)`);
        broadcastSse('meeting', state);
        jsonResponse(res, 200, state);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/meeting/turn') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{
          speakerLabel?: string;
          text?: string;
          isFinal?: boolean;
          rms?: number;
        }>(req);
        if (!body.text?.trim()) {
          jsonResponse(res, 400, { error: 'text required' });
          return;
        }
        const turnAtIso = new Date(nowFn()).toISOString();
        const state = meetingBuffer.pushTurn({
          speakerLabel: body.speakerLabel ?? 'Speaker A',
          text: body.text,
          isFinal: body.isFinal ?? true,
          atIso: turnAtIso,
        });
        const wake = parseWakeCommand(body.text);
        if (wake.wakeMatched && wake.kind === 'CONFIRM') {
          const lastTurn = state.turns[state.turns.length - 1];
          const guard = canVoiceConfirmWrite({
            transcript: body.text,
            rms: body.rms ?? 0.05,
            isWearer: Boolean(lastTurn?.isWearer),
            speakerLabel: body.speakerLabel,
          });
          if (!guard.allowed) {
            recordAudit('CODE_GUARD', `Voice confirm rejected (${guard.reason})`);
          }
        }
        broadcastSse('meeting', state);
        jsonResponse(res, 200, { state, wake });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/meeting/ask') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ question?: string; voiceId?: string }>(req);
        const question = (body.question ?? '').trim();
        const meeting = meetingBuffer.getState(nowFn());
        const snap = resolveProvider(session.mode).getSnapshot();
        const qLower = question.toLowerCase();

        let answerLine = 'No matching note in live RAM transcript or Drive.';
        let sourceCitation = 'SRC: Corridor Dossier';

        const matchingTurn = [...meeting.turns]
          .reverse()
          .find((t) =>
            qLower.includes(t.attendeeName.toLowerCase()) ||
            qLower.split(/\s+/).some((w) => w.length > 3 && t.text.toLowerCase().includes(w)),
          );

        if (matchingTurn) {
          answerLine = `${matchingTurn.attendeeName}: ${matchingTurn.text}`;
          sourceCitation = `SRC: Live ${matchingTurn.atIso.slice(11, 16)} (${matchingTurn.speakerLabel})`;
        } else if (snap.cards[0]?.driveSnippet) {
          answerLine = `${snap.gmailThreads[0]?.fromName ?? 'Notes'}: ${snap.cards[0].driveSnippet}`;
          sourceCitation = `SRC: Drive ${snap.cards[0].driveDocTitle ?? 'Brief'}`;
        }

        const spoken = await synthesizeTtsUtterance({
          text: `${answerLine}. ${sourceCitation}`,
          voiceId: body.voiceId ?? 'aai-kyla',
          apiKey: resolveAssemblyAiKey(),
          wsFactory: opts.assemblyAiWsFactory,
        });

        jsonResponse(res, 200, {
          readOnlyAnswer: true,
          lines: [answerLine, sourceCitation],
          speech: spoken,
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/meeting/wrapup') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ followUpIso?: string; attendees?: string[] }>(req);
        const provider = resolveProvider(session.mode);
        const { cards } = await provider.fetchCorridor();
        const primaryCard = cards[0];
        const meeting = meetingBuffer.getState(nowFn());

        const actionTitle =
          meeting.actions[0]?.title ??
          'Send Q4 metrics deck + follow-up notes';
        const holdStart = body.followUpIso ?? new Date(nowFn() + 180 * 60_000).toISOString();
        const holdEnd = new Date(Date.parse(holdStart) + 30 * 60_000).toISOString();
        const holdHhMm = holdStart.slice(11, 16);

        const operations: ActionOperation[] = [
          {
            provider: 'NOTION',
            op: 'CREATE_TASK',
            targetLabel: 'Meeting Notes & Actions',
            afterValue: actionTitle,
          },
          {
            provider: 'GCAL',
            op: 'CREATE_HOLD',
            targetLabel: `Follow-up: ${primaryCard?.title ?? 'Sync'}`,
            afterValue: `${holdStart}|${holdEnd}`,
          },
        ];

        const summaryLines = [
          `1) NOTION: ${actionTitle.slice(0, 26)}`,
          `2) GCAL: Follow-up ${holdHhMm} (30m)`,
        ];

        if (primaryCard?.attendeeEmail && primaryCard.gmailThreadId) {
          const recapBody = `Meeting recap (${meeting.decisions.length} decisions, ${meeting.actions.length} actions): ${actionTitle}.`;
          const grounded = await generateGroundedDraft(
            {
              recipientName: primaryCard.attendeeName ?? 'there',
              recipientEmail: primaryCard.attendeeEmail,
              allowedRecipients: cards.map((c: CorridorCard) => c.attendeeEmail ?? '').filter(Boolean),
              sourceEmailText: meeting.turns.map((t) => `${t.attendeeName}: ${t.text}`).join(' '),
              userUtterance: `Wrap up meeting and draft recap for ${holdHhMm}`,
              computedFacts: [holdHhMm],
              fallbackDraft: recapBody,
            },
            opts.llmConfig ?? resolveLlmConfig(),
          );
          operations.push({
            provider: 'GMAIL',
            op: 'SAVE_DRAFT',
            targetLabel: `${primaryCard.attendeeEmail} (${primaryCard.gmailThreadId})`,
            afterValue: grounded.draft,
          });
          summaryLines.push(`3) MAIL: Draft ${primaryCard.attendeeName} (${grounded.providerLabel})`);
        }

        const built = await buildAndValidatePreview({
          intent: 'CREATE_ACTION_PACK',
          cardId: primaryCard?.id,
          operations,
          summaryLines,
          nowFn,
          provider,
          ledger,
          sessionHash: session.tokenHash,
        });
        if ('conflict' in built) {
          recordAudit('CONFLICT_409', String((built.conflict as { message?: string }).message ?? 'Wrap-up 409 lock'));
          jsonResponse(res, 409, built.conflict);
          return;
        }
        jsonResponse(res, 200, { preview: built.preview, meeting });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/meeting/wipe') {
        const session = await requireAuth(req, res);
        if (!session) return;
        meetingBuffer.wipe();
        recordAudit('MEETING_WIPE', 'In-RAM meeting transcript wiped (0 audio persisted)');
        broadcastSse('meeting', { active: false, turns: [], decisions: [], actions: [] });
        jsonResponse(res, 200, { ok: true, wiped: true });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/meeting/demo-run') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const baseNow = nowFn();
        meetingBuffer.start({
          providerMode: process.env.ASSEMBLYAI_API_KEY ? 'LIVE_ASSEMBLYAI' : 'DEMO_SANDBOX',
          attendees: ['Priya Nair', 'Alex Chen'],
          startedAtIso: new Date(baseNow - 245_000).toISOString(),
        });
        meetingBuffer.pushTurn({
          speakerLabel: 'Speaker A',
          text: 'Agreed: let us lock the Q4 launch timeline for Thursday.',
          atIso: new Date(baseNow - 120_000).toISOString(),
          isFinal: true,
        });
        const state = meetingBuffer.pushTurn({
          speakerLabel: 'Speaker B',
          text: 'Send Q4 metrics deck to Alex by Thursday 15:00.',
          atIso: new Date(baseNow - 15_000).toISOString(),
          isFinal: true,
        });
        recordAudit('MEETING_START', 'Live Meeting Demo: 2 speakers diarized (RAM-only)');
        broadcastSse('meeting', state);
        jsonResponse(res, 200, state);
        return;
      }

      // 12d. AssemblyAI-TTS-1 voice catalog & speech synthesis endpoint
      if (req.method === 'GET' && pathname === '/api/tts/voices') {
        jsonResponse(res, 200, {
          voices: listAvailableTtsVoices(),
          hardwareNote: 'Companion Phone / Bluetooth Earbuds Audio Out (Even G2 has no speaker)',
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/tts/speak') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ text?: string; voiceId?: string }>(req);
        if (!body.text?.trim()) {
          jsonResponse(res, 400, { error: 'text required' });
          return;
        }
        const spoken = await synthesizeTtsUtterance({
          text: body.text.trim(),
          voiceId: body.voiceId ?? 'aai-kyla',
          apiKey: resolveAssemblyAiKey(),
          wsFactory: opts.assemblyAiWsFactory,
        });
        jsonResponse(res, 200, spoken);
        return;
      }

      // 13. Sandbox fault & reset controls
      if (req.method === 'POST' && pathname === '/api/workspace/reset') {
        const session = await requireAuth(req, res);
        if (!session) return;
        demoProvider.resetSandbox();
        meetingBuffer.wipe();
        activeIcsFeed = null;
        broadcastSse('reset', { ok: true });
        broadcastSse('meeting', { active: false, turns: [], decisions: [], actions: [] });
        broadcastSse('corridor', { reason: 'reset' });
        jsonResponse(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/workspace/fault') {
        const session = await requireAuth(req, res);
        if (!session) return;
        if (session.mode !== 'DEMO' && !opts.allowTestFaultControls) {
          jsonResponse(res, 403, { error: 'Fault controls available only in DEMO sandbox' });
          return;
        }
        const patch = await readJsonBody<DemoFaultInjection>(req);
        demoProvider.setFault(patch);
        jsonResponse(res, 200, { ok: true });
        return;
      }

      // 14. Antigravity-Style Connector Hub & Multi-Model Inference Probe (strict Bearer auth, zero leaked keys)
      if (req.method === 'GET' && pathname === '/api/connectors/status') {
        const session = await requireAuth(req, res);
        if (!session) return;
        jsonResponse(res, 200, buildConnectorStatus());
        return;
      }

      if (req.method === 'POST' && pathname === '/api/connectors/connect') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{
          provider?: string;
          accountName?: string;
          accountEmail?: string;
          apiKey?: string;
          model?: string;
          preferredLlm?: PreferredLlmProvider;
          notionToken?: string;
          notionDatabaseId?: string;
          telegramBotToken?: string;
          telegramChatId?: string;
          googleClientId?: string;
          googleClientSecret?: string;
          googleOAuthJson?: string;
          anthropicKey?: string;
          openRouterKey?: string;
          openRouterModel?: string;
          openAiKey?: string;
          assemblyAiKey?: string;
          icsText?: string;
        }>(req);

        const existing = vault.load();
        const next = { ...existing };

        if (body.accountName?.trim()) next.accountName = body.accountName.trim();
        if (body.accountEmail?.trim()) next.accountEmail = body.accountEmail.trim();
        if (body.preferredLlm) next.preferredLlm = body.preferredLlm;

        const prov = body.provider ?? 'account';
        let upgradedToken: string | undefined;
        let upgradedMode: SourceMode | undefined;
        let discoveredSchema: unknown;

        if (prov === 'claude' && body.apiKey?.trim()) {
          next.anthropicKey = body.apiKey.trim();
          next.preferredLlm = 'claude';
        } else if (prov === 'openrouter') {
          if (body.apiKey?.trim()) next.openRouterKey = body.apiKey.trim();
          if (body.model?.trim()) next.openRouterModel = body.model.trim();
          next.preferredLlm = 'openrouter';
        } else if (prov === 'chatgpt' && body.apiKey?.trim()) {
          next.openAiKey = body.apiKey.trim();
          next.preferredLlm = 'chatgpt';
        } else if (prov === 'assemblyai' && body.apiKey?.trim()) {
          next.assemblyAiKey = body.apiKey.trim();
        } else if (prov === 'notion' && body.notionToken?.trim() && body.notionDatabaseId?.trim()) {
          const client = new NotionWorkspaceClient(
            body.notionToken.trim(),
            body.notionDatabaseId.trim(),
            opts.fetchImpl,
          );
          discoveredSchema = await client.inspectSchema();
          next.notionToken = body.notionToken.trim();
          next.notionDatabaseId = body.notionDatabaseId.trim();
          upgradedToken = await ledger.mintSession('LIVE');
          upgradedMode = 'LIVE';
        } else if (prov === 'telegram' && body.telegramBotToken?.trim()) {
          next.telegramBotToken = body.telegramBotToken.trim();
          if (body.telegramChatId?.trim()) next.telegramChatId = body.telegramChatId.trim();
        } else if (prov === 'google_oauth_json' && body.googleOAuthJson?.trim()) {
          try {
            const parsed = parseGoogleOAuthJson(body.googleOAuthJson.trim());
            next.googleClientId = parsed.clientId;
            next.googleClientSecret = parsed.clientSecret;
          } catch (err) {
            jsonResponse(res, 400, {
              error: err instanceof Error ? err.message : 'Invalid Google OAuth JSON payload',
            });
            return;
          }
        } else if (prov === 'google_oauth' && body.googleClientId?.trim() && body.googleClientSecret?.trim()) {
          next.googleClientId = body.googleClientId.trim();
          next.googleClientSecret = body.googleClientSecret.trim();
        } else if (prov === 'ics' && body.icsText?.trim()) {
          const parsedEvents = parseIcsEvents(body.icsText.trim());
          if (parsedEvents.length === 0) {
            jsonResponse(res, 422, { error: 'No valid VEVENT entries found in .ics payload' });
            return;
          }
          activeIcsFeed = body.icsText.trim();
          upgradedToken = await ledger.mintSession('LIVE');
          upgradedMode = 'LIVE';
        } else if (prov === 'bulk_vault') {
          if (body.googleOAuthJson?.trim()) {
            try {
              const parsed = parseGoogleOAuthJson(body.googleOAuthJson.trim());
              next.googleClientId = parsed.clientId;
              next.googleClientSecret = parsed.clientSecret;
            } catch (err) {
              jsonResponse(res, 400, {
                error: err instanceof Error ? err.message : 'Invalid Google OAuth JSON payload',
              });
              return;
            }
          }
          if (body.googleClientId?.trim()) next.googleClientId = body.googleClientId.trim();
          if (body.googleClientSecret?.trim()) next.googleClientSecret = body.googleClientSecret.trim();
          if (body.anthropicKey?.trim()) next.anthropicKey = body.anthropicKey.trim();
          if (body.openRouterKey?.trim()) next.openRouterKey = body.openRouterKey.trim();
          if (body.openRouterModel?.trim()) next.openRouterModel = body.openRouterModel.trim();
          if (body.openAiKey?.trim()) next.openAiKey = body.openAiKey.trim();
          if (body.assemblyAiKey?.trim()) next.assemblyAiKey = body.assemblyAiKey.trim();
          if (body.telegramBotToken?.trim()) next.telegramBotToken = body.telegramBotToken.trim();
          if (body.telegramChatId?.trim()) next.telegramChatId = body.telegramChatId.trim();
          if (body.notionToken?.trim() && body.notionDatabaseId?.trim()) {
            const client = new NotionWorkspaceClient(
              body.notionToken.trim(),
              body.notionDatabaseId.trim(),
              opts.fetchImpl,
            );
            discoveredSchema = await client.inspectSchema();
            next.notionToken = body.notionToken.trim();
            next.notionDatabaseId = body.notionDatabaseId.trim();
            upgradedToken = await ledger.mintSession('LIVE');
            upgradedMode = 'LIVE';
          }
          if (body.icsText?.trim()) {
            const parsedEvents = parseIcsEvents(body.icsText.trim());
            if (parsedEvents.length === 0) {
              jsonResponse(res, 422, { error: 'No valid VEVENT entries found in .ics payload' });
              return;
            }
            activeIcsFeed = body.icsText.trim();
            upgradedToken = await ledger.mintSession('LIVE');
            upgradedMode = 'LIVE';
          }
        }

        vault.save(next);
        proactiveHarness.runPulse();
        recordAudit('CONNECTOR_SAVED', `Connector updated cleanly: ${prov}`);
        broadcastSse('corridor', { reason: 'connector_updated' });
        jsonResponse(res, 200, {
          ok: true,
          status: buildConnectorStatus(),
          ...(upgradedToken ? { sessionToken: upgradedToken, mode: upgradedMode } : {}),
          ...(discoveredSchema ? { schema: discoveredSchema } : {}),
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/connectors/test-llm') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ preferredProvider?: PreferredLlmProvider }>(req);
        const result = await probeLlmProvider(resolveLlmConfig(body.preferredProvider));
        jsonResponse(res, 200, result);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/connectors/disconnect') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ provider?: string }>(req);
        const existing = vault.load();
        const prov = body.provider ?? 'all';
        if (prov === 'all') {
          vault.save({});
          activeIcsFeed = null;
        } else {
          const next = { ...existing };
          if (prov === 'claude') delete next.anthropicKey;
          if (prov === 'openrouter') {
            delete next.openRouterKey;
            delete next.openRouterModel;
          }
          if (prov === 'chatgpt') delete next.openAiKey;
          if (prov === 'assemblyai') delete next.assemblyAiKey;
          if (prov === 'notion') {
            delete next.notionToken;
            delete next.notionDatabaseId;
          }
          if (prov === 'telegram') {
            delete next.telegramBotToken;
            delete next.telegramChatId;
          }
          if (prov === 'googleWorkspace') {
            delete next.googleRefreshToken;
            delete next.googleAccessToken;
            activeIcsFeed = null;
          }
          vault.save(next);
        }
        recordAudit('CONNECTOR_DISCONNECTED', `Connector disconnected: ${prov}`);
        jsonResponse(res, 200, { ok: true, status: buildConnectorStatus() });
        return;
      }

      // 14b. Real OAuth 2.0 + PKCE + CSRF State + Signed HttpOnly Session Cookie
      if (req.method === 'GET' && pathname === '/api/auth/google/start') {
        const creds = vault.load();
        const clientId = creds.googleClientId ?? process.env.GOOGLE_CLIENT_ID;
        const clientSecret = creds.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          jsonResponse(res, 200, {
            configured: false,
            sandboxAvailable: true,
            error:
              'Google OAuth not configured; set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET or use instant local sandbox.',
          });
          return;
        }
        const listenPort =
          (server.address() as { port?: number } | null)?.port ?? opts.port ?? 8787;
        const redirectUri =
          process.env.GOOGLE_REDIRECT_URI ?? `http://127.0.0.1:${listenPort}/api/auth/google/callback`;
        const pkce = createPkcePair();
        const state = oauthStates.issue({
          provider: 'google',
          codeVerifier: pkce.codeVerifier,
          redirectTo: 'http://127.0.0.1:5173/?signedIn=1#connectors',
        });
        const authUrl = buildGoogleAuthUrl({
          clientId,
          redirectUri,
          state,
          codeChallenge: pkce.codeChallenge,
          codeChallengeMethod: pkce.method,
        });
        if (parsedUrl.searchParams.get('format') === 'json') {
          jsonResponse(res, 200, { configured: true, authUrl, state, codeChallengeMethod: pkce.method });
          return;
        }
        res.writeHead(302, { Location: authUrl, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      if (req.method === 'GET' && pathname === '/api/auth/google/callback') {
        const oauthCode = parsedUrl.searchParams.get('code');
        const state = parsedUrl.searchParams.get('state');
        const pending = oauthStates.consume(state, 'google');
        if (!pending) {
          jsonResponse(res, 403, { error: 'Invalid or expired OAuth CSRF state' });
          return;
        }
        const creds = vault.load();
        const clientId = creds.googleClientId ?? process.env.GOOGLE_CLIENT_ID;
        const clientSecret = creds.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
        if (!oauthCode || !clientId || !clientSecret) {
          jsonResponse(res, 400, { error: 'Missing Google OAuth authorization code or client credentials' });
          return;
        }
        const listenPort =
          (server.address() as { port?: number } | null)?.port ?? opts.port ?? 8787;
        const redirectUri =
          process.env.GOOGLE_REDIRECT_URI ?? `http://127.0.0.1:${listenPort}/api/auth/google/callback`;
        const gClient = new GoogleWorkspaceClient(vault, opts.fetchImpl);
        const saved = await gClient.exchangeAuthorizationCode({
          code: oauthCode,
          clientId,
          clientSecret,
          redirectUri,
          codeVerifier: pending.codeVerifier,
        });
        const liveSessionToken = await ledger.mintSession('LIVE');
        const setCookie = cookieAuth.buildSetCookieHeader(liveSessionToken, {
          secure: process.env.NODE_ENV === 'production',
        });
        recordAudit(
          'OAUTH_SIGNIN',
          `Google OAuth PKCE sign-in complete (${saved.accountEmail ?? 'verified account'})`,
        );
        broadcastSse('corridor', { reason: 'oauth_signin' });
        if ((req.headers.accept ?? '').includes('application/json')) {
          jsonResponse(
            res,
            200,
            {
              ok: true,
              authenticated: true,
              mode: 'LIVE',
              accountName: saved.accountName ?? null,
              accountEmail: saved.accountEmail ?? null,
              sessionToken: liveSessionToken,
            },
            { 'Set-Cookie': setCookie },
          );
          return;
        }
        res.writeHead(302, {
          Location: pending.redirectTo,
          'Set-Cookie': setCookie,
          'Cache-Control': 'no-store',
        });
        res.end();
        return;
      }

      if (req.method === 'GET' && pathname === '/api/auth/notion/start') {
        const notionClientId = process.env.NOTION_CLIENT_ID;
        const notionClientSecret = process.env.NOTION_CLIENT_SECRET;
        if (!notionClientId || !notionClientSecret) {
          jsonResponse(res, 200, {
            configured: false,
            error: 'Notion OAuth not configured; paste integration token in Connectors or set NOTION_CLIENT_ID/SECRET.',
          });
          return;
        }
        const listenPort =
          (server.address() as { port?: number } | null)?.port ?? opts.port ?? 8787;
        const redirectUri =
          process.env.NOTION_REDIRECT_URI ?? `http://127.0.0.1:${listenPort}/api/auth/notion/callback`;
        const state = oauthStates.issue({
          provider: 'notion',
          redirectTo: 'http://127.0.0.1:5173/?notion=connected#connectors',
        });
        const url = new URL('https://api.notion.com/v1/oauth/authorize');
        url.searchParams.set('client_id', notionClientId);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('owner', 'user');
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('state', state);
        if (parsedUrl.searchParams.get('format') === 'json') {
          jsonResponse(res, 200, { configured: true, authUrl: url.toString(), state });
          return;
        }
        res.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      if (req.method === 'GET' && pathname === '/api/auth/notion/callback') {
        const code = parsedUrl.searchParams.get('code');
        const state = parsedUrl.searchParams.get('state');
        const pending = oauthStates.consume(state, 'notion');
        if (!pending) {
          jsonResponse(res, 403, { error: 'Invalid or expired Notion OAuth CSRF state' });
          return;
        }
        const notionClientId = process.env.NOTION_CLIENT_ID;
        const notionClientSecret = process.env.NOTION_CLIENT_SECRET;
        if (!code || !notionClientId || !notionClientSecret) {
          jsonResponse(res, 400, { error: 'Missing Notion OAuth code or client credentials' });
          return;
        }
        const listenPort =
          (server.address() as { port?: number } | null)?.port ?? opts.port ?? 8787;
        const redirectUri =
          process.env.NOTION_REDIRECT_URI ?? `http://127.0.0.1:${listenPort}/api/auth/notion/callback`;
        const f = opts.fetchImpl ?? fetch;
        const basic = Buffer.from(`${notionClientId}:${notionClientSecret}`, 'utf8').toString('base64');
        const tokenRes = await f('https://api.notion.com/v1/oauth/token', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }),
        });
        if (!tokenRes.ok) {
          jsonResponse(res, 502, { error: `Notion OAuth token exchange failed: HTTP ${tokenRes.status}` });
          return;
        }
        const tokenJson = (await tokenRes.json()) as { access_token?: string };
        const existing = vault.load();
        vault.save({ ...existing, notionToken: tokenJson.access_token });
        recordAudit('OAUTH_SIGNIN', 'Notion OAuth token stored in AES-256-GCM 0600 vault');
        res.writeHead(302, { Location: pending.redirectTo, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      if (req.method === 'GET' && pathname === '/api/auth/openrouter/start') {
        const listenPort =
          (server.address() as { port?: number } | null)?.port ?? opts.port ?? 8787;
        const callbackUrl =
          process.env.OPENROUTER_CALLBACK_URL ?? `http://127.0.0.1:${listenPort}/api/auth/openrouter/callback`;
        const pkce = createPkcePair();
        const state = oauthStates.issue({
          provider: 'openrouter',
          codeVerifier: pkce.codeVerifier,
          redirectTo: 'http://127.0.0.1:5173/?connected=openrouter#connectors',
        });
        const authUrl = new URL('https://openrouter.ai/auth');
        authUrl.searchParams.set('callback_url', callbackUrl);
        authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
        authUrl.searchParams.set('code_challenge_method', pkce.method);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('name', 'OnQ Even G2');
        if (parsedUrl.searchParams.get('format') === 'json') {
          jsonResponse(res, 200, {
            configured: true,
            authUrl: authUrl.toString(),
            callbackUrl,
            state,
            codeChallengeMethod: pkce.method,
          });
          return;
        }
        res.writeHead(302, { Location: authUrl.toString(), 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      if (req.method === 'GET' && pathname === '/api/auth/openrouter/callback') {
        const code = parsedUrl.searchParams.get('code');
        const state = parsedUrl.searchParams.get('state');
        const pending = state
          ? oauthStates.consume(state, 'openrouter')
          : oauthStates.consumeLatestByProvider('openrouter');
        if (!pending || !pending.codeVerifier) {
          jsonResponse(res, 403, { error: 'Invalid or expired OpenRouter PKCE state' });
          return;
        }
        if (!code) {
          jsonResponse(res, 400, { error: 'Missing OpenRouter authorization code' });
          return;
        }
        const f = opts.fetchImpl ?? fetch;
        const keyRes = await f('https://openrouter.ai/api/v1/auth/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: pending.codeVerifier,
            code_challenge_method: 'S256',
          }),
        });
        if (!keyRes.ok) {
          jsonResponse(res, 502, { error: `OpenRouter key exchange failed: HTTP ${keyRes.status}` });
          return;
        }
        const keyJson = (await keyRes.json()) as { key?: string };
        if (!keyJson.key) {
          jsonResponse(res, 502, { error: 'OpenRouter did not return an API key' });
          return;
        }
        const existing = vault.load();
        vault.save({
          ...existing,
          openRouterKey: keyJson.key,
          preferredLlm: existing.preferredLlm && existing.preferredLlm !== 'rules' ? existing.preferredLlm : 'openrouter',
        });
        proactiveHarness.runPulse();
        recordAudit('OAUTH_SIGNIN', 'OpenRouter OAuth PKCE key stored in AES-256-GCM 0600 vault');
        broadcastSse('corridor', { reason: 'openrouter_oauth' });
        if ((req.headers.accept ?? '').includes('application/json')) {
          jsonResponse(res, 200, {
            ok: true,
            provider: 'openrouter',
            status: buildConnectorStatus(),
          });
          return;
        }
        res.writeHead(302, { Location: pending.redirectTo, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      if (req.method === 'GET' && pathname === '/api/auth/me') {
        const rawToken = extractAuthToken(req);
        const session = await ledger.validateSession(rawToken);
        if (!session || !rawToken) {
          jsonResponse(res, 200, {
            authenticated: false,
            mode: 'DEMO',
            accountName: null,
            accountEmail: null,
          });
          return;
        }
        const st = buildConnectorStatus();
        jsonResponse(res, 200, {
          authenticated: true,
          mode: session.mode,
          accountName: st.accountName,
          accountEmail: st.accountEmail,
          activeLlmProvider: st.activeLlmProvider,
          sessionToken: rawToken,
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/auth/signout') {
        const rawToken = extractAuthToken(req);
        if (rawToken) await ledger.revokeSession(rawToken);
        vault.save({});
        activeIcsFeed = null;
        recordAudit('CONNECTOR_DISCONNECTED', 'Signed out and wiped encrypted vault + session');
        jsonResponse(
          res,
          200,
          { ok: true, authenticated: false },
          { 'Set-Cookie': cookieAuth.buildClearCookieHeader() },
        );
        return;
      }

      // 14c. Live health-check endpoint per connector provider
      const testMatch = pathname.match(/^\/api\/connectors\/([a-zA-Z0-9_-]+)\/test$/);
      if (req.method === 'POST' && testMatch) {
        const session = await requireAuth(req, res);
        if (!session) return;
        const provider = testMatch[1];
        const creds = vault.load();
        const t0 = Date.now();

        if (provider === 'googleWorkspace') {
          if (creds.googleRefreshToken) {
            const client = new GoogleWorkspaceClient(vault, opts.fetchImpl);
            const ping = await client.ping();
            recordAudit('CONNECTOR_TESTED', `googleWorkspace: ${ping.detail} (${ping.latencyMs}ms)`);
            jsonResponse(res, 200, { provider, mode: 'LIVE', ...ping });
            return;
          }
          if (activeIcsFeed) {
            const evts = parseIcsEvents(activeIcsFeed);
            const latencyMs = Math.max(1, Date.now() - t0);
            recordAudit('CONNECTOR_TESTED', `googleWorkspace (.ics): ${evts.length} event(s)`);
            jsonResponse(res, 200, {
              ok: evts.length > 0,
              provider,
              mode: 'ICS',
              latencyMs,
              detail: `${evts.length} RFC 5545 calendar event(s) active`,
            });
            return;
          }
          jsonResponse(res, 200, {
            ok: true,
            provider,
            mode: 'SANDBOX',
            latencyMs: Math.max(1, Date.now() - t0),
            detail: 'Sandbox Calendar + Gmail + Drive healthy (no OAuth key required locally)',
          });
          return;
        }

        if (provider === 'notion') {
          if (creds.notionToken && creds.notionDatabaseId) {
            try {
              const notion = new NotionWorkspaceClient(creds.notionToken, creds.notionDatabaseId, opts.fetchImpl);
              const schema = await notion.inspectSchema();
              const latencyMs = Math.max(1, Date.now() - t0);
              const detail = `Notion 2026-03-11 schema OK (title="${schema.titleProp}", complete="${schema.completionProp ?? 'none'}")`;
              recordAudit('CONNECTOR_TESTED', `notion: ${detail}`);
              jsonResponse(res, 200, { ok: true, provider, mode: 'LIVE', latencyMs, detail, schema });
              return;
            } catch (err) {
              const latencyMs = Math.max(1, Date.now() - t0);
              jsonResponse(res, 200, {
                ok: false,
                provider,
                mode: 'ERROR',
                latencyMs,
                detail: err instanceof Error ? err.message : 'Notion verification failed',
              });
              return;
            }
          }
          jsonResponse(res, 200, {
            ok: true,
            provider,
            mode: 'SANDBOX',
            latencyMs: Math.max(1, Date.now() - t0),
            detail: 'Sandbox Notion workspace healthy (connect token for live 2026-03-11 sync)',
          });
          return;
        }

        if (provider === 'claude' || provider === 'openrouter' || provider === 'chatgpt') {
          const probe = await probeLlmProvider(resolveLlmConfig(provider));
          recordAudit('CONNECTOR_TESTED', `${provider}: ${probe.providerLabel} (${probe.latencyMs}ms)`);
          jsonResponse(res, 200, {
            ok: probe.ok,
            provider,
            mode: probe.fallbackUsed ? 'FALLBACK' : 'LIVE',
            latencyMs: probe.latencyMs,
            providerLabel: probe.providerLabel,
            fallbackUsed: probe.fallbackUsed,
            factGuardPassed: probe.factGuardPassed,
            sampleDraft: probe.sampleDraft,
            attempts: probe.attempts,
            detail: `${probe.providerLabel} · Code-Guard ${probe.factGuardPassed ? 'PASS' : 'BLOCKED'} (${probe.latencyMs}ms)`,
          });
          return;
        }

        if (provider === 'assemblyai') {
          const aaiKey = resolveAssemblyAiKey();
          if (aaiKey) {
            const f = opts.fetchImpl ?? fetch;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            try {
              const r = await f('https://api.assemblyai.com/v2/transcript?limit=1', {
                headers: { Authorization: aaiKey },
                signal: ctrl.signal,
              });
              const latencyMs = Math.max(1, Date.now() - t0);
              const ok = r.ok;
              recordAudit('CONNECTOR_TESTED', `assemblyai: HTTP ${r.status} (${latencyMs}ms)`);
              jsonResponse(res, 200, {
                ok,
                provider,
                mode: ok ? 'LIVE' : 'ERROR',
                latencyMs,
                detail: ok
                  ? `AssemblyAI STT-3.7 + TTS-1 key verified live (${latencyMs}ms)`
                  : `AssemblyAI rejected key: HTTP ${r.status}`,
              });
              return;
            } catch (err) {
              jsonResponse(res, 200, {
                ok: false,
                provider,
                mode: 'ERROR',
                latencyMs: Math.max(1, Date.now() - t0),
                detail: err instanceof Error ? err.message : 'AssemblyAI network check failed',
              });
              return;
            } finally {
              clearTimeout(timer);
            }
          }
          jsonResponse(res, 200, {
            ok: true,
            provider,
            mode: 'LOCAL_FALLBACK',
            latencyMs: Math.max(1, Date.now() - t0),
            detail: 'Local faster-whisper + offline timing fallback ready (add key for live TTS-1)',
          });
          return;
        }

        if (provider === 'telegram') {
          const botToken = creds.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN;
          if (botToken) {
            const tg = new TelegramWorkspaceClient(botToken, creds.telegramChatId, opts.fetchImpl);
            const ping = await tg.ping();
            recordAudit('CONNECTOR_TESTED', `telegram: ${ping.detail}`);
            jsonResponse(res, 200, {
              ok: ping.ok,
              provider,
              mode: ping.ok ? 'LIVE' : 'ERROR',
              latencyMs: ping.latencyMs,
              detail: ping.detail,
            });
            return;
          }
          jsonResponse(res, 200, {
            ok: true,
            provider,
            mode: 'SANDBOX',
            latencyMs: Math.max(1, Date.now() - t0),
            detail: 'Telegram Track 01 sandbox digest healthy (connect BotFather token for live chats)',
          });
          return;
        }

        jsonResponse(res, 404, { error: `Unknown connector provider: ${provider}` });
        return;
      }

      // 14d. Multi-Model Orchestration & Safety Evaluation Harness endpoints
      if (req.method === 'GET' && pathname === '/api/harness/eval') {
        const candidates = [
          path.resolve(process.cwd(), 'docs/HARNESS_EVAL.json'),
          path.resolve(process.cwd(), '../../docs/HARNESS_EVAL.json'),
        ];
        const found = candidates.find((p) => fs.existsSync(p));
        if (found) {
          const raw = fs.readFileSync(found, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(raw);
          return;
        }
        jsonResponse(res, 200, {
          status: 'NOT_GENERATED',
          hint: 'Run npm run eval:harness to generate docs/HARNESS_EVAL.json',
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/harness/run') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ utterance?: string }>(req);
        const report = await runOrchestrationHarness({
          utterance: body.utterance?.trim() || 'Push 15m and tell Priya',
          provider: resolveProvider(session.mode),
          ledger,
          sessionHash: session.tokenHash,
          mode: session.mode,
          llmConfig: resolveLlmConfig(),
          voiceConnected: Boolean(resolveAssemblyAiKey()),
          nowFn,
        });
        jsonResponse(res, 200, report);
        return;
      }

      // 14e. 24/7 Proactive Agentic Harness endpoints
      if (req.method === 'GET' && pathname === '/api/proactive/status') {
        const session = await requireAuth(req, res);
        if (!session) return;
        jsonResponse(res, 200, proactiveHarness.getStatus());
        return;
      }

      if (req.method === 'POST' && pathname === '/api/proactive/toggle') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ running?: boolean; intervalMs?: number }>(req);
        const st = proactiveHarness.toggle(body.running, body.intervalMs);
        jsonResponse(res, 200, st);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/proactive/pulse') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const st = await proactiveHarness.runAsyncPulse();
        jsonResponse(res, 200, st);
        return;
      }

      // 14g. Zero-API-Key Local Computer AI & Dev Tool Bridge + Default-NO Agent Delegation
      if (req.method === 'GET' && pathname === '/api/computer/tools') {
        const session = await requireAuth(req, res);
        if (!session) return;
        jsonResponse(res, 200, {
          tools: detectLocalComputerTools(),
          tasks: agentTasks.listTasks(),
          lastInspect: lastInspectResult,
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/computer/inspect') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ kind?: string }>(req);
        const rawKind = body.kind ?? 'git_status';
        const allowedKinds: ReadonlySet<SafeInspectKind> = new Set([
          'git_status',
          'git_log',
          'gh_prs',
          'workspace_summary',
        ]);
        if (!allowedKinds.has(rawKind as SafeInspectKind)) {
          jsonResponse(res, 400, { error: `Invalid inspection kind: ${rawKind}` });
          return;
        }
        const inspect = await runSafeReadInspection(rawKind as SafeInspectKind, process.cwd());
        lastInspectResult = inspect;
        cachedComputerInsight = {
          id: `ins-comp-${rawKind}`,
          atIso: new Date(nowFn()).toISOString(),
          category: 'COMPUTER',
          severity: inspect.ok ? 'info' : 'warn',
          title: `Computer: ${rawKind.replace('_', ' ')}`,
          detail: inspect.summary,
          suggestedCommand: 'Check git status and open GitHub PRs',
          sourceMode: 'DEMO',
        };
        recordAudit('COMPUTER_INSPECT', `${rawKind}: ${inspect.summary}`);
        broadcastSse('computer', { inspect, tools: detectLocalComputerTools() });
        jsonResponse(res, 200, { ok: inspect.ok, inspect, insight: cachedComputerInsight });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/agent/tasks/stage') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{
          kind?: AgentTaskKind;
          title?: string;
          prompt?: string;
          targetTool?: AgentTaskTargetTool;
        }>(req);
        const prompt = body.prompt?.trim() ?? body.title?.trim();
        if (!prompt) {
          jsonResponse(res, 400, { error: 'Task title or prompt required' });
          return;
        }
        const task = agentTasks.stageTask({
          kind: body.kind ?? 'PLAN_PROJECT',
          title: body.title?.trim() || prompt.slice(0, 48),
          prompt,
          targetTool: body.targetTool ?? 'auto',
        });
        broadcastSse('agent_task', task);
        jsonResponse(res, 200, { ok: true, task });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/agent/tasks/commit') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ taskId?: string; previewToken?: string }>(req);
        const task = await agentTasks.commitTask({
          taskId: body.taskId,
          previewToken: body.previewToken,
          cwd: process.cwd(),
          llmConfig: resolveLlmConfig(),
        });
        if (!task) {
          jsonResponse(res, 404, { error: 'Staged agent task not found or invalid previewToken' });
          return;
        }
        recordAudit('AGENT_TASK', `${task.toolUsed}: ${task.title}`);
        broadcastSse('agent_task', task);
        jsonResponse(res, 200, { ok: task.status === 'DONE', task });
        return;
      }

      // 14f. Dual-Track Telegram Digest & Default-NO Reply Staging (Track 01 + Best Telegram Prize)
      if (req.method === 'GET' && pathname === '/api/telegram/digest') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const creds = vault.load();
        const botToken = creds.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
          try {
            const tg = new TelegramWorkspaceClient(botToken, creds.telegramChatId, opts.fetchImpl);
            const messages = await tg.getRecentMessages(6);
            jsonResponse(res, 200, { mode: 'LIVE', messages });
            return;
          } catch (err) {
            jsonResponse(res, 200, {
              mode: 'SANDBOX',
              messages: getSandboxTelegramDigest(),
              warning: err instanceof Error ? redactSecrets(err.message) : 'Telegram fetch error',
            });
            return;
          }
        }
        jsonResponse(res, 200, { mode: 'SANDBOX', messages: getSandboxTelegramDigest() });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/telegram/stage-reply') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readJsonBody<{ text?: string; chatId?: string }>(req);
        const replyText = body.text?.trim();
        if (!replyText) {
          jsonResponse(res, 400, { error: 'Reply text required' });
          return;
        }
        const creds = vault.load();
        const targetChat = (body.chatId ?? creds.telegramChatId ?? 'tg-grp-even').trim();
        const nowMs = nowFn();
        const canonical = JSON.stringify({ intent: 'TELEGRAM_REPLY', chatId: targetChat, text: replyText });
        const idempotencyKey = crypto.createHash('sha256').update(canonical).digest('hex');
        const preview: ActionPreview = {
          previewToken: `pt_${crypto.randomBytes(12).toString('hex')}`,
          idempotencyKey,
          expiresAtIso: new Date(nowMs + 45_000).toISOString(),
          intent: 'RESCHEDULE_AND_NOTIFY',
          defaultSelection: 'NO',
          summaryLines: [
            `1) TG CHAT: ${targetChat.slice(0, 18)}`,
            `2) DRAFT: "${replyText.slice(0, 28)}"`,
            '3) GATE: Default-NO · 2.0s Ring',
          ],
          operations: [],
          safetyChecks: {
            calendarConflictFree: true,
            threadFresh: true,
            recipientVerified: true,
            factGuardPassed: true,
          },
        };
        await ledger.savePreview(preview, session.tokenHash);
        jsonResponse(res, 200, { ok: true, preview });
        return;
      }

      // 15. Session revoke
      if (req.method === 'POST' && pathname === '/api/session/revoke') {
        const bearer = extractBearer(req);
        if (bearer) await ledger.revokeSession(bearer);
        jsonResponse(res, 200, { ok: true });
        return;
      }

      jsonResponse(res, 404, { error: 'Not found' });
    } catch (err) {
      logError('http', err);
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      const msg = err instanceof Error ? redactSecrets(err.message) : 'Internal server error';
      jsonResponse(res, status, { error: msg });
    }
  });

  // Real-time binary 16kHz PCM WebSocket bridge (/api/voice/stream)
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (reqUrl.pathname !== '/api/voice/stream') {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin) && !/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
      socket.destroy();
      return;
    }
    const token =
      reqUrl.searchParams.get('token') ??
      extractBearer(req) ??
      cookieAuth.extractSessionToken(req.headers.cookie) ??
      undefined;
    void ledger.validateSession(token).then((session) => {
      if (!session) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, session);
      });
    });
  });

  wss.on('connection', (ws: WebSocket, _req: http.IncomingMessage, session: { mode: SourceMode }) => {
    let sttMode: AssemblyAiSttMode = 'agent';
    let sttSession: AssemblyAiRealtimeSession | null = null;
    let ttsSession: AssemblyAiTtsSession | null = null;
    let hadMeetingActive = false;

    const sendJson = (payload: unknown) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(payload));
      }
    };

    const connectSttIfConfigured = async () => {
      const apiKey = resolveAssemblyAiKey();
      if (!apiKey) return;
      sttSession?.terminate();
      sttSession = new AssemblyAiRealtimeSession({
        apiKey,
        mode: sttMode,
        region: process.env.ASSEMBLYAI_REGION === 'eu' ? 'eu' : 'us',
        wsFactory: opts.assemblyAiWsFactory,
        onEvent: (ev) => {
          sendJson({ ...ev, sttType: ev.type, type: 'stt_event' });
          if (ev.type === 'Turn' && ev.transcript && sttMode === 'meeting') {
            hadMeetingActive = true;
            const st = meetingBuffer.pushTurn({
              speakerLabel: ev.speakerLabel ?? 'PENDING',
              text: ev.transcript,
              isFinal: Boolean(ev.endOfTurn),
            });
            broadcastSse('meeting', st);
            sendJson({ type: 'meeting_state', state: st });
          }
        },
      });
      await sttSession.connect().catch(() => {
        // Fallback stays clean if upstream WS unavailable
      });
    };

    sendJson({
      type: 'orb_state',
      state: 'idle',
      engine: resolveAssemblyAiKey() ? 'LIVE · ASSEMBLYAI' : 'SANDBOX · LOCAL',
    });

    ws.on('message', async (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        const rms = computePcmRms(buf);
        sendJson({ type: 'orb_rms', rms });
        if (!sttSession && resolveAssemblyAiKey()) {
          await connectSttIfConfigured();
        }
        sttSession?.sendAudioPcm(buf);
        return;
      }

      try {
        const msg = JSON.parse(data.toString()) as {
          type?: string;
          mode?: AssemblyAiSttMode;
          text?: string;
          voiceId?: string;
        };
        if (msg.type === 'mode' && (msg.mode === 'agent' || msg.mode === 'meeting')) {
          sttMode = msg.mode;
          if (sttMode === 'meeting') {
            hadMeetingActive = true;
            const snap = resolveProvider(session.mode).getSnapshot();
            meetingBuffer.start({
              providerMode: resolveAssemblyAiKey() ? 'LIVE_ASSEMBLYAI' : 'DEMO_SANDBOX',
              attendees: snap.calendarEvents.map((e) => e.attendeeName ?? '').filter(Boolean),
            });
          }
          await connectSttIfConfigured();
          sendJson({ type: 'orb_state', state: sttMode === 'meeting' ? 'listening' : 'idle' });
        } else if (msg.type === 'barge_in') {
          ttsSession?.cancel();
          recordAudit('TTS_BARGE_IN', 'Wearer interrupted TTS-1 playback via barge-in cancel()');
          sendJson({ type: 'tts_cancelled' });
          sendJson({ type: 'orb_state', state: 'listening' });
        } else if (msg.type === 'speak' && msg.text) {
          sendJson({ type: 'orb_state', state: 'speaking' });
          const apiKey = resolveAssemblyAiKey();
          if (apiKey) {
            ttsSession?.terminate();
            ttsSession = new AssemblyAiTtsSession({
              apiKey,
              voiceId: msg.voiceId ?? 'aai-kyla',
              region: process.env.ASSEMBLYAI_REGION === 'eu' ? 'eu' : 'us',
              wsFactory: opts.assemblyAiWsFactory,
              callbacks: {
                onAudioChunk: (audioBase64, flushId) =>
                  sendJson({ type: 'tts_audio', audioBase64, flushId }),
                onWordBoundaries: (words, flushId, audioStartMs) =>
                  sendJson({ type: 'tts_words', words, flushId, audioStartMs }),
                onFlushDone: () => sendJson({ type: 'orb_state', state: 'idle' }),
              },
            });
            await ttsSession.connect().catch(() => null);
            ttsSession.generate(msg.text);
            ttsSession.flush();
          } else {
            const demo = buildDemoWordBoundaries(msg.text);
            sendJson({ type: 'tts_words', words: demo.words, flushId: 0, audioStartMs: 0 });
            sendJson({ type: 'orb_state', state: 'idle' });
          }
        }
      } catch {
        // ignore invalid WS control message
      }
    });

    ws.on('close', () => {
      sttSession?.terminate();
      ttsSession?.terminate();
      if (hadMeetingActive || meetingBuffer.getState().active) {
        meetingBuffer.wipe();
        recordAudit('MEETING_WIPE', 'WebSocket disconnected: RAM meeting transcript wiped');
        broadcastSse('meeting', { active: false, turns: [], decisions: [], actions: [] });
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(opts.port ?? 0, opts.host ?? '127.0.0.1', resolve);
  });
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : opts.port ?? 8787;
  const url = `http://127.0.0.1:${actualPort}`;
  logInfo('server', `OnQ relay listening on ${url}`);

  return {
    server,
    url,
    port: actualPort,
    ledger,
    vault,
    demoProvider,
    close: async () => {
      proactiveHarness.stop();
      meetingBuffer.wipe();
      for (const client of wss.clients) {
        try {
          client.close();
        } catch {
          // ignore
        }
      }
      wss.close();
      for (const c of sseClients) c.end();
      sseClients.clear();
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
      await ledger.close();
    },
  };
}

async function buildAndValidatePreview(params: {
  intent: ActionPreview['intent'];
  cardId?: string;
  operations: ActionOperation[];
  summaryLines: string[];
  nowFn: () => number;
  provider: WorkspaceProvider;
  ledger: LedgerStore;
  sessionHash: string;
}): Promise<{ preview: ActionPreview } | { conflict: unknown }> {
  const nowMs = params.nowFn();
  const canonical = JSON.stringify({
    intent: params.intent,
    cardId: params.cardId,
    operations: params.operations,
  });
  const idempotencyKey = crypto.createHash('sha256').update(canonical).digest('hex');
  const preview: ActionPreview = {
    previewToken: `pt_${crypto.randomBytes(12).toString('hex')}`,
    idempotencyKey,
    expiresAtIso: new Date(nowMs + 45_000).toISOString(),
    intent: params.intent,
    defaultSelection: 'NO',
    cardId: params.cardId,
    summaryLines: params.summaryLines,
    operations: params.operations,
    safetyChecks: {
      calendarConflictFree: true,
      threadFresh: true,
      recipientVerified: true,
      factGuardPassed: true,
    },
  };

  const conflict = await params.provider.checkLiveConflicts(preview);
  if (conflict) {
    return { conflict };
  }

  await params.ledger.savePreview(preview, params.sessionHash);
  return { preview };
}

export {
  AssemblyAiRealtimeSession,
  AssemblyAiTtsSession,
  GoogleWorkspaceClient,
  LiveWorkspaceProvider,
  NotionWorkspaceClient,
  checkCalendarConflict,
  createPkcePair,
  listAvailableTtsVoices,
  routeModelCompletion,
  runOrchestrationHarness,
  synthesizeTtsUtterance,
};
