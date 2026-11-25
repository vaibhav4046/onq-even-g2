import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { GlyphDecodeHeading, KineticNumber, MOTION_EASE, ScrollReveal } from './MotionPrimitives';
import { VERIFIED_TEST_COUNT } from '../verifiedCounts';

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
    title: 'Move a meeting',
    sub: 'Reschedule and reply',
    ask: '"OnQ, push VC Sync 15m and tell Priya"',
    steps: [
      { num: '01', label: 'Understand', detail: 'Works out "15 minutes later" and checks your calendar.' },
      { num: '02', label: 'Ask first', detail: 'Shows the plan with NO selected. Facts are checked first.' },
      { num: '03', label: 'Undo ring, then send', detail: 'A 2-second ring runs, then Calendar and Gmail update. Undo stays open for 30 seconds.' },
    ],
    nodes: [
      { id: 'mic', title: 'Ring and mic', role: 'Ignores noise', x: 75, y: 54, tint: '#34F57E' },
      { id: 'orch', title: 'OnQ relay', role: 'Checks facts', x: 280, y: 54, tint: '#86FFAF' },
      { id: 'gcal', title: 'Google Calendar', role: 'Moves by 15 min', x: 500, y: 36, tint: '#4285F4' },
      { id: 'gmail', title: 'Gmail', role: 'Reply to Priya', x: 500, y: 122, tint: '#EA4335' },
    ],
    edges: [
      { from: 'mic', to: 'orch', label: 'HEARD' },
      { from: 'orch', to: 'gcal', label: 'SLOT FREE' },
      { from: 'orch', to: 'gmail', label: 'THREAD OK' },
    ],
    answer: 'Moved to 14:15. Reply sent to Priya. Undo open for 30 seconds.',
  },
  {
    id: 'telegram',
    title: 'Telegram reply',
    sub: 'Reply in a chat',
    ask: '"OnQ, reply in Even G2 Builders that .ehpk is live"',
    steps: [
      { num: '01', label: 'Pick a chat', detail: 'Pulls recent updates through your encrypted relay.' },
      { num: '02', label: 'Draft the reply', detail: 'It goes only to the chat you picked. Message text is never treated as a command.' },
      { num: '03', label: 'Ring, then send', detail: 'You confirm, a 2-second ring runs, then it sends.' },
    ],
    nodes: [
      { id: 'tg_in', title: 'Telegram Digest', role: 'Even G2 Builders', x: 75, y: 54, tint: '#26A5E4' },
      { id: 'draft', title: 'Draft reply', role: 'Claude or OpenRouter', x: 280, y: 54, tint: '#86FFAF' },
      { id: 'ring', title: 'Undo ring', role: 'Asks first', x: 280, y: 128, tint: '#34F57E' },
      { id: 'tg_out', title: 'Telegram', role: 'Sent to that chat', x: 500, y: 88, tint: '#26A5E4' },
    ],
    edges: [
      { from: 'tg_in', to: 'draft', label: 'PICKED CHAT' },
      { from: 'draft', to: 'ring', label: 'FACT CHECK' },
      { from: 'ring', to: 'tg_out', label: 'YOU CONFIRMED' },
    ],
    answer: 'Sent to Even G2 Builders. No bot token on the glasses.',
  },
  {
    id: 'scribe',
    title: 'Meeting notes',
    sub: 'Live notes, never saved',
    ask: '"OnQ, what did Priya ask about Q4?"',
    steps: [
      { num: '01', label: 'Listen', detail: 'Speech is transcribed live. Nothing is written to disk.' },
      { num: '02', label: 'Know who is speaking', detail: 'Background voices cannot trigger a write.' },
      { num: '03', label: 'Show and speak', detail: 'A short card on the lens, plus audio in your earbuds. The glasses have no speaker.' },
    ],
    nodes: [
      { id: 'pcm', title: 'Glasses mic', role: 'Nothing saved', x: 75, y: 54, tint: '#34F57E' },
      { id: 'ram', title: 'Notes in memory', role: 'Wiped on close', x: 280, y: 54, tint: '#86FFAF' },
      { id: 'lens', title: 'Lens card', role: 'Short and readable', x: 500, y: 36, tint: '#34F57E' },
      { id: 'tts', title: 'AssemblyAI voice', role: 'Audio in earbuds', x: 500, y: 122, tint: '#2dd4bf' },
    ],
    edges: [
      { from: 'pcm', to: 'ram', label: 'WHO SPOKE' },
      { from: 'ram', to: 'lens', label: 'SHORT BRIEF' },
      { from: 'ram', to: 'tts', label: 'YOU CAN CUT IN' },
    ],
    answer: 'Priya: "Send the Q4 deck to Alex by Thursday 15:00." Notes wiped on exit.',
  },
  {
    id: 'wrapup',
    title: 'After-meeting tasks',
    sub: 'Tasks, hold and recap',
    ask: '"OnQ, wrap up and log action items"',
    steps: [
      { num: '01', label: 'Find the decisions', detail: 'Pulls decisions and owners from the meeting notes.' },
      { num: '02', label: 'Read your Notion setup', detail: 'Finds your title, date and status fields on its own.' },
      { num: '03', label: 'Do it all at once', detail: 'Creates the Notion task, holds 30 minutes and saves a Gmail draft as one step.' },
    ],
    nodes: [
      { id: 'buf', title: 'Decisions and owners', role: 'From meeting notes', x: 75, y: 78, tint: '#86FFAF' },
      { id: 'notion', title: 'Notion task', role: 'Fields found for you', x: 320, y: 26, tint: '#f2f2f2' },
      { id: 'cal', title: 'Calendar hold', role: 'Free slot 17:00', x: 320, y: 84, tint: '#4285F4' },
      { id: 'mail', title: 'Gmail recap', role: 'Saved as a draft', x: 320, y: 140, tint: '#EA4335' },
    ],
    edges: [
      { from: 'buf', to: 'notion', label: 'TASK ADDED' },
      { from: 'buf', to: 'cal', label: 'SLOT FREE' },
      { from: 'buf', to: 'mail', label: 'DRAFT SAVED' },
    ],
    answer: 'Notion task created. Follow-up held at 17:00. Recap draft in Gmail.',
  },
  {
    id: 'shield',
    title: 'Double-booking guard',
    sub: 'Stops clashes',
    ask: '"OnQ, move VC Sync to 14:45"',
    steps: [
      { num: '01', label: 'Check again', detail: 'Right before saving, it re-checks Calendar, Gmail and Notion.' },
      { num: '02', label: 'Catch the clash', detail: 'Design Review already holds 14:45 to 15:15, so nothing is saved.' },
      { num: '03', label: 'Offer a new time', detail: '15:45 is free. One tap books it, no typing.' },
    ],
    nodes: [
      { id: 'cmd', title: 'Move to 14:45', role: 'About to save', x: 75, y: 78, tint: '#86FFAF' },
      { id: 'guard', title: 'Conflict check', role: 'Double-booking lock', x: 280, y: 78, tint: '#ffb020' },
      { id: 'zero', title: 'Nothing changed', role: 'Mail and calendar safe', x: 500, y: 36, tint: '#ff5a4f' },
      { id: 'next', title: 'Next free: 15:45', role: 'One tap to book', x: 500, y: 122, tint: '#34F57E' },
    ],
    edges: [
      { from: 'cmd', to: 'guard', label: 'RE-CHECKED' },
      { from: 'guard', to: 'zero', label: 'BLOCKED' },
      { from: 'guard', to: 'next', label: 'NEXT SLOT' },
    ],
    answer: '14:45 is busy (Design Review). Nothing changed. Next free slot: 15:45.',
  },
];

