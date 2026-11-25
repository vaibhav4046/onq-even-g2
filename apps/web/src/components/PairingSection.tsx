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
    setStatusMessage('Getting your code...');
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
      setStatusMessage('Code ready. Enter it below or on your glasses.');
    } catch (err) {
      setStatusState('error');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to start pairing');
    }
  };

  const handleExchangeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setStatusState('loading');
    setStatusMessage('Pairing...');
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
      setStatusMessage('Paired.');
    } catch (err) {
      setStatusState('error');
      setStatusMessage(err instanceof Error ? err.message : 'Pairing exchange failed');
    }
  };

  const handleInspectNotion = async () => {
    if (!sessionToken || !notionToken.trim() || !notionDbId.trim()) {
      setStatusState('error');
      setStatusMessage('Pair first, then enter your Notion token and database ID.');
      return;
    }
    setStatusState('loading');
    setStatusMessage('Checking your Notion database...');
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
      setStatusMessage('Notion database found.');
    } catch (err) {
      setStatusState('error');
      setStatusMessage(err instanceof Error ? err.message : 'Notion inspection failed');
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) {
      setStatusState('error');
      setStatusMessage('Pair first, then save your Notion details.');
      return;
    }
    if (!notionToken.trim() || !notionDbId.trim()) {
      setStatusState('error');
      setStatusMessage('Enter your Notion token and database ID.');
      return;
    }
    setStatusState('loading');
    setStatusMessage('Saving...');
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
      setStatusMessage('Saved. Your Notion token is stored encrypted.');
    } catch (err) {
      setStatusState('error');
      setStatusMessage(err instanceof Error ? err.message : 'Credential save failed');
    }
  };

  const handleImportIcs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !icsText.trim()) {
      setStatusState('error');
      setStatusMessage('Paste your .ics calendar text first.');
      return;
    }
    setStatusState('loading');
    setStatusMessage('Importing your calendar...');
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
      setStatusMessage(`Imported ${json.count ?? 0} events.`);
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
            PAIR YOUR GLASSES
          </p>
          <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem]">
            <span className="block text-[var(--lightgray)]">Zero keys in glasses.</span>
            <GlyphDecodeHeading text="Pair from your phone." className="block text-[var(--bright)]" />
          </h2>
          <p className="text-sm leading-relaxed text-[var(--lightgray)]">
            Sign in on your phone with a short code. Your keys never touch the glasses.
          </p>

          <details className="border border-dashed border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--lightgray)]">
            <summary className="cursor-pointer font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--bright)]">
              Engineering &amp; audit
            </summary>
            <ul className="mt-3 space-y-1.5 leading-relaxed list-disc pl-4">
              <li>The pairing code is single-use, expires after 15 minutes and locks after 10 wrong tries.</li>
              <li>The session token is stored as a SHA-256 hash.</li>
              <li>Notion tokens are encrypted with AES-256-GCM in a local vault (file mode 0600).</li>
              <li>Calendar import parses .ics events (RFC 5545).</li>
            </ul>
            <div className="mt-3 flex items-center justify-between gap-2">
              <code className="text-[11px] text-[var(--bright)] overflow-x-auto">
                npm ci &amp;&amp; npm test &amp;&amp; npm run build &amp;&amp; npm run pack
              </code>
              <button
                type="button"
                onClick={handleCopyCli}
                className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lightgray)] hover:text-[var(--lime)] px-2 py-1 border border-[var(--hairline)] cursor-pointer"
              >
                {copiedCmd ? 'COPIED' : 'COPY'}
              </button>
            </div>
          </details>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleMintCode}
              className="px-5 py-3 bg-[var(--bright)] text-[var(--ink)] hover:bg-[var(--lime)] font-plex text-sm font-medium transition-colors cursor-pointer"
            >
              Get pairing code
            </button>
            {sessionToken && (
              <button
                type="button"
                onClick={onRevokeSession}
                className="px-5 py-3 border border-[var(--hairline)] text-[var(--bright)] hover:border-[var(--danger)] hover:text-[var(--danger)] font-plex text-sm transition-colors cursor-pointer"
              >
                End session
              </button>
            )}
          </div>
        </ScrollReveal>

        {/* Right: Interactive Pairing, Notion Auto-Schema, and .ics Import */}
        <ScrollReveal delay={0.06} className="lg:col-span-7 border border-dashed border-[var(--hairline)] bg-[var(--surface)]">
          <div className="p-6 border-b border-dashed border-[var(--hairline)] flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lightgray)]">
                STATUS
              </span>
              <p className="text-sm text-[var(--bright)] mt-1">
                {sessionToken
                  ? `Paired (${mode})`
                  : 'Not paired yet. Get a code, or try the demo.'}
              </p>
            </div>
            {pairingCode && (
              <div className="border border-[var(--lime)] bg-[var(--lime-deep)] px-4 py-2">
                <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-[var(--lime)] block">
                  YOUR CODE
                </span>
                <span className="font-dots text-2xl font-black text-[var(--lime)]">{pairingCode}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleExchangeCode} className="p-6 border-b border-dashed border-[var(--hairline)] space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="pair-code-input" className="inline-flex items-center gap-2 font-pixel text-xs uppercase tracking-[0.18em] text-[var(--bright)]">
                <EvenG2PixelSvg className="w-5 h-3" />
                <span>01. ENTER YOUR CODE</span>
              </label>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="pair-code-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="flex-1 bg-[var(--ink)] border border-[var(--hairline)] px-4 py-2.5 text-sm text-[var(--bright)] placeholder:text-[var(--lightgray)]"
              />
              <button
                type="submit"
                disabled={statusState === 'loading'}
                className="px-5 py-2.5 border border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--ink)] font-plex text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                Pair
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
                <span>02. CONNECT NOTION</span>
              </span>
              {googleAuthUrl ? (
                <a
                  href={googleAuthUrl}
                  className="font-pixel text-[10px] uppercase tracking-[0.18em] text-[var(--lime)] underline"
                >
                  Open Google sign-in
                </a>
              ) : (
                <span className="font-pixel text-[10px] uppercase tracking-[0.15em] text-[var(--lightgray)]">
                  GOOGLE IS OPTIONAL
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                aria-label="Notion integration token"
                placeholder="Notion token"
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
                Found: {discoveredSchema}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleInspectNotion()}
                disabled={statusState === 'loading'}
                className="px-4 py-2 border border-[var(--lime)] text-[var(--lime)] hover:bg-[var(--lime)] hover:text-[var(--ink)] font-plex text-xs cursor-pointer disabled:opacity-50"
              >
                Check Notion
              </button>
              <button
                type="submit"
                disabled={statusState === 'loading'}
                className="px-5 py-2 border border-[var(--hairline)] text-[var(--bright)] hover:border-[var(--bright)] font-plex text-xs cursor-pointer disabled:opacity-50"
              >
                Save securely
              </button>
            </div>
          </form>

          <form onSubmit={handleImportIcs} className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-pixel text-xs uppercase tracking-[0.18em] text-[var(--bright)]">
                <CalendarPixelSvg className="w-4 h-4" />
                <span>03. IMPORT A CALENDAR FILE</span>
              </span>
            </div>
            <textarea
              rows={3}
              aria-label="Paste ICS calendar VEVENT text"
              placeholder="Paste your .ics calendar text (optional)"
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
                Import calendar
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
                {statusMessage || 'The demo works with no sign-in.'}
              </span>
            </div>
          </form>
        </ScrollReveal>
      </div>
    </section>
  );
}
