import { registerSecretForRedaction } from '../logger.js';
import type { EncryptedTokenVault, StoredCredentials } from '../tokenVault.js';

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  etag?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string; displayName?: string; self?: boolean }>;
  attachments?: Array<{ fileId?: string; title?: string }>;
}

export interface GoogleThreadMeta {
  threadId: string;
  historyId: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  snippet: string;
}

const GOOGLE_TIMEOUT_MS = 6000;

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', params.state);
  url.searchParams.set(
    'scope',
    [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/drive.readonly',
    ].join(' '),
  );
  return url.toString();
}

export class GoogleWorkspaceClient {
  constructor(
    private readonly vault: EncryptedTokenVault,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async exchangeAuthorizationCode(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<StoredCredentials> {
    registerSecretForRedaction(params.clientSecret);
    const body = new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    });
    const res = await this.fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`Google OAuth token exchange failed: HTTP ${res.status}`);
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const existing = this.vault.load();
    const next: StoredCredentials = {
      ...existing,
      googleClientId: params.clientId,
      googleClientSecret: params.clientSecret,
      googleAccessToken: json.access_token,
      googleRefreshToken: json.refresh_token ?? existing.googleRefreshToken,
      googleAccessExpiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    this.vault.save(next);
    return next;
  }

  async getAccessToken(): Promise<string> {
    const creds = this.vault.load();
    if (creds.googleAccessToken && creds.googleAccessExpiresAt && Date.now() < creds.googleAccessExpiresAt - 60_000) {
      return creds.googleAccessToken;
    }
    if (!creds.googleRefreshToken || !creds.googleClientId || !creds.googleClientSecret) {
      throw new Error('Google Workspace not paired');
    }
    const body = new URLSearchParams({
      client_id: creds.googleClientId,
      client_secret: creds.googleClientSecret,
      refresh_token: creds.googleRefreshToken,
      grant_type: 'refresh_token',
    });
    const res = await this.fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`Google OAuth refresh failed: HTTP ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in?: number };
    creds.googleAccessToken = json.access_token;
    creds.googleAccessExpiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
    this.vault.save(creds);
    return json.access_token;
  }

  async listUpcomingEvents(timeMinIso: string, timeMaxIso: string): Promise<GoogleCalendarEvent[]> {
    const token = await this.getAccessToken();
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('timeMin', timeMinIso);
    url.searchParams.set('timeMax', timeMaxIso);
    url.searchParams.set('maxResults', '10');
    const res = await this.fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Google Calendar list failed: HTTP ${res.status}`);
    const json = (await res.json()) as { items?: GoogleCalendarEvent[] };
    return json.items ?? [];
  }

  async queryFreeBusy(timeMinIso: string, timeMaxIso: string): Promise<Array<{ start: string; end: string }>> {
    const token = await this.getAccessToken();
    const res = await this.fetchWithTimeout('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        items: [{ id: 'primary' }],
      }),
    });
    if (!res.ok) throw new Error(`Google FreeBusy failed: HTTP ${res.status}`);
    const json = (await res.json()) as {
      calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } };
    };
    return json.calendars?.primary?.busy ?? [];
  }

  async patchEventTime(eventId: string, startIso: string, endIso: string): Promise<string> {
    const token = await this.getAccessToken();
    const res = await this.fetchWithTimeout(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start: { dateTime: startIso },
          end: { dateTime: endIso },
        }),
      },
    );
    if (!res.ok) throw new Error(`Google Calendar patch failed: HTTP ${res.status}`);
    const json = (await res.json()) as { etag?: string };
    return json.etag ?? '';
  }

  async createEvent(summary: string, startIso: string, endIso: string): Promise<{ id: string; etag: string }> {
    const token = await this.getAccessToken();
    const res = await this.fetchWithTimeout(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary,
          start: { dateTime: startIso },
          end: { dateTime: endIso },
        }),
      },
    );
    if (!res.ok) throw new Error(`Google Calendar create failed: HTTP ${res.status}`);
    const json = (await res.json()) as { id: string; etag?: string };
    return { id: json.id, etag: json.etag ?? '' };
  }

  async deleteEvent(eventId: string): Promise<void> {
    const token = await this.getAccessToken();
    const res = await this.fetchWithTimeout(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Google Calendar delete failed: HTTP ${res.status}`);
    }
  }

  async listRecentThreads(query = 'newer_than:2d', maxResults = 5): Promise<GoogleThreadMeta[]> {
    const token = await this.getAccessToken();
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', String(maxResults));
    const res = await this.fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Gmail threads list failed: HTTP ${res.status}`);
    const json = (await res.json()) as { threads?: Array<{ id: string }> };
    const metas: GoogleThreadMeta[] = [];
    for (const item of (json.threads ?? []).slice(0, maxResults)) {
      try {
        metas.push(await this.getThreadMetadata(item.id));
      } catch {
        // skip unreadable thread
      }
    }
    return metas;
  }

  async deleteDraft(draftId: string): Promise<void> {
    const token = await this.getAccessToken();
    const res = await this.fetchWithTimeout(
      `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Gmail draft delete failed: HTTP ${res.status}`);
    }
  }

  async getThreadMetadata(threadId: string): Promise<GoogleThreadMeta> {
    const token = await this.getAccessToken();
    const res = await this.fetchWithTimeout(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Gmail thread get failed: HTTP ${res.status}`);
    const data = (await res.json()) as {
      id: string;
      historyId: string;
      messages?: Array<{
        snippet?: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      }>;
    };
    const latest = data.messages?.[data.messages.length - 1];
    const headers = latest?.payload?.headers ?? [];
    const fromRaw = headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? '';
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';
    const match = fromRaw.match(/^(.*?)\s*<([^>]+)>$/);
    const fromName = match ? match[1].replace(/"/g, '').trim() : fromRaw;
    const fromEmail = match ? match[2].trim() : fromRaw.trim();
    return {
      threadId: data.id,
      historyId: data.historyId,
      fromEmail,
      fromName,
      subject,
      snippet: latest?.snippet ?? '',
    };
  }

  async sendThreadedReply(params: {
    threadId: string;
    bodyText: string;
    draftOnly?: boolean;
  }): Promise<{ mode: 'SENT' | 'DRAFT'; id: string; recipient: string }> {
    // Always fetch authoritative recipient from Gmail thread metadata (never trust client `to`)
    const meta = await this.getThreadMetadata(params.threadId);
    const token = await this.getAccessToken();
    const rfc2822 = [
      `To: ${meta.fromEmail}`,
      `Subject: Re: ${meta.subject.replace(/^Re:\s*/i, '')}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      params.bodyText,
    ].join('\r\n');
    const raw = Buffer.from(rfc2822, 'utf8').toString('base64url');

    const endpoint = params.draftOnly
      ? 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'
      : 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
    const payload = params.draftOnly
      ? { message: { raw, threadId: params.threadId } }
      : { raw, threadId: params.threadId };

    const res = await this.fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Gmail ${params.draftOnly ? 'draft' : 'send'} failed: HTTP ${res.status}`);
    const json = (await res.json()) as { id: string };
    return {
      mode: params.draftOnly ? 'DRAFT' : 'SENT',
      id: json.id,
      recipient: meta.fromEmail,
    };
  }

  async getDriveDocSnippet(fileId: string): Promise<string> {
    const token = await this.getAccessToken();
    const res = await this.fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return '';
    const txt = await res.text();
    return txt.replace(/\s+/g, ' ').trim().slice(0, 500);
  }
}
