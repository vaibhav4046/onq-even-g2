import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { GlyphDecodeHeading, KineticNumber, MOTION_EASE, ScrollReveal } from './MotionPrimitives';

type FlowTabId = 'reschedule' | 'telegram' | 'scribe' | 'wrapup' | 'shield';

interface FlowGraphSpec {
  id: FlowTabId;
  title: string;
  sub: string;
  ask: string;
  steps: Array<{ num: string; label: string; detail: string }>;
  nodes: Array<{ id: string; title: string; role: string; x: number; y: number; tint: string }>;
  edges: Array<{ from: string; to: string; label: string }>;
  answer: string;
}

const FLOW_TABS: FlowGraphSpec[] = [
  {
    id: 'reschedule',
    title: 'Corridor Reschedule',
    sub: 'GCal Free/Busy check + grounded Gmail reply under Default-NO',
    ask: '"OnQ, push VC Sync 15m and tell Priya"',
    steps: [
      { num: '01', label: 'Parse + Free/Busy', detail: 'Chrono + deterministic parser resolves +15m and queries Free/Busy etag.' },
      { num: '02', label: 'Stage Default-NO', detail: 'Single-use 45s previewToken locks cursor on [NO - CANCEL]; Code-Guard checks facts.' },
      { num: '03', label: '2.0s Ring -> Commit', detail: '76x76 waveguide ring sweeps to 0.0s, updates Calendar + Gmail, writes 30s undo receipt.' },
    ],
    nodes: [
      { id: 'mic', title: 'R1 + Mic 16kHz', role: 'RMS Gate >= 0.012', x: 75, y: 54, tint: '#34F57E' },
      { id: 'orch', title: 'OnQ Orchestrator', role: 'Code-Guard · 45s TTL', x: 280, y: 54, tint: '#86FFAF' },
      { id: 'gcal', title: 'Google Calendar', role: 'PATCH +15m Etag OK', x: 500, y: 36, tint: '#4285F4' },
      { id: 'gmail', title: 'Gmail Draft/Send', role: 'Server-bound to:', x: 500, y: 122, tint: '#EA4335' },
    ],
    edges: [
      { from: 'mic', to: 'orch', label: 'STT_3.7_PASS' },
      { from: 'orch', to: 'gcal', label: 'FREE_BUSY_OK' },
      { from: 'orch', to: 'gmail', label: 'THREAD_FRESH' },
    ],
    answer: '14:00->14:15 GMT · Reply mailed to Priya · IDEMP #9f2a11 (30s Undo armed)',
  },
  {
    id: 'telegram',
    title: 'Telegram Voice Reply',
    sub: 'Filter chosen chats + voice reply staged safely via Bot API',
    ask: '"OnQ, reply in Even G2 Builders that .ehpk is live"',
    steps: [
      { num: '01', label: 'Select Chat Digest', detail: 'Pulls pinned group/DM updates through encrypted relay; zero unpicked noise.' },
      { num: '02', label: 'Draft & Bind ChatID', detail: 'Server binds chat_id inside 0600 vault; untrusted message text stays sandboxed.' },
      { num: '03', label: 'Tap Ring -> Send', detail: 'Requires explicit Default-NO toggle + 2.0s countdown before Telegram sendMessage.' },
    ],
    nodes: [
      { id: 'tg_in', title: 'Telegram Digest', role: 'Even G2 Builders', x: 75, y: 54, tint: '#26A5E4' },
      { id: 'draft', title: 'Grounded Router', role: 'Claude / OpenRouter', x: 280, y: 54, tint: '#86FFAF' },
      { id: 'ring', title: '2.0s Undo Ring', role: 'Default-NO Lock', x: 280, y: 128, tint: '#34F57E' },
      { id: 'tg_out', title: 'Bot API sendMessage', role: '200 OK · Chat Bound', x: 500, y: 88, tint: '#26A5E4' },
    ],
    edges: [
      { from: 'tg_in', to: 'draft', label: 'FILTERED_CHAT' },
      { from: 'draft', to: 'ring', label: 'CODE_GUARD' },
      { from: 'ring', to: 'tg_out', label: 'CONFIRMED_SEND' },
    ],
    answer: 'Sent to Even G2 Builders (chat bound) · Zero leaked bot token in G2 bundle',
  },
  {
    id: 'scribe',
    title: 'RAM Meeting Scribe',
    sub: 'Volatile memory speaker diarization with zero disk audio persistence',
    ask: '"OnQ, what did Priya ask about Q4?"',
    steps: [
      { num: '01', label: 'In-RAM Diarize', detail: 'Live 16kHz PCM chunks stream over WSS to AssemblyAI STT-3.7 in memory only.' },
      { num: '02', label: 'Wearer Attribution', detail: 'Blocks background speakers from triggering confirm_write via strict CODE_GUARD.' },
      { num: '03', label: 'Lens + TTS-1 Earbuds', detail: 'Streams concise 42-col lens card + quiet Bluetooth earbuds audio (G2 has no speaker).' },
    ],
    nodes: [
      { id: 'pcm', title: 'G2 Mic PCM Stream', role: 'Zero Disk Write', x: 75, y: 54, tint: '#34F57E' },
      { id: 'ram', title: 'RAM RingBuffer (48)', role: 'Auto-Wipe on Close', x: 280, y: 54, tint: '#86FFAF' },
      { id: 'lens', title: '576x288 HUD', role: '<= 999B ASCII Card', x: 500, y: 36, tint: '#34F57E' },
      { id: 'tts', title: 'AssemblyAI TTS-1', role: 'Earbuds Audio Out', x: 500, y: 122, tint: '#2dd4bf' },
    ],
    edges: [
      { from: 'pcm', to: 'ram', label: 'DIARIZE_SPK' },
      { from: 'ram', to: 'lens', label: 'GLANCE_BRIEF' },
      { from: 'ram', to: 'tts', label: 'BARGE_IN_OK' },
    ],
    answer: 'Priya: "Send Q4 deck to Alex by Thursday 15:00." (RAM wiped on exit)',
  },
  {
    id: 'wrapup',
    title: 'Post-Meeting Wrap-Up',
    sub: 'One-tap fanout into Notion 2026-03-11, Calendar & Gmail draft',
    ask: '"OnQ, wrap up and log action items"',
    steps: [
      { num: '01', label: 'Extract Decisions', detail: 'Pulls concrete decisions + owners directly from volatile meeting transcript buffer.' },
      { num: '02', label: 'Inspect Notion Schema', detail: 'Auto-discovers title, date, checkbox/status via 2026-03-11 data_sources API.' },
      { num: '03', label: 'Atomic Multi-Write', detail: 'Creates Notion task, holds 30m follow-up, saves Gmail draft inside 1 transaction.' },
    ],
    nodes: [
      { id: 'buf', title: 'Decisions + Owners', role: 'Meeting Session RAM', x: 75, y: 78, tint: '#86FFAF' },
      { id: 'notion', title: 'Notion 2026-03-11', role: 'Auto-Schema DS', x: 320, y: 26, tint: '#f2f2f2' },
      { id: 'cal', title: 'Calendar Hold', role: 'Free Slot 17:00', x: 320, y: 84, tint: '#4285F4' },
      { id: 'mail', title: 'Gmail Recap Draft', role: 'Safe Draft Only', x: 320, y: 140, tint: '#EA4335' },
    ],
    edges: [
      { from: 'buf', to: 'notion', label: 'DATA_SOURCE_PUT' },
      { from: 'buf', to: 'cal', label: 'SLOT_VERIFIED' },
      { from: 'buf', to: 'mail', label: 'DRAFT_SAVED' },
    ],
    answer: 'Notion task created · Follow-up held 17:00 · Recap draft ready in Gmail',
  },
  {
    id: 'shield',
    title: '409 Conflict Shield',
    sub: 'Hard-locks overlaps & stale email drift with zero partial writes',
    ask: '"OnQ, move VC Sync to 14:45"',
    steps: [
      { num: '01', label: 'Pre-Commit Re-Check', detail: 'Re-fetches Free/Busy + Gmail historyId + Notion last_edited_time at 0.0s boundary.' },
      { num: '02', label: 'Detect 14:45 Collision', detail: 'Finds "Design Review (14:45-15:15)" -> aborts pipeline atomically with HTTP 409.' },
      { num: '03', label: 'Surface Next Free Slot', detail: 'Presents 15:45 verified opening on lens so 1 tap re-stages cleanly without typing.' },
    ],
    nodes: [
      { id: 'cmd', title: 'Staged Move 14:45', role: 'At 0.0s Boundary', x: 75, y: 78, tint: '#86FFAF' },
      { id: 'guard', title: 'Conflict Engine', role: 'HTTP 409 Hard-Lock', x: 280, y: 78, tint: '#ffb020' },
      { id: 'zero', title: '0 Edits Executed', role: 'Mail + Cal Unchanged', x: 500, y: 36, tint: '#ff5a4f' },
      { id: 'next', title: 'Next Free: 15:45', role: '1-Tap Re-Stage', x: 500, y: 122, tint: '#34F57E' },
    ],
    edges: [
      { from: 'cmd', to: 'guard', label: 'RECHECK_LIVE' },
      { from: 'guard', to: 'zero', label: '409_BLOCKED' },
      { from: 'guard', to: 'next', label: 'NEXT_SLOT_15:45' },
    ],
    answer: 'HTTP 409 LOCKED (14:45 busy: Design Review) -> Zero mutations -> Next Free 15:45',
  },
];

