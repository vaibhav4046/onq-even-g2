import { useCallback, useEffect, useState } from 'react';
import {
  ApplePixelTile,
  AssemblyAiPixelSvg,
  CalendarPixelSvg,
  ChatGptPixelSvg,
  ClaudePixelSvg,
  DrivePixelSvg,
  EvenG2PixelSvg,
  GmailPixelSvg,
  GooglePixelSvg,
  GrokPixelSvg,
  NotionPixelSvg,
  OmniRoutePixelSvg,
  OpenRouterPixelSvg,
  ShieldPixelSvg,
  TelegramPixelSvg,
} from './EcosystemIcons';
import { GlyphDecodeHeading, ScrollReveal } from './MotionPrimitives';

export interface ConnectorHubProps {
  sessionToken: string | null;
  mode: 'LIVE' | 'DEMO' | 'STALE';
  ttsVoiceId: string;
  onChangeTtsVoice: (voiceId: string) => void;
  onSessionUpdated: (token: string, mode: 'LIVE' | 'DEMO') => void;
  onRevokeSession: () => void;
}

interface ConnectorCardStatus {
  connected: boolean;
  mode: string;
  detail: string;
}

interface ConnectorStatusResponse {
  accountName: string | null;
  accountEmail: string | null;
  vaultEncrypted: boolean;
  activeLlmProvider: string;
  preferredLlm: 'auto' | 'claude' | 'openrouter' | 'chatgpt' | 'grok' | 'omniroute' | 'rules';
  openRouterModel: string;
  omniRouteUrl?: string;
  omniRouteModel?: string;
  voiceEngine: string;
  googleOAuthConfigured: boolean;
  notionOAuthConfigured?: boolean;
  openRouterOAuthReady?: boolean;
  googleAuthUrl: string | null;
  connectors: {
    googleWorkspace: ConnectorCardStatus;
    notion: ConnectorCardStatus;
    claude: ConnectorCardStatus;
    openrouter: ConnectorCardStatus;
    grok?: ConnectorCardStatus;
    omniroute?: ConnectorCardStatus;
    chatgpt: ConnectorCardStatus;
    assemblyai: ConnectorCardStatus;
    telegram?: ConnectorCardStatus;
  };
}

interface ConnectorTestResult {
  ok: boolean;
  provider: string;
  mode: string;
  latencyMs: number;
  detail: string;
}

interface DetectedComputerTool {
  id: string;
  name: string;
  binary: string;
  accountMode: string;
  installed: boolean;
  installHint: string;
}

type ConnectorProviderId =
  | 'googleWorkspace'
  | 'notion'
  | 'telegram'
  | 'claude'
  | 'openrouter'
  | 'grok'
  | 'omniroute'
  | 'chatgpt'
  | 'assemblyai';

type ConnectorDrawerId = null | 'account' | 'bulk' | ConnectorProviderId;

const SANDBOX_NOTION_DB_ID = '423373c508ea81b495c7f09c82c0e809';