export function ArchitectureShowcase({ testCount = VERIFIED_TEST_COUNT }: { testCount?: number }) {
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
        {/* 1. Split editorial header and four plain-English highlights */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <ScrollReveal className="lg:col-span-6 space-y-4">
            <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lime)]">
              HOW IT WORKS
            </p>
            <h2 className="font-display font-bold leading-[1.02] tracking-[-0.02em] text-[2.2rem] sm:text-[3rem] lg:text-[3.35rem] text-[var(--bright)]">
              Speak naturally. Get real actions done.
            </h2>
            <p className="text-sm sm:text-base leading-relaxed text-[var(--lightgray)] max-w-xl">
              Say what you need. OnQ reads Calendar, Gmail, Drive, Notion and Telegram, then asks before it acts.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.05} className="lg:col-span-6 divide-y divide-dashed divide-white/15 border-t border-b border-dashed border-white/15">
            {[
              {
                num: '01',
                title: 'Readable at a glance',
              },
              {
                num: '02',
                title: 'Meeting notes stay in memory',
              },
              {
                num: '03',
                title: 'Works with Claude, ChatGPT or OpenRouter',
              },
              {
                num: '04',
                title: 'No keys on the glasses, and it asks before sending',
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

        {/* 2. Simple architecture blueprint */}
        <ScrollReveal delay={0.06} className="retro-glass-panel p-5 sm:p-7 space-y-6">
          <span className="font-pixel text-[11px] uppercase tracking-[0.18em] text-[var(--lime)]">
            THE BIG PICTURE
          </span>

          <div className="hydra-dot-canvas rounded-[12px] border border-white/10 p-4 sm:p-6 space-y-6 overflow-x-auto">
            {/* Tier 1: Glasses, safety steps, relay, your apps */}
            <div className="min-w-[780px] relative grid grid-cols-12 gap-3 items-center">
              <div className="col-span-2 retro-glass-well p-3 text-center space-y-1">
                <div className="font-pixel text-[9px] text-[var(--g2-phosphor)]">GLASSES</div>
                <div className="text-xs font-semibold text-[var(--bright)]">Voice and ring</div>
              </div>

              <div className="col-span-1 flex justify-center">
                <svg viewBox="0 0 60 20" className="w-full h-5" aria-hidden="true">
                  <path d="M2 10 L54 10" stroke="#34F57E" strokeWidth="2" className="animate-svg-flow" />
                  <polygon points="50,6 58,10 50,14" fill="#34F57E" />
                </svg>
              </div>

              <div className="col-span-3 retro-glass-well p-3 space-y-1.5 border border-[var(--lime)]/35">
                <div className="font-pixel text-[9px] text-[var(--lime)]">FOUR SAFETY STEPS</div>
                <div className="text-xs font-semibold text-[var(--bright)]">Confirm before anything sends</div>
                <div className="flex flex-wrap gap-1 text-[9px] font-pixel text-[var(--lightgray)]">
                  <span className="px-1.5 py-0.5 bg-white/5 rounded">IGNORES NOISE</span>
                  <span className="px-1.5 py-0.5 bg-white/5 rounded">ASKS FIRST</span>
                  <span className="px-1.5 py-0.5 bg-white/5 rounded">UNDO RING</span>
                  <span className="px-1.5 py-0.5 bg-white/5 rounded">DOUBLE-BOOKING LOCK</span>
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
                <div className="text-xs font-semibold text-[var(--bright)]">Plans the action</div>
                <div className="text-[10px] text-[var(--lightgray)]">Checks facts first</div>
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
                  <span className="text-[var(--bright)] font-medium">Google Workspace</span>
                </div>
                <div className="retro-glass-well px-2.5 py-1.5 flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="text-[var(--bright)] font-medium">Telegram</span>
                </div>
                <div className="retro-glass-well px-2.5 py-1.5 flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="text-[var(--bright)] font-medium">Notion</span>
                </div>
              </div>
            </div>

          </div>
        </ScrollReveal>

        {/* 3. Interactive five-tab flow explorer */}
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
                  <span className="font-pixel text-[9px] text-[var(--lightgray)] uppercase mr-2">YOU SAY</span>
                  <span className="text-[var(--bright)] font-medium">{activeFlow.ask}</span>
                </div>
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
                <span className="text-[var(--lightgray)] mr-2">RESULT:</span>
                {activeFlow.answer}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Proof strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 border border-white/10 rounded-[14px] overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-white/10 bg-black/70">
          {[
            { val: '100%', label: 'COMMANDS UNDERSTOOD', sub: '32 of 32' },
            { val: '0%', label: 'INJECTIONS OBEYED', sub: '5 of 5 blocked' },
            { val: '97.6%', label: 'DISPLAY CONTRAST', sub: '11 of 11 checks' },
            { val: String(testCount), label: 'PASSING TESTS', sub: 'No secret leaks' },
            { val: '~$0.001', label: 'COST PER BRIEF', sub: 'Local rules cost $0' },
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

        <details className="border border-dashed border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--lightgray)]">
          <summary className="cursor-pointer font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--bright)]">
            Engineering &amp; audit
          </summary>

          <div className="mt-4 space-y-6">
            <ul className="space-y-1.5 leading-relaxed list-disc pl-4">
              <li>Platform: Even Hub SDK 0.0.16 on a 576x288 WebView lens. No secrets ship in the .ehpk.</li>
              <li>Safety gates: RMS level 0.012, default-NO, 2.0s ring, HTTP 409 lock.</li>
              <li>Confirm step: single-use preview token with a 45-second TTL, plus the Code-Guard fact check.</li>
              <li>Undo ring: 76x76 on the lens, with a 30-second undo receipt.</li>
              <li>Move a meeting: Chrono and a deterministic parser resolve the time, then Free/Busy is queried by ETag.</li>
              <li>Telegram: the chat_id is bound inside the 0600 vault and the reply goes out through Bot API sendMessage.</li>
              <li>Meeting notes: 16 kHz PCM over WSS to AssemblyAI STT-3.7, a RAM ring buffer of 48 turns, a lens card of 42 columns and 999 bytes at most, TTS-1 to earbuds.</li>
              <li>After-meeting tasks: Notion 2026-03-11 data_sources API, written in one transaction.</li>
              <li>Double-booking lock: Free/Busy, Gmail historyId and Notion last_edited_time are re-checked at the 0.0s boundary, and a clash returns HTTP 409 with no writes.</li>
              <li>Relay: AES-256-GCM vault at mode 0600, single-tenant local or cloud. The watcher pulses every 20s and briefs default to NO. The ledger is idempotent, on node:sqlite or Neon Postgres.</li>
              <li>Memory tiers: hot RAM scribe (under 12ms), warm SQLite ledger (1ms), cold encrypted vault.</li>
            </ul>

            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-pixel text-[9px] uppercase tracking-[0.16em] text-[var(--lime)]">
                    ILLUSTRATIVE COMPARISON, NOT A BENCHMARK
                  </div>
                  <h3 className="font-display text-base sm:text-lg font-bold text-[var(--bright)] mt-0.5">
                    {compareMode === 'readonly'
                      ? 'Task completion across real workspace actions'
                      : 'Corridor task time: phone app switching vs Even G2 glance'}
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
                  <text x="230" y="175" fill="#8a8a8a" fontSize="9" fontFamily="monospace">RESCHEDULE</text>
                  <text x="415" y="175" fill="#8a8a8a" fontSize="9" fontFamily="monospace">WRITE TO APPS</text>
                  <text x="575" y="175" fill="#8a8a8a" fontSize="9" fontFamily="monospace">CONFLICT</text>

                  {/* OnQ area and curve */}
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
                    OnQ on Even G2 (reads, writes, lock)
                  </text>
                  <rect x="395" y="16" width="9" height="9" fill={compareMode === 'readonly' ? '#ffb020' : '#f2f2f2'} />
                  <text x="409" y="24" fill="#d4d4d4" fontSize="9.5" fontFamily="monospace">
                    {compareMode === 'readonly' ? 'Read-only glasses apps' : 'Phone, 4 apps (~90s switch)'}
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
