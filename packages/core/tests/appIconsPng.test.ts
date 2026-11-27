import { describe, expect, it } from 'vitest';
import {
  createInitialHudState,
  renderAppBadgePng,
  renderPixelAvatar,
  resolveHudBadgeKind,
  type AppBadgeKind,
  type CorridorCard,
} from '../src/index.js';

const ALL_BADGES: AppBadgeKind[] = [
  'calendar_gmail',
  'notion',
  'telegram',
  'pc_ai_host',
  'onq_os',
  'coding_pr',
  'career_pack',
  'safety_no',
  'conflict_409',
  'receipt_ok',
  'killswitch_423',
  'stale_offline',
  'focus_music',
];

function makeCard(id: string, kind: CorridorCard['kind'], title: string): CorridorCard {
  return {
    id,
    sourceMode: 'DEMO',
    syncedAtIso: '2026-11-27T14:00:00.000Z',
    provenanceLabel: 'SAMPLE',
    kind,
    title,
    timeMeta: 'NOW',
    startIso: '2026-11-27T14:00:00.000Z',
    endIso: '2026-11-27T14:30:00.000Z',
    contextLine1: 'Line 1',
    contextLine2: 'Line 2',
    triageRule: 'IMMINENT_MTG',
    etag: 'e1',
    quickActions: [],
  };
}

describe('appIconsPng.ts', () => {
  it('renders valid 76x76 4-bit Gray4 PNGs with >= 70% dark waveguide budget for every badge', () => {
    for (const kind of ALL_BADGES) {
      const stats = renderAppBadgePng(kind, { size: 76, cardIndex: 1, cardTotal: 5 });
      expect(stats.width).toBe(76);
      expect(stats.height).toBe(76);
      // PNG signature
      expect(Array.from(stats.pngBytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      // IHDR width=76, height=76, bitDepth=4, colorType=0
      expect(stats.pngBytes[24]).toBe(4);
      expect(stats.pngBytes[25]).toBe(0);
      expect(stats.blackPixelRatio).toBeGreaterThanOrEqual(0.7);
      expect(stats.blackPixelRatio).toBeLessThan(0.99);
    }
  });

  it('resolves badge kinds accurately across corridor cards, phases, and LiveUI titles', () => {
    const cards: CorridorCard[] = [
      makeCard('card-vc', 'MEETING', 'Investor call'),
      makeCard('card-notion', 'NOTION_DUE', 'Design review checklist'),
      makeCard('card-telegram-bridge', 'EMAIL_ASK', 'TELEGRAM | Founders'),
      makeCard('card-computer-proactive', 'MEETING', 'PC Host: Ollama'),
      makeCard('card-unified-os', 'MEETING', 'OnQ OS | L0-L5'),
    ];
    expect(resolveHudBadgeKind(createInitialHudState(cards, 'DEMO'))).toBe('calendar_gmail');
    expect(resolveHudBadgeKind({ ...createInitialHudState(cards, 'DEMO'), selectedCardIndex: 1 })).toBe('notion');
    expect(resolveHudBadgeKind({ ...createInitialHudState(cards, 'DEMO'), selectedCardIndex: 2 })).toBe('telegram');
    expect(resolveHudBadgeKind({ ...createInitialHudState(cards, 'DEMO'), selectedCardIndex: 3 })).toBe('pc_ai_host');
    expect(resolveHudBadgeKind({ ...createInitialHudState(cards, 'DEMO'), selectedCardIndex: 4 })).toBe('onq_os');

    expect(resolveHudBadgeKind({ ...createInitialHudState(cards, 'DEMO'), phase: 'preview' })).toBe('safety_no');
    expect(resolveHudBadgeKind({ ...createInitialHudState(cards, 'DEMO'), phase: 'conflict' })).toBe('conflict_409');
    expect(resolveHudBadgeKind({ ...createInitialHudState(cards, 'DEMO'), phase: 'done' })).toBe('receipt_ok');
    expect(resolveHudBadgeKind({ ...createInitialHudState(cards, 'STALE'), phase: 'stale' })).toBe('stale_offline');

    expect(resolveHudBadgeKind(createInitialHudState(cards, 'DEMO'), 'L4 CREW: SOFTWARE_DELIVERY / CODING_PR_GATE')).toBe('coding_pr');
    expect(resolveHudBadgeKind(createInitialHudState(cards, 'DEMO'), 'CAREER_PACK')).toBe('career_pack');
    expect(resolveHudBadgeKind(createInitialHudState(cards, 'DEMO'), 'GLOBAL KILL SWITCH')).toBe('killswitch_423');
    expect(resolveHudBadgeKind(createInitialHudState(cards, 'DEMO'), 'MUSIC FOCUS')).toBe('focus_music');
  });

  it('renders minimal monochrome Voice Orb 4-bit Gray4 PNG with >= 75% optical black budget', () => {
    for (const st of ['idle', 'listening', 'speaking', 'thinking', 'conflict'] as const) {
      const orb = renderPixelAvatar(st, { style: 'orb', tick: 3, rmsLevel: 0.6, size: 76 });
      expect(orb.width).toBe(76);
      expect(orb.height).toBe(76);
      expect(Array.from(orb.pngBytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(orb.pngBytes[24]).toBe(4);
      expect(orb.pngBytes[25]).toBe(0);
      expect(orb.blackPixelRatio).toBeGreaterThanOrEqual(0.75);
      expect(orb.blackPixelRatio).toBeLessThan(0.99);
    }
  });
});
