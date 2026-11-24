import { useState } from 'react';
import { GlyphDecodeHeading, ScrollReveal } from './MotionPrimitives';
import {
  CalendarPixelSvg,
  DrivePixelSvg,
  EvenG2PixelSvg,
  GmailPixelSvg,
  NotionPixelSvg,
} from './EcosystemIcons';

interface PairingSectionProps {
  sessionToken: string | null;
  mode: 'LIVE' | 'DEMO' | 'STALE';
  onSessionUpdated: (token: string, mode: 'LIVE' | 'DEMO') => void;
  onRevokeSession: () => void;
}

export function PairingSection({
  sessionToken,
  mode,
  onSessionUpdated,
  onRevokeSession,
}: PairingSectionProps) {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [googleAuthUrl, setGoogleAuthUrl] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [notionToken, setNotionToken] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  const [discoveredSchema, setDiscoveredSchema] = useState<string>('');
  const [icsText, setIcsText] = useState('');
  const [statusState, setStatusState] = useState<'idle' | 'loading' | 'error' | 'saved'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [copiedCmd, setCopiedCmd] = useState(false);

  const handleMintCode = async () => {
    setStatusState('loading');
    setStatusMessage('Generating single-use 6-digit pairing code...');
    try {
      const res = await fetch('/api/pair/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'DEMO' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { code: string; googleAuthUrl: string | null };
      setPairingCode(json.code);
      setManualCode(json.code);
      setGoogleAuthUrl(json.googleAuthUrl);
      setStatusState('idle');
      setStatusMessage('Code minted (15m TTL, 10-attempt lockout). Exchange below or enter on G2.');
    } catch (err) {
      setStatusState('error');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to start pairing');
    }
  };

  const handleExchangeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setStatusState('loading');
    setStatusMessage('Exchanging pairing code for SHA-256 hashed session token...');
    try {
      const res = await fetch('/api/pair/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: manualCode.trim() }),
      });
      const json = (await res.json()) as { sessionToken?: string; mode?: 'LIVE' | 'DEMO'; error?: string };
      if (!res.ok || !json.sessionToken) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      onSessionUpdated(json.sessionToken, json.mode ?? 'DEMO');
      setStatusState('saved');
      setStatusMessage('Paired cleanly. Opaque Bearer session active.');
    } catch (err) {
      setStatusState('error');
      setStatusMessage(err instanceof Error ? err.message : 'Pairing exchange failed');
    }
  };

  const handleInspectNotion = async () => {
    if (!sessionToken || !notionToken.trim() || !notionDbId.trim()) {
      setStatusState('error');
      setStatusMessage('Active session, Notion token, and Database ID are required to inspect schema.');
      return;
    }
    setStatusState('loading');
    setStatusMessage('Inspecting Notion database properties...');
    try {
      const res = await fetch('/api/pair/inspect-notion', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notionToken: notionToken.trim(), notionDatabaseId: notionDbId.trim() }),
      });
      const json = (await res.json()) as {
        schema?: { titleProp: string; dateProp?: string; completionProp?: string; completionKind?: string };
        error?: string;
      };
      if (!res.ok || !json.schema) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDiscoveredSchema(
        `title="${json.schema.titleProp}", date="${json.schema.dateProp ?? 'none'}", done="${json.schema.completionProp ?? 'none'}" (${json.schema.completionKind ?? 'n/a'})`,
      );
      setStatusState('saved');
      setStatusMessage('Notion schema auto-discovered cleanly.');
    } catch (err) {
      setStatusState('error');
      setStatusMessage(err instanceof Error ? err.message : 'Notion inspection failed');
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) {
      setStatusState('error');
      setStatusMessage('Start or exchange a pairing session first before saving workspace credentials.');
      return;
    }
    if (!notionToken.trim() || !notionDbId.trim()) {
      setStatusState('error');
      setStatusMessage('Enter both a Notion integration token and a Notion database ID.');
      return;
    }
    setStatusState('loading');
    setStatusMessage('Encrypting tokens into mode-0600 AES-256-GCM local vault...');
    try {
      const res = await fetch('/api/pair/credentials', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notionToken: notionToken.trim(),
          notionDatabaseId: notionDbId.trim(),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; sessionToken?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNotionToken('');
      if (json.sessionToken) onSessionUpdated(json.sessionToken, 'LIVE');
      setStatusState('saved');
      setStatusMessage('Notion credentials encrypted in local vault (mode 0600) and LIVE mode active.');
    } catch (err) {
      setStatusState('error');
      setStatusMessage(err instanceof Error ? err.message : 'Credential save failed');
    }
  };

  const handleImportIcs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !icsText.trim()) {
      setStatusState('error');
      setStatusMessage('Paste valid .ics calendar VEVENT text first.');
      return;
    }
    setStatusState('loading');
    setStatusMessage('Parsing RFC 5545 .ics events into live corridor...');
    try {
      const res = await fetch('/api/pair/ics', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ icsText: icsText.trim() }),
      });
      const json = (await res.json()) as { count?: number; sessionToken?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.sessionToken) onSessionUpdated(json.sessionToken, 'LIVE');
      setStatusState('saved');
      setStatusMessage(`Imported ${json.count ?? 0} real VEVENT(s) into LIVE corridor.`);
    } catch (err) {
      setStatusState('error');
      setStatusMessage(err instanceof Error ? err.message : 'ICS import failed');
    }
  };

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText('npm ci && npm test && npm run build && npm run pack');
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      setCopiedCmd(false);
    }
  };

  return (
    <section id="pair" className="section-rule py-20 sm:py-28">
      <div className="container-page grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left: Onboarding & Local Run CLI */}
        <ScrollReveal className="lg:col-span-5 space-y-6">
          <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lightgray)]">
            LIVE PAIRING &amp; CREDENTIALS
          </p>
          <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem]">
            <span className="block text-[var(--lightgray)]">Zero keys in glasses.</span>
            <GlyphDecodeHeading text="Pair from your phone." className="block text-[var(--bright)]" />
          </h2>
          <p className="text-sm leading-relaxed text-[var(--lightgray)]">
            OAuth runs in your phone browser via a 15-minute 6-digit code, keeping AES-256-GCM refresh
            tokens on your local relay at mode 0600. Or paste any .ics feed without credentials.
          </p>

          <div className="border border-dashed border-[var(--hairline)] bg-[var(--surface)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lightgray)]">
                FRESH CLONE COMMAND
              </span>
              <button
                type="button"
                onClick={handleCopyCli}
                className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lightgray)] hover:text-[var(--lime)] px-2 py-1 border border-[var(--hairline)] cursor-pointer"
              >
                {copiedCmd ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <pre className="text-xs leading-relaxed text-[var(--bright)] overflow-x-auto">
              npm ci &amp;&amp; npm test &amp;&amp; npm run build &amp;&amp; npm run pack
            </pre>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleMintCode}
              className="px-5 py-3 bg-[var(--bright)] text-[var(--ink)] hover:bg-[var(--lime)] font-plex text-sm font-medium transition-colors cursor-pointer"
            >
              Mint 6-Digit Pairing Code
            </button>
            {sessionToken && (
              <button
                type="button"
                onClick={onRevokeSession}
                className="px-5 py-3 border border-[var(--hairline)] text-[var(--bright)] hover:border-[var(--danger)] hover:text-[var(--danger)] font-plex text-sm transition-colors cursor-pointer"
              >
                Revoke Session
              </button>
            )}
          </div>
        </ScrollReveal>

        {/* Right: Interactive Pairing, Notion Auto-Schema, and .ics Import */}
        <ScrollReveal delay={0.06} className="lg:col-span-7 border border-dashed border-[var(--hairline)] bg-[var(--surface)]">
          <div className="p-6 border-b border-dashed border-[var(--hairline)] flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lightgray)]">
                SESSION STATUS
              </span>
              <p className="text-sm text-[var(--bright)] mt-1">
                {sessionToken
                  ? `Active (${mode} mode) | Bearer ${sessionToken.slice(0, 10)}...`
                  : 'No paired session yet. Mint a code or run Sandbox DEMO.'}
              </p>
            </div>
            {pairingCode && (
              <div className="border border-[var(--lime)] bg-[var(--lime-deep)] px-4 py-2">
                <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)] block">
                  PAIR CODE (15M TTL)
                </span>
                <span className="font-dots text-2xl font-black text-[var(--lime)]">{pairingCode}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleExchangeCode} className="p-6 border-b border-dashed border-[var(--hairline)] space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="pair-code-input" className="inline-flex items-center gap-2 font-pixel text-xs uppercase tracking-[0.18em] text-[var(--bright)]">
                <EvenG2PixelSvg className="w-5 h-3" />
                <span>01. EXCHANGE 6-DIGIT PAIRING CODE</span>
              </label>
              <span className="font-pixel text-[10px] uppercase tracking-[0.15em] text-[var(--lime)] border border-[var(--lime)] px-2 py-0.5">
                LOCKOUT AT 10 TRIES
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="pair-code-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter 6-digit code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-4 py-2.5 text-sm text-[var(--bright)] placeholder:text-[var(--lightgray)]"
              />
              <button
                type="submit"
                disabled={statusState === 'loading'}
                className="px-5 py-2.5 border border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--ink)] font-plex text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                Exchange Code
              </button>
            </div>
          </form>

          <form onSubmit={handleSaveCredentials} className="p-6 border-b border-dashed border-[var(--hairline)] space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 flex-wrap font-pixel text-xs uppercase tracking-[0.18em] text-[var(--bright)]">
                <CalendarPixelSvg className="w-4 h-4" />
                <GmailPixelSvg className="w-4 h-4" />
                <DrivePixelSvg className="w-4 h-4" />
                <NotionPixelSvg className="w-4 h-4" />
                <span>02. CONNECT LIVE NOTION &amp; GOOGLE WORKSPACE</span>
              </span>
              {googleAuthUrl ? (
                <a
                  href={googleAuthUrl}
                  className="font-pixel text-[10px] uppercase tracking-[0.18em] text-[var(--lime)] underline"
                >
                  Open Google OAuth
                </a>
              ) : (
                <span className="font-pixel text-[10px] uppercase tracking-[0.15em] text-[var(--lightgray)]">
                  BYO GOOGLE_CLIENT_ID OPTIONAL
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                aria-label="Notion integration token"
                placeholder="Notion token (ntn_...)"
                value={notionToken}
                onChange={(e) => setNotionToken(e.target.value)}
                className="bg-[var(--ink)] border border-[var(--hairline)] px-4 py-2.5 text-sm text-[var(--bright)] placeholder:text-[var(--lightgray)]"
              />
              <input
                type="text"
                aria-label="Notion database ID"
                placeholder="Notion database ID"
                value={notionDbId}
                onChange={(e) => setNotionDbId(e.target.value)}
                className="bg-[var(--ink)] border border-[var(--hairline)] px-4 py-2.5 text-sm text-[var(--bright)] placeholder:text-[var(--lightgray)]"
              />
            </div>
            {discoveredSchema && (
              <div className="text-xs text-[var(--verified)] border border-[var(--hairline)] bg-[var(--ink)] p-2.5">
                Auto-discovered schema: {discoveredSchema}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleInspectNotion()}
                disabled={statusState === 'loading'}
                className="px-4 py-2 border border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--ink)] font-plex text-xs cursor-pointer disabled:opacity-50"
              >
                Test Notion Auto-Schema
              </button>
              <button
                type="submit"
                disabled={statusState === 'loading'}
                className="px-5 py-2 border border-[var(--hairline)] text-[var(--bright)] hover:border-[var(--bright)] font-plex text-xs cursor-pointer disabled:opacity-50"
              >
                Save to 0600 Vault
              </button>
            </div>
          </form>

          <form onSubmit={handleImportIcs} className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-pixel text-xs uppercase tracking-[0.18em] text-[var(--bright)]">
                <CalendarPixelSvg className="w-4 h-4" />
                <span>03. ZERO-CONFIG .ICS CALENDAR IMPORT</span>
              </span>
              <span className="font-pixel text-[10px] text-[var(--lightgray)]">RFC 5545</span>
            </div>
            <textarea
              rows={3}
              aria-label="Paste ICS calendar VEVENT text"
              placeholder="Paste BEGIN:VCALENDAR ... END:VCALENDAR (optional: loads your own real schedule into LIVE mode without OAuth)"
              value={icsText}
              onChange={(e) => setIcsText(e.target.value)}
              className="w-full bg-[var(--ink)] border border-[var(--hairline)] p-3 text-xs text-[var(--bright)] placeholder:text-[var(--lightgray)]"
            />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <button
                type="submit"
                disabled={statusState === 'loading'}
                className="px-4 py-2 border border-[var(--hairline)] text-[var(--bright)] hover:border-[var(--lime)] hover:text-[var(--lime)] text-xs cursor-pointer disabled:opacity-50"
              >
                Import .ics to Live Lens
              </button>
              <span
                role="status"
                className={`text-xs ${
                  statusState === 'error'
                    ? 'text-[var(--danger)]'
                    : statusState === 'saved'
                      ? 'text-[var(--verified)]'
                      : 'text-[var(--lightgray)]'
                }`}
              >
                {statusMessage || 'Empty form: DEMO sandbox works immediately with zero credentials.'}
              </span>
            </div>
          </form>
        </ScrollReveal>
      </div>
    </section>
  );
}
