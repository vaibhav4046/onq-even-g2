import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { GlyphDecodeHeading, MOTION_EASE } from './MotionPrimitives';
import { ShieldPixelSvg } from './EcosystemIcons';

const SAFETY_BEATS = [
  {
    id: '01',
    title: 'Ignores pocket noise',
    summary: 'Accidental bumps or short rustles are dropped on-device before any speech call runs.',
    header: 'VOICE | NOISE FILTERED',
    lines: [
      '0.21s clip - too quiet to wake',
      'Dropped locally before voice queue',
      '0 wasted calls - 0 accidental replies',
    ],
    footer: 'TAP: RETRY VOICE | 2xTAP: BACK',
    statusTag: 'NOISE GUARD',
    accent: 'text-[var(--verified)] border-[var(--verified)]',
    ringProgress: 0,
  },
  {
    id: '02',
    title: 'Always asks first',
    summary: 'Voice drafts the plan, never sends blindly. You pick YES on the preview before anything leaves.',
    header: 'ASK FIRST | CONFIRM SEND',
    lines: [
      '1) CALENDAR: VC Sync 14:00 -> 14:15',
      '2) GMAIL: Reply Priya Nair (Thread)',
      '> [NO - CANCEL]   [YES - ARM 2.0s]',
    ],
    footer: 'SWIPE: SWITCH | TAP: CONFIRM',
    statusTag: 'DEFAULTS TO NO',
    accent: 'text-[var(--bright)] border-[var(--bright)]',
    ringProgress: 0,
  },
  {
    id: '03',
    title: '2-second cancel ring',
    summary: 'Confirming sweeps a 2-second ring in your lens. Tap once anywhere to stop with zero messages sent.',
    header: 'SENDING IN 1.0s | TAP TO CANCEL',
    lines: [
      '2-second ring counting down on lens',
      'ID #efcb36 - any tap aborts cleanly',
      'Zero edits sent until 0.0s',
    ],
    footer: 'SAFE CANCEL WINDOW ACTIVE',
    statusTag: 'TAP TO CANCEL',
    accent: 'text-[var(--lime)] border-[var(--lime)]',
    ringProgress: 0.62,
  },
  {
    id: '04',
    title: 'Blocks double-bookings',
    summary: 'Right before saving, OnQ checks if that slot was just taken. If busy, it stops and offers the next open time.',
    header: 'BLOCKED | 14:45 SLOT BUSY',
    lines: [
      '14:45 busy (Design Review)',
      '0 calendar edits - 0 emails sent',
      'NEXT OPEN SLOT: 15:45 (30m)',
    ],
    footer: 'TAP: BOOK 15:45 | 2xTAP: DISMISS',
    statusTag: 'NO OVERWRITES',
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
            BUILT-IN SAFETY
          </p>
          <h2 className="font-dots font-black leading-[0.95] tracking-[-0.01em] text-[2rem] sm:text-[2.75rem] lg:text-[3.5rem]">
            <span className="block text-[var(--lightgray)]">Nothing sends blindly.</span>
            <GlyphDecodeHeading text="You always confirm first." className="block text-[var(--bright)]" />
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* Sticky left waveguide stage */}
          <div className="lg:col-span-7 lg:sticky lg:top-24 space-y-4">
            <div className="retro-glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 font-pixel text-[10px] uppercase tracking-[0.18em] text-[var(--bright)]">
                  <ShieldPixelSvg className="w-4 h-4" />
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
