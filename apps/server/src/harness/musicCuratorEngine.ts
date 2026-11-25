import { clipLine42 } from '@onq/core';
import type { LiveUiSurface } from '@onq/core';

export type MusicMood = 'deep_focus' | 'coding' | 'gym' | 'commute' | 'wind_down';

export interface CuratedTrack {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  previewUrl?: string;
  artworkUrl?: string;
  trackViewUrl?: string;
  source: 'itunes_live' | 'spotify_live' | 'catalog_offline';
}

export interface MusicFocusSession {
  sessionId: string;
  mood: MusicMood;
  query: string;
  durationMin: number;
  totalTrackSec: number;
  tracks: CuratedTrack[];
  catalogStatus: 'LIVE_ITUNES' | 'LIVE_SPOTIFY' | 'OFFLINE_FALLBACK';
  spotifyNote: string;
  autoPlayBlocked: true;
  confirmedPlayback: boolean;
  createdAtIso: string;
  g2Lines: string[];
}

const MOOD_QUERY_MAP: Record<MusicMood, string> = {
  deep_focus: 'ambient instrumental study focus',
  coding: 'synthwave lofi instrumental coding',
  gym: 'workout electronic running energy',
  commute: 'indie acoustic chill',
  wind_down: 'piano sleep calm',
};

const SPOTIFY_NOTE =
  'iTunes live free catalog active (0 API keys). Connect Spotify OAuth for Spotify library; Spotify playback control requires Spotify Premium.';

export function parseMusicMood(input?: string): MusicMood {
  const lower = (input ?? '').toLowerCase();
  if (/gym|workout|run|lift|cardio|fitness/.test(lower)) return 'gym';
  if (/code|coding|hack|build|dev|synth/.test(lower)) return 'coding';
  if (/commute|walk|train|drive|chill/.test(lower)) return 'commute';
  if (/sleep|calm|night|wind|relax|rest/.test(lower)) return 'wind_down';
  return 'deep_focus';
}

export function buildMusicFocusLiveUi(session: MusicFocusSession): LiveUiSurface {
  const durationSec = Math.max(60, Math.round(session.durationMin * 60));
  const rows =
    session.tracks.length > 0
      ? session.tracks.slice(0, 5).map((t, idx) => ({
          id: t.trackId || `trk_${idx}`,
          cells: {
            title: `${t.title} - ${t.artist}`.slice(0, 36),
            dur: `${Math.floor(t.durationSec / 60)}m`,
          },
          raw: [`${idx + 1}. ${t.title} - ${t.artist}`.slice(0, 38)],
        }))
      : [
          {
            id: 'offline',
            cells: { title: 'Offline - connect internet for live catalog' },
            raw: ['Offline - connect internet for live tracks'],
          },
        ];

  return {
    id: session.sessionId,
    title: `Focus: ${session.mood.replace('_', ' ').toUpperCase()} (${session.durationMin}m)`,
    frame: 'stack',
    presetKey: 'music_focus',
    repairedCodes: [],
    vars: {
      mood: session.mood,
      catalog: session.catalogStatus,
    },
    updatedAtIso: session.createdAtIso,
    components: [
      {
        id: 'focus_timer',
        kind: 'timer',
        region: 'top',
        label: `Focus Block (${session.durationMin}m)`,
        timer: {
          mode: 'countdown',
          durationSec,
          remainingSec: durationSec,
          status: 'paused',
          updatedAtMs: Date.parse(session.createdAtIso) || Date.now(),
        },
      },
      {
        id: 'focus_tracks',
        kind: 'list',
        region: 'main',
        label: 'Curated Queue (Tap to preview on phone)',
        selectedIndex: 0,
        rows,
      },
    ],
  };
}

/**
 * Free real-catalog Music Curator & Focus Session Engine.
 * Queries live public Apple iTunes Search API (zero API key required) or optional
 * Spotify Web API token, never fabricates live tracks offline, and never auto-plays.
 */
export class MusicCuratorEngine {
  private lastSession: MusicFocusSession | null = null;

  constructor(private readonly nowFn: () => number = () => Date.now()) {}

  getLastSession(): MusicFocusSession | null {
    return this.lastSession ? { ...this.lastSession, tracks: [...this.lastSession.tracks] } : null;
  }

