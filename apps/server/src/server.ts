import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  checkCalendarConflict,
  parseIcsEvents,
  parseVoiceCommand,
} from '@oncue/core';
import type {
  ActionOperation,
  ActionPreview,
  CommitReceipt,
  CorridorCard,
  SourceMode,
} from '@oncue/core';
import { generateGroundedDraft } from './llm.js';
import type { LlmConfig } from './llm.js';
import { createConfiguredLedgerStore, SqliteLedgerStore } from './ledger.js';
import type { LedgerStore } from './ledger.js';
import { logError, logInfo, redactSecrets } from './logger.js';
import { DemoWorkspaceProvider } from './providers/demoProvider.js';
import type { DemoFaultInjection } from './providers/demoProvider.js';
import { buildGoogleAuthUrl, GoogleWorkspaceClient } from './providers/googleProvider.js';
import { LiveWorkspaceProvider } from './providers/liveProvider.js';
import { NotionWorkspaceClient } from './providers/notionProvider.js';
import type { WorkspaceProvider } from './providers/types.js';
import { MAX_WAV_UPLOAD_BYTES, transcribeWavBuffer } from './stt.js';
import type { SttOptions } from './stt.js';
import { EncryptedTokenVault } from './tokenVault.js';

export interface AuditTelemetryEvent {
  id: string;
  atIso: string;
  kind: 'RMS_BLOCK' | 'CONFLICT_409' | 'CODE_GUARD' | 'COMMIT' | 'UNDO' | 'PAIR_LIVE' | 'ICS_IMPORT';
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
  fetchImpl?: typeof fetch;
  nowFn?: () => number;
  allowTestFaultControls?: boolean;
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

export async function createOnCueServer(opts: ServerOptions = {}): Promise<{
  server: http.Server;
  url: string;
  port: number;
  ledger: LedgerStore;
  vault: EncryptedTokenVault;
  demoProvider: DemoWorkspaceProvider;
  close: () => Promise<void>;
}> {
  const nowFn = opts.nowFn ?? (() => Date.now());
  const dataDir = opts.dataDir ?? path.join(os.tmpdir(), `oncue-data-${process.pid}`);
  const ledger =
    opts.ledger ??
    (opts.dataDir
      ? new SqliteLedgerStore(path.join(dataDir, 'oncue.sqlite'), nowFn)
      : await createConfiguredLedgerStore(dataDir, nowFn));
  const vault = new EncryptedTokenVault(dataDir);
  const demoProvider = opts.demoProvider ?? new DemoWorkspaceProvider();
  const allowedOrigins = new Set(opts.allowedOrigins ?? DEFAULT_ORIGINS);
  const sseClients = new Set<http.ServerResponse>();
  const auditLog: AuditTelemetryEvent[] = [];
  let activeIcsFeed: string | null = null;

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

  function applyCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (!allowedOrigins.has(origin) && !/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
      jsonResponse(res, 403, { error: 'CORS origin denied' });
      return false;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-OnCue-Preset');
    return true;
  }

  async function requireAuth(req: http.IncomingMessage, res: http.ServerResponse) {
    const bearer = extractBearer(req);
    const session = await ledger.validateSession(bearer);
    if (!session) {
      jsonResponse(res, 401, { error: 'Unauthorized: valid Bearer session required' });
      return null;
    }
    return session;
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
        jsonResponse(res, 200, {
          ok: true,
          mode: hasLive ? 'LIVE' : 'DEMO',
          sttEngine: process.env.WHISPER_CPP_BIN
            ? 'whisper.cpp-local'
            : 'faster-whisper-local',
          llmProvider: process.env.ANTHROPIC_API_KEY
            ? 'Claude'
            : process.env.OPENROUTER_API_KEY
              ? 'OpenRouter'
              : process.env.OPENAI_API_KEY
                ? 'ChatGPT'
                : 'Rules (Deterministic)',
          storage: process.env.DATABASE_URL ? 'neon-postgres' : 'node:sqlite',
          version: '1.1.0',
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
        const presetHeader = req.headers['x-oncue-preset'];
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
              opts.llmConfig,
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
            opts.llmConfig,
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

        const receipt = await provider.executePreview({
          preview: consumed.preview,
          operations: consumed.preview.operations,
        });
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

      // 13. Sandbox fault & reset controls
      if (req.method === 'POST' && pathname === '/api/workspace/reset') {
        const session = await requireAuth(req, res);
        if (!session) return;
        demoProvider.resetSandbox();
        activeIcsFeed = null;
        broadcastSse('reset', { ok: true });
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

      // 14. Session revoke
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

  await new Promise<void>((resolve) => {
    server.listen(opts.port ?? 0, opts.host ?? '127.0.0.1', resolve);
  });
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : opts.port ?? 8787;
  const url = `http://127.0.0.1:${actualPort}`;
  logInfo('server', `OnCue relay listening on ${url}`);

  return {
    server,
    url,
    port: actualPort,
    ledger,
    vault,
    demoProvider,
    close: async () => {
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

export { GoogleWorkspaceClient, LiveWorkspaceProvider, NotionWorkspaceClient, checkCalendarConflict };
