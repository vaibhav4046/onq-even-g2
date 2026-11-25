import { useCallback, useEffect, useState } from 'react';
import {
  AssemblyAiPixelSvg,
  CalendarPixelSvg,
  ChatGptPixelSvg,
  ClaudePixelSvg,
  DrivePixelSvg,
  EvenG2PixelSvg,
  GmailPixelSvg,
  GooglePixelSvg,
  NotionPixelSvg,
  OpenRouterPixelSvg,
  ShieldPixelSvg,
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
  preferredLlm: 'auto' | 'claude' | 'openrouter' | 'chatgpt' | 'rules';
  openRouterModel: string;
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
    chatgpt: ConnectorCardStatus;
    assemblyai: ConnectorCardStatus;
  };
}

interface ConnectorTestResult {
  ok: boolean;
  provider: string;
  mode: string;
  latencyMs: number;
  detail: string;
}

type ConnectorProviderId =
  | 'googleWorkspace'
  | 'notion'
  | 'claude'
  | 'openrouter'
  | 'chatgpt'
  | 'assemblyai';

type ConnectorDrawerId = null | 'account' | 'bulk' | ConnectorProviderId;

const SANDBOX_NOTION_DB_ID = '423373c508ea81b495c7f09c82c0e809';

const QUICK_SAMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//OnQ//Corridor//EN',
  'BEGIN:VEVENT',
  'UID:onq-live-1@local',
  'SUMMARY:VC Sync - Priya Nair',
  'DTSTART:20261125T140000Z',
  'DTEND:20261125T143000Z',
  'ATTENDEE;CN="Priya Nair":mailto:priya@tvm.example',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:onq-live-2@local',
  'SUMMARY:Product Review - Alex Chen',
  'DTSTART:20261125T151500Z',
  'DTEND:20261125T154500Z',
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
  const [openRouterModel, setOpenRouterModel] = useState('meta-llama/llama-3.2-3b-instruct:free');
  const [openAiKey, setOpenAiKey] = useState('');
  const [aaiKey, setAaiKey] = useState('');

  const [showPhysicalPair, setShowPhysicalPair] = useState(false);
  const [g2Code, setG2Code] = useState<string | null>(null);

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
    if (conn === 'openrouter') {
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

  const startGoogleSignIn = async () => {
    if (status?.googleOAuthConfigured) {
      window.location.href = '/api/auth/google/start';
      return;
    }
    try {
      const res = await fetch('/api/auth/google/start?format=json', { credentials: 'include' });
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
        <span className="inline-flex items-center gap-1.5">
          <GooglePixelSvg className="w-4 h-4" />
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
      icon: <NotionPixelSvg className="w-4 h-4" />,
      state: status?.connectors.notion,
    },
    {
      id: 'claude' as const,
      name: 'Claude',
      sub: 'Grounded Meeting & Reply Drafting',
      icon: <ClaudePixelSvg className="w-4 h-4" />,
      state: status?.connectors.claude,
    },
    {
      id: 'openrouter' as const,
      name: 'OpenRouter',
      sub: 'Multi-Model Free & Pro Failover',
      icon: <OpenRouterPixelSvg className="w-4 h-4" />,
      state: status?.connectors.openrouter,
    },
    {
      id: 'chatgpt' as const,
      name: 'ChatGPT',
      sub: 'OpenAI GPT-4o-mini Backup Route',
      icon: <ChatGptPixelSvg className="w-4 h-4" />,
      state: status?.connectors.chatgpt,
    },
    {
      id: 'assemblyai' as const,
      name: 'AssemblyAI Voice',
      sub: 'Speaker Scribe & Earbuds Audio Out',
      icon: <AssemblyAiPixelSvg className="w-4 h-4" />,
      state: status?.connectors.assemblyai,
    },
  ];

  return (
    <section id="connectors" className="section-rule py-20 sm:py-24">
      <div className="container-page space-y-8">
        <ScrollReveal className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lightgray)]">
              ACCOUNT &amp; CLOUD CONNECTORS
            </p>
            <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.4rem]">
              <span className="block text-[var(--lightgray)]">Connect once.</span>
              <GlyphDecodeHeading text="Runs across G2." className="block text-[var(--bright)]" />
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 border border-dashed border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-2.5 text-xs">
            <ShieldPixelSvg className="w-4 h-4 shrink-0" />
            <div className="space-y-0.5 mr-2">
              <div className="text-[var(--bright)] font-medium">
                {status?.accountName
                  ? `${status.accountName}${status.accountEmail ? ` (${status.accountEmail})` : ''}`
                  : 'AES-256-GCM Local Vault'}
              </div>
              <div className="font-pixel text-[9px] uppercase tracking-[0.14em] text-[var(--g2-phosphor)]">
                {mode === 'DEMO' ? 'SANDBOX' : mode} · {cards.filter((x) => x.state?.connected).length}/6 LIVE · {status?.activeLlmProvider ?? 'Rules Engine'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenDrawer(openDrawer === 'bulk' ? null : 'bulk')}
              className="px-3 py-1.5 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer hover:brightness-105"
            >
              Configure All (Vault)
            </button>
            <button
              type="button"
              onClick={() => void startGoogleSignIn()}
              className="px-3 py-1.5 border border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[#0a0a0a] font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors"
            >
              <GooglePixelSvg className="w-3.5 h-3.5" />
              <span>Sign in with Google</span>
            </button>
            <button
              type="button"
              onClick={startOpenRouterOAuth}
              className="px-3 py-1.5 border border-[var(--g2-phosphor)] text-[var(--g2-phosphor)] hover:bg-[var(--g2-phosphor)] hover:text-[#0a0a0a] font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors"
            >
              <OpenRouterPixelSvg className="w-3.5 h-3.5" />
              <span>1-Click OpenRouter</span>
            </button>
            <button
              type="button"
              onClick={() => setOpenDrawer(openDrawer === 'account' ? null : 'account')}
              className="px-2.5 py-1.5 border border-[var(--hairline)] text-[11px] hover:border-[var(--lime)] hover:text-[var(--lime)] cursor-pointer"
            >
              Router
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSignOut()}
              className="px-2.5 py-1.5 border border-[var(--hairline)] text-[11px] text-[var(--lightgray)] hover:border-[var(--danger)] hover:text-[var(--danger)] cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </ScrollReveal>

        {openDrawer === 'bulk' && (
          <div className="border border-[var(--lime)] bg-[var(--surface)] p-5 space-y-4 text-xs">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
                <span className="font-pixel text-[9px] uppercase text-[var(--lightgray)]">6. ASSEMBLYAI VOICE</span>
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
                      anthropicKey: claudeKey || undefined,
                      openAiKey: openAiKey || undefined,
                      assemblyAiKey: aaiKey || undefined,
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
          <div className="border border-[var(--lime)] bg-[var(--surface)] p-5 space-y-4 text-xs">
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
                <option value="auto">Auto Failover (Claude -&gt; OpenRouter -&gt; ChatGPT -&gt; Rules)</option>
                <option value="claude">Primary: Claude (Failover -&gt; OR -&gt; GPT)</option>
                <option value="openrouter">Primary: OpenRouter (Failover -&gt; Claude -&gt; GPT)</option>
                <option value="chatgpt">Primary: ChatGPT (Failover -&gt; Claude -&gt; OR)</option>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px border border-dashed border-[var(--hairline)] bg-[var(--hairline)]">
          {cards.map((c) => {
            const connected = Boolean(c.state?.connected);
            const active = openDrawer === c.id;
            const latestProbe = testResults[c.id];
            return (
              <div key={c.id} className="bg-[var(--ink)] p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {c.icon}
                      <span className="font-display text-lg font-bold text-[var(--bright)]">{c.name}</span>
                    </div>
                    <span
                      className={`font-pixel text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border ${
                        connected
                          ? 'border-[var(--g2-phosphor)] text-[var(--g2-phosphor)]'
                          : 'border-[var(--hairline)] text-[var(--lightgray)]'
                      }`}
                    >
                      {c.state?.mode ?? 'READY'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--lightgray)]">{c.sub}</p>
                  <p className="text-[11px] text-[var(--bright)]/80">{c.state?.detail ?? 'Encrypted local relay ready.'}</p>
                  {latestProbe && (
                    <div
                      className={`text-[10px] font-pixel uppercase tracking-[0.1em] px-2 py-1 border ${
                        latestProbe.ok
                          ? 'border-[var(--verified)]/50 text-[var(--verified)] bg-[var(--surface)]'
                          : 'border-[var(--danger)]/50 text-[var(--danger)] bg-[var(--surface)]'
                      }`}
                    >
                      {latestProbe.ok ? 'VERIFIED' : 'FAILED'} · {latestProbe.mode} · {latestProbe.latencyMs}ms
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed border-[var(--hairline)]">
                  <button
                    type="button"
                    onClick={() => {
                      if (c.id === 'googleWorkspace' && status?.googleOAuthConfigured && !connected) {
                        void startGoogleSignIn();
                      } else {
                        setOpenDrawer(active ? null : c.id);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                      connected
                        ? 'border border-[var(--hairline)] text-[var(--bright)] hover:border-[var(--lime)]'
                        : 'bg-[var(--bright)] text-[#0a0a0a] hover:bg-[var(--lime)]'
                    }`}
                  >
                    {active ? 'Close' : connected ? 'Configure' : c.id === 'googleWorkspace' ? 'Connect Google' : c.id === 'notion' ? 'Connect Notion' : 'Connect'}
                  </button>
                  <button
                    type="button"
                    disabled={busy || testingId === c.id}
                    onClick={() => void runTestConnection(c.id)}
                    className="px-2.5 py-1.5 border border-[var(--hairline)] text-[11px] text-[var(--lightgray)] hover:text-[var(--verified)] hover:border-[var(--verified)] cursor-pointer"
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

        {openDrawer && openDrawer !== 'account' && (
          <div className="border border-[var(--lime)] bg-[var(--surface)] p-5 space-y-3 text-xs">
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
                    onClick={() => void startGoogleSignIn()}
                    className="px-4 py-2 bg-[var(--lime)] text-[#0a0a0a] font-semibold cursor-pointer"
                  >
                    Sign in with Google OAuth
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
                </div>
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
                    placeholder="Database ID"
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
                    CONNECT CLAUDE (ANTHROPIC)
                  </span>
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--lime)] underline decoration-dashed underline-offset-2"
                  >
                    Get Anthropic Key -&gt;
                  </a>
                </div>
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
                    <option value="meta-llama/llama-3.2-3b-instruct:free">meta-llama/llama-3.2-3b-instruct:free</option>
                    <option value="google/gemini-2.0-flash-exp:free">google/gemini-2.0-flash-exp:free</option>
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
                    CONNECT CHATGPT (OPENAI)
                  </span>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[var(--lime)] underline decoration-dashed underline-offset-2"
                  >
                    Get OpenAI Key -&gt;
                  </a>
                </div>
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