  async curateSession(params: {
    mood?: MusicMood;
    query?: string;
    durationMin?: number;
    fetchImpl?: typeof fetch;
    spotifyToken?: string;
  }): Promise<MusicFocusSession> {
    const mood = params.mood ?? parseMusicMood(params.query);
    const searchQuery = params.query?.trim() || MOOD_QUERY_MAP[mood];
    const durationMin = Math.min(180, Math.max(5, Math.round(params.durationMin ?? 45)));
    const nowIso = new Date(this.nowFn()).toISOString();
    const fetchFn = params.fetchImpl ?? fetch;

    let tracks: CuratedTrack[] = [];
    let catalogStatus: MusicFocusSession['catalogStatus'] = 'OFFLINE_FALLBACK';

    if (params.spotifyToken?.trim()) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetchFn(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=6`,
          {
            headers: { Authorization: `Bearer ${params.spotifyToken.trim()}` },
            signal: ctrl.signal,
          },
        );
        if (res.ok) {
          const json = (await res.json()) as {
            tracks?: {
              items?: Array<{
                id?: string;
                name?: string;
                duration_ms?: number;
                preview_url?: string | null;
                external_urls?: { spotify?: string };
                artists?: Array<{ name?: string }>;
                album?: { name?: string; images?: Array<{ url?: string }> };
              }>;
            };
          };
          tracks = (json.tracks?.items ?? [])
            .filter((it) => it.name)
            .map((it, idx) => ({
              trackId: String(it.id ?? `sp_${idx}`),
              title: String(it.name ?? 'Untitled'),
              artist: String(it.artists?.[0]?.name ?? 'Unknown Artist'),
              album: String(it.album?.name ?? 'Spotify'),
              durationSec: Math.max(1, Math.round((it.duration_ms ?? 180_000) / 1000)),
              previewUrl: it.preview_url ?? undefined,
              artworkUrl: it.album?.images?.[0]?.url,
              trackViewUrl: it.external_urls?.spotify,
              source: 'spotify_live' as const,
            }));
          if (tracks.length > 0) {
            catalogStatus = 'LIVE_SPOTIFY';
          }
        }
      } catch {
        // Fall through to free live iTunes Search catalog
      } finally {
        clearTimeout(timer);
      }
    }

    if (tracks.length === 0) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetchFn(
          `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&media=music&entity=song&limit=6`,
          { signal: ctrl.signal },
        );
        if (res.ok) {
          const json = (await res.json()) as {
            results?: Array<{
              trackId?: number;
              trackName?: string;
              artistName?: string;
              collectionName?: string;
              trackTimeMillis?: number;
              previewUrl?: string;
              artworkUrl100?: string;
              trackViewUrl?: string;
            }>;
          };
          tracks = (json.results ?? [])
            .filter((r) => Boolean(r.trackName))
            .slice(0, 6)
            .map((r, idx) => ({
              trackId: String(r.trackId ?? `it_${idx}`),
              title: String(r.trackName ?? 'Track'),
              artist: String(r.artistName ?? 'Artist'),
              album: String(r.collectionName ?? 'Single'),
              durationSec: Math.max(1, Math.round((r.trackTimeMillis ?? 180_000) / 1000)),
              previewUrl: r.previewUrl,
              artworkUrl: r.artworkUrl100,
              trackViewUrl: r.trackViewUrl,
              source: 'itunes_live' as const,
            }));
          if (tracks.length > 0) {
            catalogStatus = 'LIVE_ITUNES';
          }
        }
      } catch {
        catalogStatus = 'OFFLINE_FALLBACK';
        tracks = [];
      } finally {
        clearTimeout(timer);
      }
    }

    const totalTrackSec = tracks.reduce((acc, t) => acc + t.durationSec, 0);
    const first = tracks[0];
    const second = tracks[1];
    const g2Lines = [
      clipLine42(`MUSIC | ${mood.toUpperCase()} ${durationMin}M`),
      first
        ? clipLine42(`1. ${first.title} - ${first.artist}`)
        : clipLine42('OFFLINE: No live catalog results'),
      second
        ? clipLine42(`2. ${second.title} - ${second.artist}`)
        : clipLine42(`SRC: ${catalogStatus}`),
      clipLine42('CONFIRM TO PLAY (NO AUTO-PLAY)'),
    ];

    const session: MusicFocusSession = {
      sessionId: `mus_${this.nowFn().toString(36)}`,
      mood,
      query: searchQuery,
      durationMin,
      totalTrackSec,
      tracks,
      catalogStatus,
      spotifyNote: SPOTIFY_NOTE,
      autoPlayBlocked: true,
      confirmedPlayback: false,
      createdAtIso: nowIso,
      g2Lines,
    };

    this.lastSession = session;
    return { ...session, tracks: [...session.tracks] };
  }
}
