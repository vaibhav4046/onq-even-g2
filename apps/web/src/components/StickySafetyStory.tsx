import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { GlyphDecodeHeading, MOTION_EASE } from './MotionPrimitives';
import { ShieldLockLogo } from './PixelLogos';

const SAFETY_BEATS = [
  {
    id: '01',
    title: 'RMS Silence Gate',
    summary: 'Accidental corridor taps below 350ms or RMS 0.012 abort on-device with zero Whisper or LLM calls.',
    header: 'VOICE | RMS SILENCE GATE BLOCKED',
    lines: [
      '0.21s clip · RMS 0.003 < 0.012',
      'Dropped locally before STT queue',
      '0 Whisper calls · 0 API tokens spent',
    ],
    footer: 'TAP: RETRY VOICE | 2xTAP: BACK',
    statusTag: 'ON-DEVICE AUDIO FILTER',
    accent: 'text-[var(--verified)] border-[var(--verified)]',
    ringProgress: 0,
  },
  {
    id: '02',
    title: 'Default-NO Staging',
    summary: 'Speech never fires a mutation. Voice only stages a 45s single-use preview defaulting to [NO - CANCEL].',
    header: 'LIVE | CONFIRM ACTION (43s TTL)',
    lines: [
      '1) GCAL: VC Sync 14:00 -> 14:15',
      '2) GMAIL: Reply Priya Nair (Thread)',
      '> [NO - CANCEL]   [YES - ARM 2.0s]',
    ],
    footer: 'SWIPE: TOGGLE | TAP: SELECT',
    statusTag: 'CURSOR LOCKED ON NO',
    accent: 'text-[var(--bright)] border-[var(--bright)]',
    ringProgress: 0,
  },
  {
    id: '03',
    title: '2.0s 4-Bit PNG Ring',
    summary: 'Selecting YES sweeps a 76x76 waveguide countdown ring. Any tap cancels clean; 0.0s locks inputs synchronously.',
    header: 'LIVE | ARMED · TAP TO CANCEL 1.0s',
    lines: [
      '76x76 4-bit Gray8 ring sweeping',
      'IDEMP #efcb36 · ANY TAP = 0 WRITES',
      '0.0s locks buttons before network I/O',
    ],
    footer: 'SYNCHRONOUS STATE LOCK ACTIVE',
    statusTag: 'CANCELABLE COMMIT WINDOW',
    accent: 'text-[var(--lime)] border-[var(--lime)]',
    ringProgress: 0.62,
  },
  {
    id: '04',
    title: 'HTTP 409 Conflict Hard-Lock',
    summary: 'Before writing, the relay re-checks Free/Busy and thread historyId. Overlaps or drift abort with 409 and surface the next free slot.',
    header: 'LIVE | !! LOCKED (409) BLOCKED',
    lines: [
      '14:45 occupied (Design Review)',
      'NO CALENDAR EDIT · NO EMAIL SENT',
      'NEXT VERIFIED SLOT: 15:45 (30m)',
    ],
    footer: 'TAP: STAGE 15:45 | 2xTAP: DISMISS',
    statusTag: 'ZERO DOUBLE-BOOKINGS',
    accent: 'text-[var(--warning)] border-[var(--warning)]',
    ringProgress: 0,
  },
] as const;

export function StickySafetyStory() {
  const [activeIdx, setActiveIdx] = useState(0);
  const reduced = useReducedMotion();
  const beat = SAFETY_BEATS[activeIdx] ?? SAFETY_BEATS[0];

  return (
    <section id="safety" className="section-rule py-20 sm:py-28">
      <div className="container-page space-y-12">
        <div className="space-y-3 max-w-2xl">
          <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--lightgray)]">
            WRITE SAFETY ARCHITECTURE
          </p>
          <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
            <span className="block text-[var(--lightgray)]">Voice stages.</span>
            <GlyphDecodeHeading text="Four deterministic locks." className="block text-[var(--bright)]" />
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* Sticky left waveguide stage */}
          <div className="lg:col-span-7 lg:sticky lg:top-24 space-y-4">
            <div className="border border-dashed border-[var(--hairline)] bg-[var(--surface)] p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.18em] text-[var(--bright)]">
                  <ShieldLockLogo className="w-4 h-4" />
                  <span>LOCK 0{activeIdx + 1} / 04</span>
                </span>
                <span className={`border px-2 py-0.5 font-pixel text-[9px] uppercase tracking-[0.12em] ${beat.accent}`}>
                  {beat.statusTag}
                </span>
              </div>

              <div className="g2-lens-scaler overflow-x-auto">
                <div className="g2-lens-canvas g2-lens-waveguide relative">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={beat.id}
                      initial={reduced ? undefined : { opacity: 0, y: 6 }}
                      animate={reduced ? undefined : { opacity: 1, y: 0 }}
                      exit={reduced ? undefined : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.22, ease: MOTION_EASE }}
                      className="h-full flex flex-col justify-between"
                    >
                      <div className="text-[14px] tracking-[0.04em] border-b border-dashed border-[var(--g2-dim)] pb-2">
                        {beat.header}
                      </div>

                      <div className="flex items-center gap-4 py-2">
                        {beat.ringProgress > 0 && (
                          <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0" aria-hidden="true">
                            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(52,245,126,0.22)" strokeWidth="5" />
                            <motion.circle
                              cx="32"
                              cy="32"
                              r="26"
                              fill="none"
                              stroke="#34f57e"
                              strokeWidth="5"
                              strokeDasharray={163}
                              initial={{ strokeDashoffset: 163 }}
                              animate={{ strokeDashoffset: 163 * (1 - beat.ringProgress) }}
                              transition={{ duration: 0.9, ease: MOTION_EASE }}
                              transform="rotate(-90 32 32)"
                            />
                          </svg>
                        )}
                        <div className="space-y-1 text-[13px] leading-snug">
                          {beat.lines.map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      </div>

                      <div className="text-[12px] border-t border-dashed border-[var(--g2-dim)] pt-2 text-[var(--g2-dim)]">
                        {beat.footer}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* Interactive step jump pills */}
              <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="Safety architecture steps">
                {SAFETY_BEATS.map((item, idx) => {
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveIdx(idx)}
                      className={`py-1.5 border font-pixel text-[10px] uppercase tracking-[0.14em] cursor-pointer transition-colors ${
                        active
                          ? 'border-[var(--lime)] bg-[var(--lime-deep)] text-[var(--lime)]'
                          : 'border-[var(--hairline)] bg-[var(--ink)] text-[var(--lightgray)] hover:text-[var(--bright)]'
                      }`}
                    >
                      {item.id}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right scrollable editorial beats */}
          <div className="lg:col-span-5 space-y-6">
            {SAFETY_BEATS.map((item, idx) => {
              const active = idx === activeIdx;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  onViewportEnter={() => setActiveIdx(idx)}
                  viewport={{ amount: 0.65 }}
                  initial={reduced ? undefined : { opacity: 0.55 }}
                  animate={reduced ? undefined : { opacity: active ? 1 : 0.5 }}
                  transition={{ duration: 0.28, ease: MOTION_EASE }}
                  className={`w-full text-left border-l-2 pl-6 py-6 sm:py-8 cursor-pointer transition-colors ${
                    active ? 'border-[var(--lime)]' : 'border-[var(--hairline)] hover:border-[var(--lightgray)]'
                  }`}
                >
                  <div className="font-dots text-3xl font-black text-[var(--lime)]">{item.id}</div>
                  <h3 className="font-display text-2xl font-bold text-[var(--bright)] mt-2">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-[var(--lightgray)] mt-2 max-w-md">{item.summary}</p>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