const fmtIcsUtc = (minsAhead: number) =>
  new Date(Date.now() + minsAhead * 60_000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const QUICK_SAMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//OnQ//Corridor//EN',
  'BEGIN:VEVENT',
  'UID:onq-live-1@local',
  'SUMMARY:VC Sync - Priya Nair',
  `DTSTART:${fmtIcsUtc(20)}`,
  `DTEND:${fmtIcsUtc(50)}`,
  'ATTENDEE;CN="Priya Nair":mailto:priya@tvm.example',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:onq-live-2@local',
  'SUMMARY:Product Review - Alex Chen',
  `DTSTART:${fmtIcsUtc(85)}`,
  `DTEND:${fmtIcsUtc(115)}`,
  'ATTENDEE;CN="Alex Chen":mailto:alex@partner.example',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const GOOGLE_REDIRECT_URI = 'http://127.0.0.1:8787/api/auth/google/callback';

/**
 * Clean 1-Click Connectors Hub:
 * Google OAuth 2.0 + PKCE, 1-click RFC 5545 .ics live schedule sync,
 * Notion 2026-03-11 schema discovery, Claude / OpenRouter / ChatGPT failover,
 * and AssemblyAI STT-3.7 / TTS-1 with AES-256-GCM 0600 storage.
 */
export function ConnectorsHub({
  sessionToken,
  mode,
  ttsVoiceId,
  onChangeTtsVoice,
  onSessionUpdated,
  onRevokeSession,
}: ConnectorHubProps) {
  const [status, setStatus] = useState<ConnectorStatusResponse | null>(null);
  const [openDrawer, setOpenDrawer] = useState<ConnectorDrawerId>(null);
  const [feedback, setFeedback] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [testingId, setTestingId] = useState<ConnectorProviderId | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<ConnectorProviderId, ConnectorTestResult>>>({});

  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [oauthJsonText, setOauthJsonText] = useState('');
  const [icsText, setIcsText] = useState('');
  const [notionToken, setNotionToken] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [openRouterModel, setOpenRouterModel] = useState('openrouter/free');
  const [grokKey, setGrokKey] = useState('');
  const [omniRouteUrl, setOmniRouteUrl] = useState('http://127.0.0.1:20128/v1');
  const [omniRouteKey, setOmniRouteKey] = useState('');
  const [omniRouteModel, setOmniRouteModel] = useState('auto');
  const [openAiKey, setOpenAiKey] = useState('');
  const [aaiKey, setAaiKey] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');

  const [showPhysicalPair, setShowPhysicalPair] = useState(false);
  const [g2Code, setG2Code] = useState<string | null>(null);
  const [computerTools, setComputerTools] = useState<DetectedComputerTool[]>([]);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (sessionToken) h.Authorization = `Bearer ${sessionToken}`;
    return h;
  }, [sessionToken]);

  const loadStatus = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await fetch('/api/connectors/status', {
        headers: authHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const json = (await res.json()) as ConnectorStatusResponse;
        setStatus(json);
        if (json.openRouterModel) setOpenRouterModel(json.openRouterModel);
        if (json.omniRouteUrl) setOmniRouteUrl(json.omniRouteUrl);
        if (json.omniRouteModel) setOmniRouteModel(json.omniRouteModel);
      }
      const compRes = await fetch('/api/computer/tools', {
        headers: authHeaders(),
        credentials: 'include',
      });
      if (compRes.ok) {
        const compJson = (await compRes.json()) as { tools?: DetectedComputerTool[] };
        setComputerTools(compJson.tools ?? []);
      }
    } catch {
      // keep silent offline
    }
  }, [authHeaders, sessionToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, sessionToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const conn = sp.get('connected');
    const signed = sp.get('signedIn');
    const oauthError = sp.get('oauthError');
    if (oauthError) {
      setFeedback(`Google OAuth cancelled (${oauthError}). Use Zero-Warning Sign-In or Load Live .ics Calendar below.`);
      window.history.replaceState({}, '', `${window.location.pathname}#connectors`);
    } else if (conn === 'openrouter') {
      setFeedback('OpenRouter OAuth PKCE key verified and stored in AES-256-GCM 0600 vault.');
      void loadStatus();
      window.history.replaceState({}, '', `${window.location.pathname}#connectors`);
    } else if (signed === '1') {
      setFeedback('Google OAuth 2.0 + PKCE session verified and stored in AES-256-GCM vault.');
      void loadStatus();
      window.history.replaceState({}, '', `${window.location.pathname}#connectors`);
    }
  }, [loadStatus]);

  const handleGoogleJsonFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = typeof reader.result === 'string' ? reader.result : '';
      try {
        const parsed = JSON.parse(txt) as {
          web?: { client_id?: string; client_secret?: string };
          installed?: { client_id?: string; client_secret?: string };
          client_id?: string;
          client_secret?: string;
        };
        const src = parsed.web ?? parsed.installed ?? parsed;
        if (src.client_id) setOauthClientId(src.client_id);
        if (src.client_secret) setOauthClientSecret(src.client_secret);
        setOauthJsonText(txt);
        setFeedback(`Loaded Google OAuth JSON (${file.name}). Click Save & Sign in with Google.`);
      } catch {
        setFeedback('Could not parse JSON file. Expected Google Cloud OAuth client_secret_*.json.');
      }
    };
    reader.readAsText(file);
  };

  const startOpenRouterOAuth = () => {
    window.location.href = '/api/auth/openrouter/start';
  };

  const postConnect = async (payload: Record<string, unknown>, okMessage: string) => {
    setBusy(true);
    setFeedback('Saving credentials to encrypted vault...');
    try {
      const res = await fetch('/api/connectors/connect', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        status?: ConnectorStatusResponse;
        sessionToken?: string;
        mode?: 'LIVE' | 'DEMO';
        schema?: { titleProp: string; completionProp?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.status) setStatus(json.status);
      if (json.sessionToken) onSessionUpdated(json.sessionToken, json.mode ?? 'LIVE');
      setFeedback(
        json.schema
          ? `${okMessage} Discovered Notion schema: "${json.schema.titleProp}".`
          : okMessage,
      );
      setOpenDrawer(null);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Connector update failed');
    } finally {
      setBusy(false);
    }
  };

  const runTestConnection = async (providerId: ConnectorProviderId) => {
    setTestingId(providerId);
    setFeedback(`Verifying ${providerId}...`);
    try {
      const res = await fetch(`/api/connectors/${providerId}/test`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      });
      const out = (await res.json()) as ConnectorTestResult;
      setTestResults((prev) => ({ ...prev, [providerId]: out }));
      setFeedback(`${out.ok ? 'OK' : 'ERROR'} (${out.mode}, ${out.latencyMs}ms): ${out.detail}`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  };

  const switchOrchestrator = async (
    nextPreferred: ConnectorStatusResponse['preferredLlm'],
    nextModel = openRouterModel,
  ) => {
    setBusy(true);
    setFeedback(`Switching AI orchestrator to ${nextPreferred.toUpperCase()}...`);
    try {
      const res = await fetch('/api/connectors/orchestrator', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          preferredLlm: nextPreferred,
          openRouterModel: nextModel,
        }),
      });
      const json = (await res.json()) as ConnectorStatusResponse & {
        status?: ConnectorStatusResponse;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const nextStatus = json.status ?? json;
      if (nextStatus?.connectors) {
        setStatus(nextStatus);
        if (nextStatus.openRouterModel) setOpenRouterModel(nextStatus.openRouterModel);
      }
      setFeedback(
        `Active AI orchestrator set to ${nextStatus.activeLlmProvider ?? nextPreferred.toUpperCase()} (${nextModel}).`,
      );
      await loadStatus();
      if (sessionToken) {
        onSessionUpdated(sessionToken, mode === 'LIVE' ? 'LIVE' : 'DEMO');
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Orchestrator switch failed');
    } finally {
      setBusy(false);
    }
  };

  const startGoogleSignIn = async (scopeMode: 'identity' | 'workspace' = 'identity') => {
    const targetUrl =
      scopeMode === 'workspace' ? '/api/auth/google/start?scope=workspace' : '/api/auth/google/start';
    if (status?.googleOAuthConfigured) {
      window.location.href = targetUrl;
      return;
    }
    try {
      const sep = targetUrl.includes('?') ? '&' : '?';
      const res = await fetch(`${targetUrl}${sep}format=json`, { credentials: 'include' });
      const data = (await res.json()) as { configured?: boolean; authUrl?: string; error?: string };
      if (data.configured && data.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
      setOpenDrawer('googleWorkspace');
      setFeedback(
        data.error ??
          'Add Google OAuth Client ID & Secret below, or click Load Sample Live .ics for instant calendar sync.',
      );
    } catch {
      setOpenDrawer('googleWorkspace');
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      });
      setTestResults({});
      await loadStatus();
      setFeedback('Signed out and wiped encrypted credentials.');
      onRevokeSession();
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (provider: string) => {
    if (provider === 'all') {
      await handleSignOut();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/connectors/disconnect', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ provider }),
      });
      const json = (await res.json()) as { status?: ConnectorStatusResponse };
      if (json.status) setStatus(json.status);
      setFeedback(`Disconnected ${provider}.`);
    } finally {
      setBusy(false);
    }
  };

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_REDIRECT_URI);
      setCopiedUri(true);
      window.setTimeout(() => setCopiedUri(false), 1800);
    } catch {
      setFeedback(`Copy URI manually: ${GOOGLE_REDIRECT_URI}`);
    }
  };

  const cards = [
    {
      id: 'googleWorkspace' as const,
      name: 'Google Workspace',
      sub: 'Calendar · Gmail · Drive · .ics',
      icon: (
        <ApplePixelTile size="lg" tint="#4285F4">
          <GooglePixelSvg className="w-6 h-6" />
        </ApplePixelTile>
      ),
      secondaryIcons: (
        <span className="inline-flex items-center gap-1 opacity-80">
          <CalendarPixelSvg className="w-3.5 h-3.5" />
          <GmailPixelSvg className="w-3.5 h-3.5" />
          <DrivePixelSvg className="w-3.5 h-3.5" />
        </span>
      ),
      state: status?.connectors.googleWorkspace,
    },
    {
      id: 'notion' as const,
      name: 'Notion',
      sub: 'Tasks & Meeting Action Packs',
      icon: (
        <ApplePixelTile size="lg" tint="#f2f2f2">
          <NotionPixelSvg className="w-6 h-6" />
        </ApplePixelTile>
      ),
      secondaryIcons: null,
      state: status?.connectors.notion,
    },
    {
      id: 'claude' as const,
      name: 'Claude',
      sub: 'Grounded Meeting & Reply Drafting',
      icon: (
        <ApplePixelTile size="lg" tint="#D97757">
          <ClaudePixelSvg className="w-6 h-6" />
        </ApplePixelTile>
      ),
      secondaryIcons: null,
      state: status?.connectors.claude,
    },
    {
      id: 'openrouter' as const,
      name: 'OpenRouter',
      sub: 'Multi-Model Free & Pro Failover',
      icon: (
        <ApplePixelTile size="lg" tint="#86FFAF">
          <OpenRouterPixelSvg className="w-6 h-6" />
        </ApplePixelTile>
      ),
      secondaryIcons: null,
      state: status?.connectors.openrouter,
    },
    {
      id: 'grok' as const,
      name: 'Grok (xAI)',
      sub: 'xAI Grok-3-mini Rapid Synthesis',
      icon: (
        <ApplePixelTile size="lg" tint="#34F57E">
          <GrokPixelSvg className="w-6 h-6" />
        </ApplePixelTile>
      ),
      secondaryIcons: null,
      state: status?.connectors.grok,
    },
    {
      id: 'omniroute' as const,
      name: 'OmniRoute Gateway',
      sub: '1,400+ Models · Universal Local Proxy',
      icon: (
        <ApplePixelTile size="lg" tint="#86FFAF">
          <OmniRoutePixelSvg className="w-6 h-6" />
        </ApplePixelTile>
      ),
      secondaryIcons: null,
      state: status?.connectors.omniroute,
    },
    {
      id: 'chatgpt' as const,
      name: 'ChatGPT',
      sub: 'OpenAI GPT-4o-mini Backup Route',
      icon: (
        <ApplePixelTile size="lg" tint="#10A37F">
          <ChatGptPixelSvg className="w-6 h-6" />
        </ApplePixelTile>
      ),
      secondaryIcons: null,
      state: status?.connectors.chatgpt,
    },
    {
      id: 'assemblyai' as const,
      name: 'AssemblyAI Voice',
      sub: 'Speaker Scribe & Earbuds Audio Out',
      icon: (
        <ApplePixelTile size="lg" tint="#34F57E">
          <AssemblyAiPixelSvg className="w-6 h-6" />
        </ApplePixelTile>
      ),
      secondaryIcons: null,
      state: status?.connectors.assemblyai,
    },
    {
      id: 'telegram' as const,
      name: 'Telegram',
      sub: 'Track 01 + Best Telegram Digest & Voice Reply',
      icon: (
        <ApplePixelTile size="lg" tint="#26A5E4">
          <TelegramPixelSvg className="w-6 h-6" />
        </ApplePixelTile>
      ),
      secondaryIcons: null,
      state: status?.connectors.telegram,
    },
  ];

  return (
    <section id="connectors" className="section-rule py-20 sm:py-24">
      <div className="container-page space-y-8">
        <ScrollReveal className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lightgray)]">
              CONNECT ONCE · USE IN BROWSER &amp; GLASSES
            </p>
            <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.4rem]">
              <span className="block text-[var(--lightgray)]">Sign in once.</span>
              <GlyphDecodeHeading text="Everything links automatically." className="block text-[var(--bright)]" />
            </h2>
          </div>

          <div className="retro-glass-panel flex flex-wrap items-center gap-2.5 px-4 py-3 text-xs">
            <ApplePixelTile size="sm" tint="#34F57E">
              <ShieldPixelSvg className="w-4 h-4" />
            </ApplePixelTile>
            <div className="space-y-0.5 mr-2">
              <div className="text-[var(--bright)] font-medium">
                {status?.accountName
                  ? `${status.accountName}${status.accountEmail ? ` (${status.accountEmail})` : ''}`
                  : 'AES-256-GCM Local Vault'}
              </div>
              <div className="font-pixel text-[9px] uppercase tracking-[0.14em] text-[var(--g2-phosphor)]">
                {mode === 'DEMO' ? 'SANDBOX' : mode} · {cards.filter((x) => x.state?.connected).length}/{cards.length} LIVE · {status?.activeLlmProvider ?? 'Rules Engine'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenDrawer(openDrawer === 'bulk' ? null : 'bulk')}
              className="retro-btn-primary px-3.5 py-1.5 cursor-pointer"
            >
              Configure All (Vault)
            </button>
            <button
              type="button"
              onClick={() => void startGoogleSignIn()}
              className="retro-btn-glass px-3 py-1.5 text-[var(--lime)] font-semibold cursor-pointer inline-flex items-center gap-1.5"
            >
              <GooglePixelSvg className="w-3.5 h-3.5" />
              <span>Sign in with Google</span>
            </button>
            <button
              type="button"
              onClick={startOpenRouterOAuth}
              className="retro-btn-glass px-3 py-1.5 text-[var(--g2-phosphor)] font-semibold cursor-pointer inline-flex items-center gap-1.5"
            >
              <OpenRouterPixelSvg className="w-3.5 h-3.5" />
              <span>1-Click OpenRouter</span>
            </button>
            <button
              type="button"
              onClick={() => setOpenDrawer(openDrawer === 'account' ? null : 'account')}
              className="retro-btn-glass px-2.5 py-1.5 text-[11px] hover:text-[var(--lime)] cursor-pointer"
            >
              Router
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSignOut()}
              className="retro-btn-glass px-2.5 py-1.5 text-[11px] text-[var(--lightgray)] hover:text-[var(--danger)] cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </ScrollReveal>

        {/* Active AI Orchestrator 1-Click Switcher Bar */}
        <div className="retro-glass-panel p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs overflow-hidden">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]">
                ACTIVE AI ORCHESTRATOR
              </span>
              <span className="font-pixel text-[9px] uppercase px-2 py-0.5 rounded-full border border-[var(--lime)]/50 bg-[var(--lime)]/10 text-[var(--lime)]">
                {status?.activeLlmProvider ?? 'Rules (Deterministic)'}
              </span>
            </div>
            <p className="text-[11px] text-[var(--lightgray)]">
              1-click failover across OpenRouter, Grok (xAI), OmniRoute (1,400+ models), ChatGPT, Claude, or Rules with auto cooldowns.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {(
              [
                ['auto', 'Auto (Smart Failover)'],
                ['openrouter', 'OpenRouter'],
                ['grok', 'Grok (xAI)'],
                ['omniroute', 'OmniRoute'],
                ['chatgpt', 'ChatGPT'],
                ['claude', 'Claude'],
                ['rules', 'Rules'],
              ] as const
            ).map(([id, label]) => {
              const isActive = (status?.preferredLlm ?? 'auto') === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={busy}
                  onClick={() => void switchOrchestrator(id)}
                  className={`px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[var(--lime)] text-[#0a0a0a]'
                      : 'retro-btn-glass text-[var(--bright)] hover:text-[var(--lime)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <select
              aria-label="Active OpenRouter model"
              disabled={busy}
              value={openRouterModel}
              onChange={(e) => {
                const nextModel = e.target.value;
                setOpenRouterModel(nextModel);
                void switchOrchestrator(status?.preferredLlm ?? 'auto', nextModel);
              }}
              className="bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--bright)] max-w-full"
            >
              <option value="openrouter/free">openrouter/free (Auto)</option>
              <option value="google/gemma-3-27b-it:free">google/gemma-3-27b-it:free</option>
              <option value="meta-llama/llama-3.3-70b-instruct:free">meta-llama/llama-3.3-70b-instruct:free</option>
              <option value="anthropic/claude-3.5-haiku">anthropic/claude-3.5-haiku</option>
              <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
              <option value="google/gemini-2.0-flash-001">google/gemini-2.0-flash-001</option>
            </select>
          </div>
        </div>

        {openDrawer === 'bulk' && (
          <div className="retro-glass-panel p-5 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[var(--hairline)] pb-3">
              <div>
                <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lime)]">
                  ONE-GO ENCRYPTED VAULT SETUP (ALL WORKSPACES &amp; AI)
                </span>
                <p className="text-[11px] text-[var(--lightgray)] mt-0.5">
                  Configure Google OAuth JSON / .ics, Notion Sandbox DB, Claude, OpenRouter, OpenAI, and AssemblyAI in one encrypted 0600 save.
                </p>
              </div>
              <button type="button" onClick={() => setOpenDrawer(null)} className="text-[var(--lightgray)] hover:text-[var(--bright)] cursor-pointer">
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[var(--ink)] border border-[var(--hairline)] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-pixel text-[9px] uppercase text-[var(--lime)]">1. GOOGLE WORKSPACE OAUTH OR .ICS</span>
                  <label className="text-[11px] text-[var(--g2-phosphor)] underline decoration-dashed cursor-pointer">
                    Drop/Upload client_secret.json
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="sr-only"
                      onChange={(e) => handleGoogleJsonFile(e.target.files?.[0])}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="OAuth Client ID"
                    value={oauthClientId}
                    onChange={(e) => setOauthClientId(e.target.value)}
                    className="bg-[var(--surface)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
                  />
                  <input
                    type="password"
                    placeholder="OAuth Client Secret"
                    value={oauthClientSecret}
                    onChange={(e) => setOauthClientSecret(e.target.value)}
                    className="bg-[var(--surface)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postConnect({ provider: 'ics', icsText: QUICK_SAMPLE_ICS }, 'Live .ics schedule active on G2.')}
                    className="px-2.5 py-1 border border-[var(--g2-phosphor)] text-[var(--g2-phosphor)] text-[11px] cursor-pointer"
                  >
                    1-Click Live .ics
                  </button>
                  <button
                    type="button"
                    onClick={() => void startGoogleSignIn()}
                    className="px-2.5 py-1 border border-[var(--hairline)] text-[var(--bright)] hover:border-[var(--lime)] text-[11px] cursor-pointer"
                  >
                    Authorize Google
                  </button>
                </div>
              </div>

              <div className="bg-[var(--ink)] border border-[var(--hairline)] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-pixel text-[9px] uppercase text-[var(--lime)]">2. NOTION SANDBOX LEDGER</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNotionDbId(SANDBOX_NOTION_DB_ID);
                      setFeedback(`Filled verified OnQ Notion Sandbox DB ID (${SANDBOX_NOTION_DB_ID}).`);
                    }}
                    className="text-[11px] text-[var(--g2-phosphor)] underline decoration-dashed cursor-pointer"
                  >
                    Fill OnQ Sandbox DB ID
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="password"
                    placeholder="Notion token (ntn_...)"
                    value={notionToken}
                    onChange={(e) => setNotionToken(e.target.value)}
                    className="bg-[var(--surface)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
                  />
                  <input
                    type="text"
                    placeholder={`DB ID (${SANDBOX_NOTION_DB_ID.slice(0, 8)}...)`}
                    value={notionDbId}
                    onChange={(e) => setNotionDbId(e.target.value)}
                    className="bg-[var(--surface)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <div className="space-y-1">
                <span className="font-pixel text-[9px] uppercase text-[var(--lightgray)]">3. OPENROUTER (OR 1-CLICK OAUTH)</span>
                <input
                  type="password"
                  placeholder="sk-or-v1-... (or use OAuth)"
                  value={openRouterKey}
                  onChange={(e) => setOpenRouterKey(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
                />
              </div>
              <div className="space-y-1">
                <span className="font-pixel text-[9px] uppercase text-[var(--lightgray)]">4. CLAUDE (ANTHROPIC)</span>
                <input
                  type="password"
                  placeholder="sk-ant-..."
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
                />
              </div>
              <div className="space-y-1">
                <span className="font-pixel text-[9px] uppercase text-[var(--lightgray)]">5. CHATGPT (OPENAI)</span>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
                />
              </div>
              <div className="space-y-1">
                <span className="font-pixel text-[9px] uppercase text-[var(--lightgray)]">6. GROK (XAI)</span>
                <input
                  type="password"
                  placeholder="xai-..."
                  value={grokKey}
                  onChange={(e) => setGrokKey(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
                />
              </div>
              <div className="space-y-1">
                <span className="font-pixel text-[9px] uppercase text-[var(--lightgray)]">7. OMNIROUTE GATEWAY (1,400+)</span>
                <input
                  type="text"
                  placeholder="http://127.0.0.1:20128/v1"
                  value={omniRouteUrl}
                  onChange={(e) => setOmniRouteUrl(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
                />
              </div>
              <div className="space-y-1">
                <span className="font-pixel text-[9px] uppercase text-[var(--lightgray)]">8. ASSEMBLYAI VOICE</span>
                <input
                  type="password"
                  placeholder="Optional AAI key"
                  value={aaiKey}
                  onChange={(e) => setAaiKey(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--hairline)] px-2.5 py-1.5 text-[var(--bright)]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={startOpenRouterOAuth}
                className="px-3.5 py-2 border border-[var(--g2-phosphor)] text-[var(--g2-phosphor)] hover:bg-[var(--g2-phosphor)] hover:text-[#0a0a0a] font-semibold cursor-pointer"
              >
                Authorize OpenRouter in 1 Click (No Key Copy Needed)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void postConnect(
                    {
                      provider: 'bulk_vault',
                      accountName,
                      accountEmail,
                      googleOAuthJson: oauthJsonText || undefined,
                      googleClientId: oauthClientId || undefined,
                      googleClientSecret: oauthClientSecret || undefined,
                      notionToken: notionToken || undefined,
                      notionDatabaseId: notionDbId || undefined,
                      openRouterKey: openRouterKey || undefined,
                      openRouterModel,
                      xaiKey: grokKey || undefined,
                      omniRouteUrl: omniRouteUrl || undefined,
                      omniRouteKey: omniRouteKey || undefined,
                      omniRouteModel: omniRouteModel || undefined,
                      anthropicKey: claudeKey || undefined,
                      openAiKey: openAiKey || undefined,
                      assemblyAiKey: aaiKey || undefined,
                      telegramBotToken: telegramBotToken || undefined,
                      telegramChatId: telegramChatId || undefined,
                      icsText: icsText || undefined,
                    },
                    'All entered credentials saved cleanly to encrypted AES-256-GCM 0600 vault.',
                  )
                }
                className="px-5 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
              >
                Save All to Encrypted Vault
              </button>
            </div>
          </div>
        )}

        {openDrawer === 'account' && (
          <div className="retro-glass-panel p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lime)]">
                AI MODEL FAILOVER ROUTER &amp; WORKSPACE PROFILE
              </span>
              <button type="button" onClick={() => setOpenDrawer(null)} className="text-[var(--lightgray)] hover:text-[var(--bright)] cursor-pointer">
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                aria-label="Primary AI model router preference"
                value={status?.preferredLlm ?? 'auto'}
                onChange={(e) =>
                  void postConnect(
                    { provider: 'account', preferredLlm: e.target.value },
                    `Primary AI router set to ${e.target.value.toUpperCase()}.`,
                  )
                }
                className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
              >
                <option value="auto">Auto Failover (Claude -&gt; Grok -&gt; OpenRouter -&gt; OmniRoute -&gt; GPT)</option>
                <option value="claude">Primary: Claude</option>
                <option value="grok">Primary: Grok (xAI)</option>
                <option value="omniroute">Primary: OmniRoute (1,400+ models)</option>
                <option value="openrouter">Primary: OpenRouter</option>
                <option value="chatgpt">Primary: ChatGPT</option>
                <option value="rules">Rules Engine Only ($0 / Zero External API)</option>
              </select>
              <input
                type="text"
                placeholder="Display name (e.g. Alex)"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
              />
              <input
                type="email"
                placeholder="Workspace email (speaker attribution)"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void postConnect({ provider: 'account', accountName, accountEmail }, 'Workspace profile saved.')}
                className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
              >
                Save Profile
              </button>
              <button
                type="button"
                disabled={busy || testingId !== null}
                onClick={() => void runTestConnection('claude')}
                className="px-3 py-2 border border-[var(--hairline)] hover:border-[var(--verified)] cursor-pointer"
              >
                Probe Failover Chain
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => {
            const connected = Boolean(c.state?.connected);
            const active = openDrawer === c.id;
            const latestProbe = testResults[c.id];
            return (
              <div key={c.id} className="retro-glass-card p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {c.icon}
                      <div>
                        <span className="font-display text-lg font-bold text-[var(--bright)] block leading-tight">{c.name}</span>
                        {c.secondaryIcons && <div className="mt-1">{c.secondaryIcons}</div>}
                      </div>
                    </div>
                    <span
                      className={`font-pixel text-[9px] uppercase tracking-[0.14em] px-2.5 py-0.5 rounded-full border ${
                        c.state?.mode === 'COOLDOWN'
                          ? 'border-[var(--warning)]/60 text-[var(--warning)] bg-[var(--warning)]/10'
                          : connected
                            ? 'border-[var(--g2-phosphor)]/60 text-[var(--g2-phosphor)] bg-[var(--g2-phosphor)]/10'
                            : 'border-white/15 text-[var(--lightgray)] bg-white/5'
                      }`}
                    >
                      {c.state?.mode ?? 'READY'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--lightgray)]">{c.sub}</p>
                  <p className="text-[11px] text-[var(--bright)]/80">{c.state?.detail ?? 'Encrypted local relay ready.'}</p>
                  {latestProbe && (
                    <div
                      className={`text-[10px] font-pixel uppercase tracking-[0.1em] px-2.5 py-1 rounded-md border ${
                        latestProbe.ok
                          ? 'border-[var(--verified)]/50 text-[var(--verified)] bg-[var(--verified)]/10'
                          : 'border-[var(--danger)]/50 text-[var(--danger)] bg-[var(--danger)]/10'
                      }`}
                    >
                      {latestProbe.ok ? 'VERIFIED' : 'FAILED'} · {latestProbe.mode} · {latestProbe.latencyMs}ms
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-dashed border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      if (c.id === 'googleWorkspace' && status?.googleOAuthConfigured && !connected) {
                        void startGoogleSignIn();
                      } else {
                        setOpenDrawer(active ? null : c.id);
                      }
                    }}
                    className={`px-3.5 py-1.5 text-xs font-semibold cursor-pointer ${
                      connected
                        ? 'retro-btn-glass text-[var(--bright)]'
                        : 'retro-btn-primary'
                    }`}
                  >
                    {active ? 'Close' : connected ? 'Configure' : c.id === 'googleWorkspace' ? 'Connect Google' : c.id === 'notion' ? 'Connect Notion' : c.id === 'telegram' ? 'Connect Telegram' : 'Connect'}
                  </button>
                  <button
                    type="button"
                    aria-label="Test Connection"
                    disabled={busy || testingId === c.id}
                    onClick={() => void runTestConnection(c.id)}
                    className="retro-btn-glass px-2.5 py-1.5 text-[11px] text-[var(--lightgray)] hover:text-[var(--verified)] cursor-pointer"
                  >
                    {testingId === c.id ? 'Testing...' : 'Test Connection'}
                  </button>
                  {connected && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDisconnect(c.id)}
                      className="ml-auto text-[11px] text-[var(--lightgray)] hover:text-[var(--danger)] cursor-pointer"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {openDrawer && openDrawer !== 'account' && openDrawer !== 'bulk' && (
          <div className="retro-glass-panel p-5 space-y-3 text-xs">
            {openDrawer === 'googleWorkspace' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lime)]">
                    CONNECT GOOGLE WORKSPACE (OAUTH 2.0 + PKCE OR INSTANT .ICS)
                  </span>
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--lime)] underline decoration-dashed underline-offset-2"
                  >
                    Open Google Cloud Credentials -&gt;
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--lightgray)]">
                  <span>Redirect URI:</span>
                  <code className="bg-[var(--ink)] border border-[var(--hairline)] px-2 py-0.5 text-[var(--bright)]">
                    {GOOGLE_REDIRECT_URI}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyRedirectUri()}
                    className="px-2 py-0.5 border border-[var(--hairline)] hover:border-[var(--lime)] cursor-pointer"
                  >
                    {copiedUri ? 'Copied!' : 'Copy URI'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void startGoogleSignIn('identity')}
                    className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
                  >
                    Sign in with Google (No Warning)
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void postConnect({ provider: 'ics', icsText: QUICK_SAMPLE_ICS }, 'Live .ics schedule active on G2.')
                    }
                    className="px-4 py-2 border border-[var(--g2-phosphor)] text-[var(--g2-phosphor)] font-semibold cursor-pointer hover:bg-[var(--g2-phosphor)] hover:text-[#0a0a0a]"
                  >
                    Load Live .ics Calendar (0 Keys)
                  </button>
                  <button
                    type="button"
                    onClick={() => void startGoogleSignIn('workspace')}
                    className="px-3 py-2 border border-[var(--hairline)] text-[var(--lightgray)] hover:text-[var(--bright)] font-semibold cursor-pointer"
                  >
                    Full Gmail/Cal/Drive Scopes
                  </button>
                </div>
                <p className="text-[11px] text-[var(--lightgray)]">
                  Standard <strong className="text-[var(--bright)]">Sign in with Google (No Warning)</strong> authenticates immediately with zero Google unverified-app prompt. Optional Full Gmail/Cal/Drive scopes require clicking <em>Advanced -&gt; Go to OnQ (unsafe)</em> until post-hackathon Google CASA verification completes.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Google OAuth Client ID"
                    value={oauthClientId}
                    onChange={(e) => setOauthClientId(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                  <input
                    type="password"
                    placeholder="Google OAuth Client Secret"
                    value={oauthClientSecret}
                    onChange={(e) => setOauthClientSecret(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder="Or paste your own .ics calendar export URL text (instant live schedule sync)..."
                  value={icsText}
                  onChange={(e) => setIcsText(e.target.value)}
                  className="w-full bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                />
                    <div className="flex flex-wrap gap-2">
                      {oauthClientId.trim() && oauthClientSecret.trim() && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void postConnect(
                              {
                                provider: oauthJsonText ? 'google_oauth_json' : 'google_oauth',
                                googleOAuthJson: oauthJsonText || undefined,
                                googleClientId: oauthClientId,
                                googleClientSecret: oauthClientSecret,
                              },
                              'Google OAuth credentials saved. Click Sign in with Google OAuth above.',
                            )
                          }
                          className="px-4 py-2 bg-[var(--bright)] text-[#0a0a0a] font-semibold cursor-pointer"
                        >
                          Save OAuth App
                        </button>
                      )}
                      <label className="px-3 py-2 border border-[var(--hairline)] hover:border-[var(--g2-phosphor)] text-[var(--g2-phosphor)] font-semibold cursor-pointer">
                        Import client_secret.json
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="sr-only"
                          onChange={(e) => handleGoogleJsonFile(e.target.files?.[0])}
                        />
                      </label>
                      {icsText.trim() && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void postConnect({ provider: 'ics', icsText }, 'Live .ics schedule connected.')}
                          className="px-4 py-2 border border-[var(--lime)] text-[var(--lime)] font-semibold cursor-pointer"
                        >
                          Connect Custom .ics
                        </button>
                      )}
                    </div>
              </>
            )}

            {openDrawer === 'notion' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lime)]">
                    CONNECT NOTION (2026-03-11 AUTO-SCHEMA DISCOVERY)
                  </span>
                  <a
                    href="https://www.notion.so/profile/integrations"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--lime)] underline decoration-dashed underline-offset-2"
                  >
                    Create Integration Token -&gt;
                  </a>
                </div>
                {status?.notionOAuthConfigured && (
                  <div>
                    <a
                      href="/api/auth/notion/start"
                      className="inline-block px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold mb-2"
                    >
                      Authorize Notion OAuth
                    </a>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    placeholder="Notion token (ntn_...)"
                    value={notionToken}
                    onChange={(e) => setNotionToken(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                  <input
                    type="text"
                    placeholder="Database ID (optional — auto-discovered if blank)"
                    value={notionDbId}
                    onChange={(e) => setNotionDbId(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void postConnect(
                      { provider: 'notion', notionToken, notionDatabaseId: notionDbId },
                      'Notion database connected.',
                    )
                  }
                  className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
                >
                  Discover Schema &amp; Connect
                </button>
              </>
            )}

            {openDrawer === 'claude' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lime)]">
                    CONNECT CLAUDE (ACCOUNT CLI OR OPTIONAL API KEY)
                  </span>
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--lime)] underline decoration-dashed underline-offset-2"
                  >
                    Anthropic Keys -&gt;
                  </a>
                </div>
                <p className="text-[11px] text-[var(--lightgray)]">
                  No API billing needed: use 1-Click OpenRouter OAuth or Claude Code CLI (<code className="text-[var(--bright)]">claude login</code>) with your Claude Pro/Max account below.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="password"
                    placeholder="sk-ant-..."
                    value={claudeKey}
                    onChange={(e) => setClaudeKey(e.target.value)}
                    className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postConnect({ provider: 'claude', apiKey: claudeKey }, 'Claude connected & set active.')}
                    className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
                  >
                    Connect Claude
                  </button>
                </div>
              </>
            )}

            {openDrawer === 'openrouter' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lime)]">
                    CONNECT OPENROUTER (1-CLICK OAUTH PKCE OR API KEY)
                  </span>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--lime)] underline decoration-dashed underline-offset-2"
                  >
                    OpenRouter Keys -&gt;
                  </a>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={startOpenRouterOAuth}
                    className="px-4 py-2 bg-[var(--g2-phosphor)] text-[#0a0a0a] font-semibold cursor-pointer"
                  >
                    1-Click Sign in with OpenRouter (Zero Manual Key)
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    placeholder="sk-or-v1-..."
                    value={openRouterKey}
                    onChange={(e) => setOpenRouterKey(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                  <select
                    value={openRouterModel}
                    onChange={(e) => setOpenRouterModel(e.target.value)}
                    aria-label="OpenRouter model"
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  >
                    <option value="openrouter/free">openrouter/free (Auto Best Free)</option>
                    <option value="google/gemma-4-26b-a4b-it:free">google/gemma-4-26b-a4b-it:free</option>
                    <option value="anthropic/claude-3.5-haiku">anthropic/claude-3.5-haiku</option>
                  </select>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void postConnect(
                      { provider: 'openrouter', apiKey: openRouterKey, model: openRouterModel },
                      'OpenRouter connected & set active.',
                    )
                  }
                  className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
                >
                  Connect OpenRouter
                </button>
              </>
            )}

            {openDrawer === 'chatgpt' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lime)]">
                    CONNECT CHATGPT (ACCOUNT CLI OR OPTIONAL API KEY)
                  </span>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--lime)] underline decoration-dashed underline-offset-2"
                  >
                    OpenAI Keys -&gt;
                  </a>
                </div>
                <p className="text-[11px] text-[var(--lightgray)]">
                  No API credits needed: OpenRouter 1-Click OAuth or OpenAI Codex CLI (<code className="text-[var(--bright)]">codex login</code>) uses your existing ChatGPT account.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={openAiKey}
                    onChange={(e) => setOpenAiKey(e.target.value)}
                    className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postConnect({ provider: 'chatgpt', apiKey: openAiKey }, 'ChatGPT connected & set active.')}
                    className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
                  >
                    Connect ChatGPT
                  </button>
                </div>
              </>
            )}

            {openDrawer === 'grok' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]">
                    CONNECT GROK (XAI GROK-3-MINI)
                  </span>
                  <a
                    href="https://console.x.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--lime)] underline decoration-dashed underline-offset-2"
                  >
                    xAI Console -&gt;
                  </a>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="password"
                    placeholder="xai-..."
                    value={grokKey}
                    onChange={(e) => setGrokKey(e.target.value)}
                    className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void postConnect({ provider: 'grok', apiKey: grokKey }, 'Grok (xAI) connected & set active.')}
                    className="px-4 py-2 bg-[var(--g2-phosphor)] text-[#0a0a0a] font-semibold cursor-pointer"
                  >
                    Connect Grok
                  </button>
                </div>
              </>
            )}

            {openDrawer === 'omniroute' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[#86FFAF]">
                    CONNECT OMNIROUTE (1,400+ MODELS UNIVERSAL GATEWAY)
                  </span>
                  <span className="text-[11px] text-[var(--lightgray)]">Default local proxy: 127.0.0.1:20128/v1</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="http://127.0.0.1:20128/v1"
                    value={omniRouteUrl}
                    onChange={(e) => setOmniRouteUrl(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                  <input
                    type="text"
                    placeholder="Model (e.g. auto)"
                    value={omniRouteModel}
                    onChange={(e) => setOmniRouteModel(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                  <input
                    type="password"
                    placeholder="Optional OmniRoute Bearer token"
                    value={omniRouteKey}
                    onChange={(e) => setOmniRouteKey(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void postConnect(
                      { provider: 'omniroute', baseUrl: omniRouteUrl, apiKey: omniRouteKey, model: omniRouteModel },
                      'OmniRoute gateway linked & set active.',
                    )
                  }
                  className="px-4 py-2 bg-[var(--g2-phosphor)] text-[#0a0a0a] font-semibold cursor-pointer"
                >
                  Connect OmniRoute
                </button>
              </>
            )}

            {openDrawer === 'telegram' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[#26A5E4]">
                    CONNECT TELEGRAM BOT (TRACK 01 + BEST TELEGRAM PRIZE)
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href="https://t.me/onq_g2_copilot_bot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[var(--lime)] underline decoration-dashed underline-offset-2"
                    >
                      1-Click Open @onq_g2_copilot_bot -&gt;
                    </a>
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#26A5E4] underline decoration-dashed underline-offset-2"
                    >
                      @BotFather -&gt;
                    </a>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    placeholder="Telegram Bot Token (123456:ABC...)"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                  <input
                    type="text"
                    placeholder="Chat ID (optional — auto-detected from bot)"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void postConnect(
                      { provider: 'telegram', telegramBotToken, telegramChatId },
                      'Telegram Bot connected cleanly in AES-256-GCM 0600 vault.',
                    )
                  }
                  className="retro-btn-primary px-4 py-2 cursor-pointer"
                >
                  Save &amp; Connect Telegram
                </button>
              </>
            )}

            {openDrawer === 'assemblyai' && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lime)]">
                    ASSEMBLYAI VOICE &amp; EARBUDS OUTPUT
                  </span>
                  <a
                    href="https://www.assemblyai.com/app/account"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--lime)] underline decoration-dashed underline-offset-2"
                  >
                    AssemblyAI Dashboard -&gt;
                  </a>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    placeholder="Optional AssemblyAI key (local Whisper works at $0)"
                    value={aaiKey}
                    onChange={(e) => setAaiKey(e.target.value)}
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  />
                  <select
                    value={ttsVoiceId}
                    onChange={(e) => onChangeTtsVoice(e.target.value)}
                    aria-label="Companion Earbuds TTS Voice"
                    className="bg-[var(--ink)] border border-[var(--hairline)] px-3 py-2 text-[var(--bright)]"
                  >
                    <option value="aai-kyla">aai-kyla (Default)</option>
                    <option value="aai-titus">aai-titus</option>
                    <option value="aai-audrey">aai-audrey</option>
                    <option value="aai-sara">aai-sara</option>
                    <option value="aai-ewald">aai-ewald</option>
                  </select>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void postConnect({ provider: 'assemblyai', apiKey: aaiKey }, 'AssemblyAI voice updated.')}
                  className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
                >
                  Save Voice Connector
                </button>
              </>
            )}
          </div>
        )}

        {feedback && (
          <p className="text-xs text-[var(--verified)] border border-dashed border-[var(--hairline)] bg-[var(--surface)] px-4 py-2.5" role="status">
            {feedback}
          </p>
        )}

        {/* Zero-API-Key Local Computer & Account-Authenticated AI Tools */}
        {computerTools.length > 0 && (
          <div className="retro-glass-panel p-4 sm:p-5 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]">
                COMPUTER &amp; ACCOUNT-AUTH AI TOOLS (ZERO API KEYS REQUIRED)
              </span>
              <span className="font-pixel text-[9px] text-[var(--lightgray)]">
                {computerTools.filter((t) => t.installed).length}/{computerTools.length} DETECTED ON PATH
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {computerTools.map((tool) => (
                <div
                  key={tool.id}
                  className={`border px-3 py-2 bg-black/50 space-y-1 ${
                    tool.installed ? 'border-[var(--g2-phosphor)]/45' : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-semibold text-[var(--bright)] truncate">{tool.name}</span>
                    <span
                      className={`font-pixel text-[8px] px-1.5 py-0.5 rounded shrink-0 ${
                        tool.installed
                          ? 'bg-[var(--g2-phosphor)]/15 text-[var(--g2-phosphor)]'
                          : 'bg-white/5 text-[var(--lightgray)]'
                      }`}
                    >
                      {tool.installed ? 'DETECTED' : 'ACCOUNT CLI'}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-[var(--lightgray)] truncate">{tool.accountMode}</div>
                  {!tool.installed && (
                    <code className="block text-[9.5px] text-[var(--lime)]/90 truncate">{tool.installHint}</code>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-1 text-xs text-[var(--lightgray)]">
          <button
            type="button"
            onClick={async () => {
              const next = !showPhysicalPair;
              setShowPhysicalPair(next);
              if (next && !g2Code) {
                const res = await fetch('/api/pair/start', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mode: 'LIVE' }),
                });
                const j = (await res.json()) as { code?: string };
                if (j.code) setG2Code(j.code);
              }
            }}
            className="inline-flex items-center gap-2 hover:text-[var(--bright)] underline decoration-dashed underline-offset-4 cursor-pointer"
          >
            <EvenG2PixelSvg className="w-5 h-3" />
            <span>Link Even G2 Glasses (WebView companion handshake)</span>
          </button>
          {showPhysicalPair && (
            <div className="mt-3 p-4 border border-dashed border-[var(--hairline)] bg-[var(--surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div>
                  Enter 15m handshake code inside Even Hub G2 app:{' '}
                  <strong className="font-pixel text-[var(--lime)]">{g2Code ?? '...'}</strong>
                </div>
                <div className="text-[11px] text-[var(--lightgray)]">
                  Required because Even Realities blocks Google OAuth login inside the G2 WebView. Pair here once; glasses inherit your encrypted session.
                </div>
              </div>
              <span className="shrink-0">
                Bundle: <code className="text-[var(--bright)]">dist/onq.ehpk</code>
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
