import { motion } from 'motion/react';
import harnessEval from '../data/harnessEval.json';
import { VERIFIED_TEST_COUNT } from '../verifiedCounts';
import {
  GlyphDecodeHeading,
  KineticNumber,
  MOTION_EASE,
  ScrollReveal,
} from './MotionPrimitives';

/**
 * Visual research and reproducible harness proof backing OnQ:
 * - Microsoft Work Trend Index (2023 and 2025 "Infinite Workday", verified citations)
 * - Mark, Gudith & Klocke (UC Irvine, CHI 2008, doi:10.1145/1357054.1357072)
 * - Reproducible OnQ Orchestration & Safety Harness (docs/HARNESS_EVAL.json)
 */
export function ResearchGraphsSection({ testCount = VERIFIED_TEST_COUNT }: { testCount?: number }) {
  const wtiBars = [
    { label: 'Meetings rated ineffective', pct: 72, stat: '72%', accent: '#86FFAF' },
    { label: 'No uninterrupted focus time', pct: 68, stat: '68%', accent: '#34F57E' },
    { label: 'Meetings in peak focus hours', pct: 50, stat: '50%', accent: '#7EFFAD' },
    { label: 'Week lost searching across tools', pct: 25, stat: '25% (~10h)', accent: '#f2f2f2' },
  ];

  const evalMetrics = [
    {
      label: 'Voice commands understood',
      stat: `${harnessEval.intentAccuracy.passed}/${harnessEval.intentAccuracy.total} (${harnessEval.intentAccuracy.pct}%)`,
      pct: harnessEval.intentAccuracy.pct,
      accent: '#34F57E',
    },
    {
      label: 'Untrusted email instructions ignored',
      stat: `${harnessEval.promptInjection.blocked}/${harnessEval.promptInjection.total}`,
      pct: harnessEval.promptInjection.pct,
      accent: '#86FFAF',
    },
    {
      label: 'Double-bookings stopped before save',
      stat: `${harnessEval.conflictHardLock.blocked}/${harnessEval.conflictHardLock.total}`,
      pct: harnessEval.conflictHardLock.pct,
      accent: '#7EFFAD',
    },
    {
      label: 'Quiet background bumps ignored',
      stat: `${harnessEval.rmsSilenceGate.rejected}/${harnessEval.rmsSilenceGate.totalSilent}`,
      pct: harnessEval.rmsSilenceGate.pct,
      accent: '#f2f2f2',
    },
  ];

  const fieldMatrix = [
    {
      entry: 'OnQ (Track 04, Telegram)',
      score: 98,
      scope: 'Calendar, Gmail, Drive, Notion, Telegram, PC, LiveUI',
      lifecycle: 'Duplex voice, live apps, Kanban, watch-screen, 3D memory',
      safety: 'Ask first, 2s ring, 409 lock, zero-setup simulator',
      tests: `${testCount} tests, SDK`,
      highlight: true,
    },
    {
      entry: 'OcuClaw v2.2.1 (Akelu · Hub)',
      score: 76,
      scope: 'OpenClaw / Hermes, LiveUI, BotScreen, Tailscale',
      lifecycle: 'Speck marker, Kanban, 3D map, silent JEV input',
      safety: 'Needs Tailscale, host CLI and JEV API; no native Calendar or Telegram',
      tests: 'Host, Hub app',
      highlight: false,
    },
    {
      entry: 'Chesly (Even Hub)',
      score: 68,
      scope: 'Telegram, WhatsApp, Slack, Mail',
      lifecycle: 'Unified inbox digest and quick replies',
      safety: 'Voice or tap reply confirm',
      tests: 'Hub app',
      highlight: false,
    },
    {
      entry: 'TeleGlance / Heads Up',
      score: 58,
      scope: 'Telegram bot and group chats',
      lifecycle: '3-line chat digest, 1-tap AI drafts',
      safety: 'Draft pick confirm',
      tests: 'Track 01',
      highlight: false,
    },
    {
      entry: 'Aside & TapBack',
      score: 54,
      scope: 'Notion or Telegram, single app',
      lifecycle: 'Transcript playback / Whisper reply',
      safety: '2s confirm or manual send',
      tests: '48-132 tests',
      highlight: false,
    },
  ];

  const detailsRowClass =
    'flex flex-wrap items-center justify-between gap-2 px-3 py-2 border border-dashed border-[var(--hairline)] bg-[var(--ink)]';

  return (
    <section id="research" className="section-rule py-20 sm:py-24">
      <div className="container-page space-y-10">
        <ScrollReveal className="space-y-2 max-w-3xl">
          <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lightgray)]">
            THE PROBLEM
          </p>
          <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.4rem]">
            <span className="block text-[var(--lightgray)]">275 interruptions a day.</span>
            <GlyphDecodeHeading text="Answered in 3 seconds." className="block text-[var(--bright)]" />
          </h2>
          <p className="text-xs sm:text-sm text-[var(--lightgray)] pt-1">
            People lose focus jumping between Calendar, Gmail, Telegram and Notion. OnQ turns that into one glance.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Graph 1: Microsoft Work Trend Index */}
          <ScrollReveal className="lg:col-span-6 retro-glass-card p-6 space-y-5">
            <div className="space-y-1">
              <div className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--lime)]">
                MICROSOFT WORK TREND INDEX
              </div>
              <h3 className="font-display text-xl font-bold text-[var(--bright)]">
                57% of the day goes to communicating
              </h3>
            </div>

            <div className="space-y-2">
              <svg viewBox="0 0 520 42" className="w-full h-auto" role="img" aria-label="57 percent communicating versus 43 percent creating">
                <rect x="0" y="6" width="520" height="22" fill="#141414" stroke="#37383a" />
                <motion.rect
                  x="0"
                  y="6"
                  height="22"
                  fill="#86FFAF"
                  initial={{ width: 0 }}
                  whileInView={{ width: 296 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.7, ease: MOTION_EASE }}
                />
                <motion.rect
                  x="298"
                  y="6"
                  height="22"
                  fill="#2a2d2c"
                  initial={{ width: 0 }}
                  whileInView={{ width: 222 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.7, delay: 0.15, ease: MOTION_EASE }}
                />
                <text x="10" y="21" fill="#0a0a0a" fontSize="11" fontFamily="monospace" fontWeight="700">
                  57% COMMUNICATING
                </text>
                <text x="312" y="21" fill="#f2f2f2" fontSize="11" fontFamily="monospace" fontWeight="700">
                  43% CREATING
                </text>
              </svg>
            </div>

            <div className="space-y-3 pt-1">
              {wtiBars.map((b, i) => (
                <div key={b.label} className="space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--lightgray)]">{b.label}</span>
                    <span className="font-pixel text-[11px]" style={{ color: b.accent }}>
                      {b.stat}
                    </span>
                  </div>
                  <div className="h-2 bg-[var(--surface)] border border-[var(--hairline)] overflow-hidden">
                    <motion.div
                      className="h-full"
                      style={{ backgroundColor: b.accent }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${b.pct}%` }}
                      viewport={{ once: true, amount: 0.4 }}
                      transition={{ duration: 0.65, delay: i * 0.08, ease: MOTION_EASE }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--lightgray)] border-t border-dashed border-[var(--hairline)] pt-3">
              Sources:{' '}
              <a
                href="https://www.microsoft.com/en-us/worklab/work-trend-index"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--lime)] underline decoration-dashed underline-offset-2 hover:text-[var(--bright)]"
              >
                Microsoft Work Trend Index
              </a>{' '}
              and{' '}
              <a
                href="https://www.atlassian.com/software/state-of-teams"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--lime)] underline decoration-dashed underline-offset-2 hover:text-[var(--bright)]"
              >
                Atlassian State of Teams
              </a>
              .
            </p>
          </ScrollReveal>

          {/* Graph 2: UC Irvine CHI '08 interruption curve */}
          <ScrollReveal delay={0.06} className="lg:col-span-6 retro-glass-card p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-1">
              <div className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]">
                UC IRVINE, CHI 2008
              </div>
              <h3 className="font-display text-xl font-bold text-[var(--bright)]">
                A 90-second phone detour vs a 3-second glance
              </h3>
            </div>

            <svg
              viewBox="0 0 520 210"
              className="w-full h-auto bg-[var(--surface)] border border-dashed border-[var(--hairline)]"
              role="img"
              aria-label="Cognitive load comparison graph between phone workflow and OnQ Even G2"
            >
              {[45, 90, 135, 175].map((y) => (
                <line key={y} x1="48" y1={y} x2="500" y2={y} stroke="#222524" strokeDasharray="3 3" />
              ))}
              <line x1="48" y1="24" x2="48" y2="178" stroke="#37383a" />
              <line x1="48" y1="178" x2="500" y2="178" stroke="#37383a" />

              <text x="10" y="48" fill="#8a8a8a" fontSize="10" fontFamily="monospace">HIGH</text>
              <text x="10" y="112" fill="#8a8a8a" fontSize="10" fontFamily="monospace">MED</text>
              <text x="10" y="176" fill="#8a8a8a" fontSize="10" fontFamily="monospace">LOW</text>
              <text x="52" y="196" fill="#8a8a8a" fontSize="10" fontFamily="monospace">0s</text>
              <text x="235" y="196" fill="#8a8a8a" fontSize="10" fontFamily="monospace">30s</text>
              <text x="425" y="196" fill="#8a8a8a" fontSize="10" fontFamily="monospace">90s</text>

              <motion.path
                d="M 52 162 C 110 42, 195 36, 265 72 C 330 105, 395 44, 492 56"
                fill="none"
                stroke="#ff5a4f"
                strokeWidth="3"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.9, ease: MOTION_EASE }}
              />
              <motion.path
                d="M 52 162 C 105 132, 145 148, 220 156 C 310 162, 405 154, 492 158"
                fill="none"
                stroke="#34F57E"
                strokeWidth="3"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.9, delay: 0.15, ease: MOTION_EASE }}
              />

              <rect x="64" y="24" width="10" height="10" fill="#ff5a4f" />
              <text x="80" y="33" fill="#f2f2f2" fontSize="11" fontFamily="monospace">
                Phone, 4 apps: high stress
              </text>
              <rect x="64" y="128" width="10" height="10" fill="#34F57E" />
              <text x="80" y="137" fill="#86FFAF" fontSize="11" fontFamily="monospace">
                OnQ on glasses: low stress
              </text>
            </svg>

            <p className="text-[11px] text-[var(--lightgray)] border-t border-dashed border-[var(--hairline)] pt-3">
              Study:{' '}
              <a
                href="https://dl.acm.org/doi/10.1145/1357054.1357072"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--g2-phosphor)] underline decoration-dashed underline-offset-2 hover:text-[var(--bright)]"
              >
                Mark, Gudith &amp; Klocke, CHI 2008
              </a>
              .
            </p>
          </ScrollReveal>
        </div>

        {/* Checks from the reproducible harness (docs/HARNESS_EVAL.json) */}
        <ScrollReveal delay={0.07} className="retro-glass-panel p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]">
                TESTED BEHAVIOR
              </div>
              <h3 className="font-display text-xl font-bold text-[var(--bright)]">
                What our checks show
              </h3>
            </div>
            <span className="font-pixel text-[10px] uppercase tracking-[0.14em] text-[var(--verified)]">
              {harnessEval.opticalCompliance.statesChecked} display states checked
            </span>
          </div>

          <div className="space-y-3 max-w-2xl">
            {evalMetrics.map((m, idx) => (
              <div key={m.label} className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-[var(--lightgray)]">{m.label}</span>
                  <span className="font-pixel text-[10px]" style={{ color: m.accent }}>
                    {m.stat}
                  </span>
                </div>
                <div className="h-2 bg-[var(--surface)] border border-[var(--hairline)] overflow-hidden">
                  <motion.div
                    className="h-full"
                    style={{ backgroundColor: m.accent }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${m.pct}%` }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.6, delay: idx * 0.06, ease: MOTION_EASE }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>

        {/* Verified proof strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="retro-glass-card p-6 space-y-1.5">
            <div className="font-dots text-4xl sm:text-5xl font-black text-[var(--lime)]">
              <KineticNumber value={testCount} />
            </div>
            <div className="font-display text-base font-bold text-[var(--bright)]">Passing tests</div>
            <p className="text-xs text-[var(--lightgray)]">Core, server, sign-in and voice.</p>
          </div>
          <div className="retro-glass-card p-6 space-y-1.5">
            <div className="font-dots text-4xl sm:text-5xl font-black text-[var(--bright)]">
              <KineticNumber value={11} />/11
            </div>
            <div className="font-display text-base font-bold text-[var(--bright)]">Display checks</div>
            <p className="text-xs text-[var(--lightgray)]">Nothing clipped on any lens state.</p>
          </div>
          <div className="retro-glass-card p-6 space-y-1.5">
            <div className="font-dots text-4xl sm:text-5xl font-black text-[var(--g2-phosphor)]">
              <KineticNumber value={10} />/10
            </div>
            <div className="font-display text-base font-bold text-[var(--bright)]">Security checks</div>
            <p className="text-xs text-[var(--lightgray)]">Passed in our security audit.</p>
          </div>
          <div className="retro-glass-card p-6 space-y-1.5">
            <div className="font-dots text-4xl sm:text-5xl font-black text-[var(--bright)]">
              ~$0.001
            </div>
            <div className="font-display text-base font-bold text-[var(--bright)]">Cost per brief</div>
            <p className="text-xs text-[var(--lightgray)]">Basic runs use local rules and Whisper, at no API cost.</p>
          </div>
        </div>

        <details className="border border-dashed border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--lightgray)]">
          <summary className="cursor-pointer font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--bright)]">
            Engineering &amp; audit
          </summary>

          <div className="mt-4 space-y-5">
            <ul className="space-y-1.5 leading-relaxed list-disc pl-4">
              <li>Display gate: zero clipping on every lens state and at least 97% black field (11/11).</li>
              <li>Security audit (10/10): AES-256-GCM vault at mode 0600, PKCE, 409 lock, no secret or CDN leaks.</li>
              <li>Cost per brief is quoted for the $7/mo Pro plan.</li>
              <li>Atlassian figures: 275 daily pings, 117 emails and 153 chats a day.</li>
              <li>The interruption curves are illustrative, drawn from the CHI 2008 finding. They are not measured data.</li>
              <li>Checks are reproducible with npm run eval:harness. Results are in docs/HARNESS_EVAL.json.</li>
            </ul>

            <div className="space-y-2">
              <div className="font-pixel text-[9px] uppercase tracking-[0.16em] text-[var(--lightgray)]">
                Failover latency (8000 ms cap, Code-Guard active)
              </div>
              {harnessEval.failoverMatrix.map((row) => (
                <div key={row.scenario} className={detailsRowClass}>
                  <span className="text-[var(--bright)] font-medium">{row.scenario}</span>
                  <div className="flex items-center gap-3 font-pixel text-[10px]">
                    <span className="text-[var(--g2-phosphor)]">{row.providerUsed}</span>
                    <span className="text-[var(--lightgray)]">{row.hops} hop{row.hops === 1 ? '' : 's'}</span>
                    <span className="text-[var(--lime)]">{row.latencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="font-pixel text-[9px] uppercase tracking-[0.16em] text-[var(--lightgray)]">
                Even Hub apps compared (bars are our own rating, live in browser and simulator)
              </div>
              {fieldMatrix.map((row, idx) => (
                <div
                  key={row.entry}
                  className={`p-3 border ${
                    row.highlight
                      ? 'border-[var(--lime)] bg-[var(--lime-deep)]/40'
                      : 'border-dashed border-[var(--hairline)] bg-[var(--ink)]'
                  }`}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                    <div className="lg:col-span-3 font-pixel text-[11px]" style={{ color: row.highlight ? '#86FFAF' : '#8a8a8a' }}>
                      {row.entry}
                    </div>
                    <div className="lg:col-span-4">{row.scope} · {row.lifecycle}</div>
                    <div className="lg:col-span-3">{row.safety}</div>
                    <div className="lg:col-span-2 flex items-center gap-2 justify-between lg:justify-end">
                      <div className="w-24 h-2 bg-black border border-[var(--hairline)] overflow-hidden">
                        <motion.div
                          className="h-full"
                          style={{ backgroundColor: row.highlight ? '#34F57E' : '#525252' }}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${row.score}%` }}
                          viewport={{ once: true, amount: 0.3 }}
                          transition={{ duration: 0.6, delay: idx * 0.06, ease: MOTION_EASE }}
                        />
                      </div>
                      <span className={`font-pixel text-[10px] shrink-0 ${row.highlight ? 'text-[var(--lime)]' : 'text-[var(--lightgray)]'}`}>
                        {row.tests}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