export function ArchitectureShowcase({ testCount = 220 }: { testCount?: number }) {
  const [activeTabId, setActiveTabId] = useState<FlowTabId>('reschedule');
  const [compareMode, setCompareMode] = useState<'readonly' | 'phone'>('readonly');
  const reduced = useReducedMotion();

  const activeFlow = FLOW_TABS.find((t) => t.id === activeTabId) ?? FLOW_TABS[0];

  const getNodePos = (id: string) => {
    const n = activeFlow.nodes.find((x) => x.id === id);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

  return (
    <section id="architecture" className="section-rule py-20 sm:py-24">
      <div className="container-page space-y-12">
        {/* 1. Split Editorial Header + 01-04 Hairline Primitives (HydraDB-inspired) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <ScrollReveal className="lg:col-span-6 space-y-4">
            <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lime)]">
              SYSTEM ARCHITECTURE · HEADS UP HACKATHON
            </p>
            <h2 className="font-display font-bold leading-[1.02] tracking-[-0.02em] text-[2.2rem] sm:text-[3rem] lg:text-[3.35rem] text-[var(--bright)]">
              <span className="inline-block border-l-2 border-r-2 border-[var(--lime)] px-2.5 mr-2 font-pixel text-[1.45rem] sm:text-[1.8rem] text-[var(--lime)] align-middle">
                READ &amp; WRITE
              </span>
              runtime for Even G2 context.
            </h2>
            <p className="text-sm sm:text-base leading-relaxed text-[var(--lightgray)] max-w-xl">
              Other glasses apps stop at read-only prompts. OnQ unifies live Calendar, Gmail, Drive, Telegram, and Notion into deterministic write-safe flows built specifically for 576x288 monochrome optics and the R1 smart ring.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.05} className="lg:col-span-6 divide-y divide-dashed divide-white/15 border-t border-b border-dashed border-white/15">
            {[
              {
                num: '01',
                title: 'LVGL 576x288 monochrome formatter with <= 999B byte cap',
              },
              {
                num: '02',
                title: 'AssemblyAI STT-3.7 + TTS-1 RAM-only scribe & local Whisper',
              },
              {
                num: '03',
                title: '4-tier AI failover (Claude -> OpenRouter -> ChatGPT -> Rules)',
              },
              {
                num: '04',
                title: 'AES-256-GCM 0600 vault, PKCE OAuth & 409 hard-lock ledger',
              },
            ].map((row) => (
              <div key={row.num} className="py-4 flex items-baseline gap-4">
                <span className="font-pixel text-xs text-[var(--lime)] shrink-0">{row.num}</span>
                <span className="font-display text-base sm:text-lg font-medium text-[var(--bright)]">
                  {row.title}
                </span>
              </div>
            ))}
          </ScrollReveal>
        </div>

        {/* 2. Two-Stage Animated Architecture Blueprint (HydraDB Complete Architecture style) */}
        <ScrollReveal delay={0.06} className="retro-glass-panel p-5 sm:p-7 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-pixel text-[11px] uppercase tracking-[0.18em] text-[var(--lime)]">
              COMPLETE ARCHITECTURE
            </span>
            <span className="font-pixel text-[10px] uppercase tracking-[0.14em] text-[var(--g2-phosphor)]">
              EVEN HUB SDK 0.0.16 · ZERO SECRETS IN EHPK
            </span>
          </div>

          <div className="hydra-dot-canvas rounded-[12px] border border-white/10 p-4 sm:p-6 space-y-6 overflow-x-auto">
            {/* Tier 1: Glasses -> Safety Gates -> Orchestrator -> Connectors */}
            <div className="min-w-[780px] relative grid grid-cols-12 gap-3 items-center">
              <div className="col-span-2 retro-glass-well p-3 text-center space-y-1">
                <div className="font-pixel text-[9px] text-[var(--g2-phosphor)]">EVEN G2 + R1</div>
                <div className="text-xs font-semibold text-[var(--bright)]">Voice + Ring</div>
                <div className="text-[10px] text-[var(--lightgray)]">576x288 · WebView</div>
              </div>

              <div className="col-span-1 flex justify-center">
                <svg viewBox="0 0 60 20" className="w-full h-5" aria-hidden="true">
                  <path d="M2 10 L54 10" stroke="#34F57E" strokeWidth="2" className="animate-svg-flow" />
                  <polygon points="50,6 58,10 50,14" fill="#34F57E" />
                </svg>
              </div>

              <div className="col-span-3 retro-glass-well p-3 space-y-1.5 border border-[var(--lime)]/35">
                <div className="font-pixel text-[9px] text-[var(--lime)]">4 SAFETY GATES</div>
                <div className="text-xs font-semibold text-[var(--bright)]">Zero-Regret Staging</div>
                <div className="flex flex-wrap gap-1 text-[9px] font-pixel text-[var(--lightgray)]">
                  <span className="px-1.5 py-0.5 bg-white/5 rounded">RMS &gt;=0.012</span>
                  <span className="px-1.5 py-0.5 bg-white/5 rounded">DEFAULT-NO</span>
                  <span className="px-1.5 py-0.5 bg-white/5 rounded">2s RING</span>
                  <span className="px-1.5 py-0.5 bg-white/5 rounded">409 LOCK</span>
                </div>
              </div>

              <div className="col-span-1 flex justify-center">
                <svg viewBox="0 0 60 20" className="w-full h-5" aria-hidden="true">
                  <path d="M2 10 L54 10" stroke="#86FFAF" strokeWidth="2" className="animate-svg-flow" />
                  <polygon points="50,6 58,10 50,14" fill="#86FFAF" />
                </svg>
              </div>

              <div className="col-span-2 retro-glass-well p-3 text-center space-y-1 border border-[var(--g2-phosphor)]/40">
                <div className="font-pixel text-[9px] text-[var(--g2-phosphor)]">ONQ RELAY</div>
                <div className="text-xs font-semibold text-[var(--bright)]">Orchestrator</div>
                <div className="text-[10px] text-[var(--lightgray)]">Code-Guard + Intent</div>
              </div>

              <div className="col-span-1 flex justify-center">
                <svg viewBox="0 0 60 64" className="w-full h-16" aria-hidden="true">
                  <path d="M2 32 C24 32, 24 10, 56 10" fill="none" stroke="#34F57E" strokeWidth="1.6" className="animate-svg-flow" />
                  <path d="M2 32 L56 32" fill="none" stroke="#86FFAF" strokeWidth="1.6" className="animate-svg-flow" />
                  <path d="M2 32 C24 32, 24 54, 56 54" fill="none" stroke="#26A5E4" strokeWidth="1.6" className="animate-svg-flow" />
                </svg>
              </div>

              <div className="col-span-2 space-y-1.5 text-[10px]">
                <div className="retro-glass-well px-2.5 py-1.5 flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="text-[var(--bright)] font-medium">Workspace</span>
                  <span className="text-[var(--g2-phosphor)] font-pixel">PKCE</span>
                </div>
                <div className="retro-glass-well px-2.5 py-1.5 flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="text-[var(--bright)] font-medium">Telegram Bot</span>
                  <span className="text-[#26A5E4] font-pixel">TRK01</span>
                </div>
                <div className="retro-glass-well px-2.5 py-1.5 flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="text-[var(--bright)] font-medium">Notion · AI</span>
                  <span className="text-[var(--lime)] font-pixel">4-TIER</span>
                </div>
              </div>
            </div>

            {/* Downward Animated Flow Pipes */}
            <div className="min-w-[780px] grid grid-cols-3 gap-4 px-12">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex justify-center">
                  <svg viewBox="0 0 24 32" className="w-6 h-8" aria-hidden="true">
                    <path d="M12 2 L12 28" stroke="#34F57E" strokeWidth="2" className="animate-svg-flow" />
                    <polygon points="8,24 12,31 16,24" fill="#34F57E" />
                  </svg>
                </div>
              ))}
            </div>

            {/* Tier 2: Core Harness & Unified Storage */}
            <div className="min-w-[780px] border border-dashed border-[var(--g2-phosphor)]/40 rounded-[12px] p-4 space-y-3 bg-black/50">
              <div className="flex items-center justify-between text-[10px] font-pixel">
                <span className="text-[var(--bright)] uppercase tracking-[0.16em]">THE CORE RELAY &amp; VAULT</span>
                <span className="text-[var(--lightgray)]">AES-256-GCM MODE 0600 · SINGLE-TENANT LOCAL/CLOUD</span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="retro-glass-well p-3">
                  <div className="font-pixel text-[9px] text-[var(--g2-phosphor)]">24/7 HARNESS</div>
                  <div className="font-semibold text-[var(--bright)] mt-0.5">Proactive Watcher</div>
                  <div className="text-[11px] text-[var(--lightgray)]">20s pulses · Default-NO briefs</div>
                </div>
                <div className="retro-glass-well p-3">
                  <div className="font-pixel text-[9px] text-[var(--lime)]">RAM SCRIBE</div>
                  <div className="font-semibold text-[var(--bright)] mt-0.5">Zero Audio Disk Buffer</div>
                  <div className="text-[11px] text-[var(--lightgray)]">48 turns max · Auto-wiped</div>
                </div>
                <div className="retro-glass-well p-3">
                  <div className="font-pixel text-[9px] text-[var(--verified)]">LEDGER</div>
                  <div className="font-semibold text-[var(--bright)] mt-0.5">Idempotent Commits</div>
                  <div className="text-[11px] text-[var(--lightgray)]">node:sqlite / Neon Postgres</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-dashed border-white/10 text-[10px] font-pixel">
                <span className="text-[var(--g2-phosphor)]">TIERED MEMORY:</span>
                <span className="text-[var(--bright)]">HOT: RAM Scribe (&lt;12ms)</span>
                <span className="text-[var(--lightgray)]">-&gt;</span>
                <span className="text-[var(--bright)]">WARM: SQLite Ledger (1ms)</span>
                <span className="text-[var(--lightgray)]">-&gt;</span>
                <span className="text-[var(--bright)]">COLD: AES-256-GCM 0600 Vault</span>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* 3. Interactive 5-Tab Execution Graph Explorer (HydraDB Use-Case Graph Explorer style) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-4 space-y-2" role="tablist" aria-label="OnQ execution workflows">
            {FLOW_TABS.map((tab) => {
              const active = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`w-full text-left p-4 rounded-[12px] border transition-all cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--lime)] ${
                    active
                      ? 'retro-glass-card border-l-4 border-l-[var(--lime)] border-[var(--lime)]/40 bg-white/[0.06]'
                      : 'bg-black/40 border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="font-display text-base font-bold text-[var(--bright)]">{tab.title}</div>
                  <div className="text-xs text-[var(--lightgray)] mt-0.5">{tab.sub}</div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-8 retro-glass-panel p-5 flex flex-col justify-between space-y-4">
            <div className="hydra-dot-canvas rounded-[12px] border border-white/10 p-3 overflow-x-auto">
              <svg viewBox="0 0 650 185" className="w-full min-w-[560px] h-auto" role="img" aria-label={`${activeFlow.title} execution graph`}>
                {activeFlow.edges.map((edge, idx) => {
                  const a = getNodePos(edge.from);
                  const b = getNodePos(edge.to);
                  const x1 = a.x + 132;
                  const y1 = a.y + 24;
                  const x2 = b.x;
                  const y2 = b.y + 24;
                  const midX = (x1 + x2) / 2;
                  return (
                    <g key={`${edge.from}-${edge.to}-${idx}`}>
                      <path
                        d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`}
                        fill="none"
                        stroke="#34F57E"
                        strokeOpacity="0.8"
                        strokeWidth="1.6"
                        className={reduced ? '' : 'animate-svg-flow'}
                      />
                      <rect x={midX - 40} y={(y1 + y2) / 2 - 8} width="80" height="15" rx="3" fill="#070a09" stroke="rgba(255,255,255,0.16)" />
                      <text x={midX} y={(y1 + y2) / 2 + 2.5} textAnchor="middle" fill="#86FFAF" fontSize="7.2" fontFamily="monospace" fontWeight="700">
                        {edge.label}
                      </text>
                    </g>
                  );
                })}

                {activeFlow.nodes.map((node) => (
                  <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                    <rect
                      width="136"
                      height="48"
                      rx="8"
                      fill="#0d1110"
                      stroke={node.tint}
                      strokeOpacity="0.65"
                      strokeWidth="1.3"
                    />
                    <text x="10" y="20" fill="#f2f2f2" fontSize="9.5" fontFamily="sans-serif" fontWeight="700">
                      {node.title}
                    </text>
                    <text x="10" y="36" fill={node.tint} fontSize="7.8" fontFamily="monospace">
                      {node.role}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="retro-glass-well p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-pixel text-[9px] text-[var(--lightgray)] uppercase mr-2">VOICE ASK</span>
                  <span className="text-[var(--bright)] font-medium">{activeFlow.ask}</span>
                </div>
                <span className="font-pixel text-[9px] text-[var(--g2-phosphor)]">
                  EXECUTED IN ONE VERIFIED FLOW
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 border-t border-dashed border-white/10 pt-3">
                {activeFlow.steps.map((s) => (
                  <div key={s.num} className="space-y-0.5">
                    <div className="font-pixel text-[10px] text-[var(--lime)]">
                      {s.num} · {s.label}
                    </div>
                    <p className="text-[11px] text-[var(--lightgray)] leading-snug">{s.detail}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-white/10 pt-2 text-[var(--g2-phosphor)] font-plex text-[11px]">
                <span className="text-[var(--lightgray)] mr-2">OUTCOME:</span>
                {activeFlow.answer}
              </div>
            </div>
          </div>
        </div>

        {/* 4. 5-Column SOTA Strip + Comparison Curve Chart */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 border border-white/10 rounded-[14px] overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-white/10 bg-black/70">
            {[
              { val: '100%', label: 'INTENT ACCURACY', sub: '32 / 32 commands' },
              { val: '0%', label: 'INJECTION OBEYED', sub: '5 / 5 adversarial blocked' },
              { val: '97.6%', label: 'WAVEGUIDE CONTRAST', sub: '11 / 11 geometry pass' },
              { val: String(testCount), label: 'AUTOMATED TESTS', sub: 'Zero external secret leaks' },
              { val: '~$0.001', label: 'BRIEF UNIT COST', sub: 'Rules + local Whisper $0' },
            ].map((m) => (
              <div key={m.label} className="p-5 space-y-1">
                <div className="font-dots text-3xl font-black text-[var(--bright)]">
                  {m.val.includes('%') ? m.val : m.val.startsWith('~') ? m.val : <KineticNumber value={testCount} />}
                </div>
                <div className="font-pixel text-[9px] text-[var(--lime)] tracking-[0.14em]">{m.label}</div>
                <div className="text-[11px] text-[var(--lightgray)]">{m.sub}</div>
              </div>
            ))}
          </div>

          <div className="retro-glass-panel p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lime)]">
                  HEADS UP TRACK 04 + TRACK 01 COMPARISON
                </div>
                <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--bright)] mt-0.5">
                  {compareMode === 'readonly'
                    ? 'Task completion reliability across real workspace actions'
                    : 'Corridor task time: Phone app switching vs Even G2 glance'}
                </h3>
              </div>

              <div className="inline-flex rounded-[10px] border border-white/15 bg-black/70 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setCompareMode('readonly')}
                  className={`px-3 py-1.5 rounded-[7px] font-medium cursor-pointer transition-colors ${
                    compareMode === 'readonly' ? 'bg-[var(--lime)] text-[#0a0a0a]' : 'text-[var(--lightgray)] hover:text-[var(--bright)]'
                  }`}
                >
                  vs Read-Only G2 Apps
                </button>
                <button
                  type="button"
                  onClick={() => setCompareMode('phone')}
                  className={`px-3 py-1.5 rounded-[7px] font-medium cursor-pointer transition-colors ${
                    compareMode === 'phone' ? 'bg-[var(--lime)] text-[#0a0a0a]' : 'text-[var(--lightgray)] hover:text-[var(--bright)]'
                  }`}
                >
                  vs Phone Workflow
                </button>
              </div>
            </div>

            <div className="hydra-dot-canvas rounded-[12px] border border-white/10 p-4">
              <svg viewBox="0 0 680 185" className="w-full h-auto" role="img" aria-label="OnQ reliability comparison chart">
                <defs>
                  <linearGradient id="onqCurveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34F57E" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#34F57E" stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                {[35, 75, 115, 155].map((y) => (
                  <line key={y} x1="44" y1={y} x2="650" y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                ))}
                <text x="8" y="39" fill="#8a8a8a" fontSize="9" fontFamily="monospace">100%</text>
                <text x="14" y="99" fill="#8a8a8a" fontSize="9" fontFamily="monospace">50%</text>
                <text x="18" y="159" fill="#8a8a8a" fontSize="9" fontFamily="monospace">0%</text>

                <text x="52" y="175" fill="#8a8a8a" fontSize="9" fontFamily="monospace">READ BRIEF</text>
                <text x="230" y="175" fill="#8a8a8a" fontSize="9" fontFamily="monospace">VOICE RESCHEDULE</text>
                <text x="415" y="175" fill="#8a8a8a" fontSize="9" fontFamily="monospace">MULTI-APP WRITE</text>
                <text x="575" y="175" fill="#8a8a8a" fontSize="9" fontFamily="monospace">409 CONFLICT</text>

                {/* OnQ Area + Curve */}
                <path
                  d="M 52 38 C 190 36, 330 40, 470 42 C 550 43, 610 42, 635 42 L 635 155 L 52 155 Z"
                  fill="url(#onqCurveGrad)"
                />
                <motion.path
                  d="M 52 38 C 190 36, 330 40, 470 42 C 550 43, 610 42, 635 42"
                  fill="none"
                  stroke="#34F57E"
                  strokeWidth="2.8"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.85, ease: MOTION_EASE }}
                />

                {/* Comparison curve */}
                <motion.path
                  d={
                    compareMode === 'readonly'
                      ? 'M 52 55 C 180 78, 310 128, 470 144 C 550 150, 610 152, 635 152'
                      : 'M 52 64 C 190 92, 340 105, 470 118 C 560 126, 610 132, 635 134'
                  }
                  fill="none"
                  stroke={compareMode === 'readonly' ? '#ffb020' : '#f2f2f2'}
                  strokeWidth="2.2"
                  strokeDasharray={compareMode === 'readonly' ? undefined : '5 4'}
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.85, delay: 0.12, ease: MOTION_EASE }}
                />

                <rect x="64" y="16" width="9" height="9" fill="#34F57E" />
                <text x="78" y="24" fill="#86FFAF" fontSize="9.5" fontFamily="monospace" fontWeight="700">
                  OnQ Even G2 (Read + Write + 409 Lock · 97-100%)
                </text>
                <rect x="395" y="16" width="9" height="9" fill={compareMode === 'readonly' ? '#ffb020' : '#f2f2f2'} />
                <text x="409" y="24" fill="#d4d4d4" fontSize="9.5" fontFamily="monospace">
                  {compareMode === 'readonly' ? 'Read-Only Glasses Apps (No Writebacks)' : 'Phone Unlock + 4 Apps (~90s Context Switch)'}
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
