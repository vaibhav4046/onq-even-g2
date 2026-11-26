import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { BinaryField } from './BinaryField';
import { GlyphDecodeHeading, MOTION_EASE } from './MotionPrimitives';
import { loopPoints, makeClosedPath } from '../lib/binaryMath';

const STEPS = [
  { title: 'Glance', body: 'Your next meeting and the email that needs you show up on the lens.' },
  { title: 'Say it or tap', body: 'One short phrase, or a tap on the R1 ring.' },
  { title: 'Draft ready', body: 'AI or a smart default writes the reply or change. The default answer is NO.' },
  { title: 'Confirm', body: 'You say yes. Nothing is sent before that.' },
  { title: '2s undo ring', body: 'A 2-second ring runs. Tap once to cancel.' },
  { title: 'Done', body: 'Calendar, Gmail and Notion update. A receipt is logged.' },
] as const;

const LAST = STEPS.length - 1;
// The comet sits on step i at u = i / STEPS.length, so the last step is LAST / STEPS.length along the loop.
const LAST_U = LAST / STEPS.length;
const LOOP = loopPoints(96);

/**
 * Sticky scroll through the read-and-write loop. Bits stream around the loop, a bright comet
 * follows the active step. Reduced motion: no pinning, all six steps listed, one static frame.
 */
export function LoopSection() {
  const reduced = useReducedMotion();
  const outerRef = useRef<HTMLElement | null>(null);
  const cometRef = useRef(0);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: outerRef, offset: ['start start', 'end end'] });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const u = Math.min(1, Math.max(0, v)) * LAST_U;
    cometRef.current = u;
    const next = Math.min(LAST, Math.max(0, Math.round(u * STEPS.length)));
    setStep((prev) => (prev === next ? prev : next));
  });

  const nodes = useMemo(() => {
    const path = makeClosedPath(LOOP, 1, 1);
    return STEPS.map((_, i) => path.at(i / STEPS.length));
  }, []);

  const staticComet = useRef(LAST_U);

  return (
    <section
      id="loop"
      ref={outerRef}
      aria-labelledby="loop-heading"
      className="relative"
      style={reduced ? undefined : { height: '340vh' }}
    >
      <div
        className={
          reduced
            ? 'py-20 sm:py-28'
            : 'sticky top-16 flex h-[calc(100svh-4rem)] min-h-[30rem] flex-col justify-center overflow-hidden py-6'
        }
      >
        <div className="container-page space-y-4 sm:space-y-6">
          <div className="max-w-2xl mx-auto text-center space-y-3">
            <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--g2-phosphor)]">The loop</p>
            <h2
              id="loop-heading"
              className="font-dots font-black leading-[0.95] text-[2.2rem] sm:text-[3.2rem] text-[var(--bright)]"
            >
              <GlyphDecodeHeading text="Read it. Write it." />
            </h2>
          </div>

          <div className="relative mx-auto aspect-[4/5] w-full max-w-5xl sm:aspect-[16/9] max-h-[56svh]">
            <BinaryField
              mode="stream"
              path={LOOP}
              progressRef={reduced ? staticComet : cometRef}
              className="absolute inset-0 h-full w-full"
            />

            {nodes.map((p, i) => {
              const active = i === step;
              return (
                <div
                  key={STEPS[i].title}
                  aria-hidden="true"
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                >
                  <span
                    className={`ob-pill !px-2.5 !py-1 inline-flex items-center gap-1.5 font-pixel text-[10px] uppercase tracking-[0.1em] whitespace-nowrap transition-[color,border-color,background-color] duration-300 ${
                      active
                        ? '!border-[var(--g2-phosphor)] !text-[var(--g2-phosphor)] bg-black'
                        : '!text-[var(--lightgray)] bg-black/80'
                    }`}
                  >
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <span className="hidden sm:inline">{STEPS[i].title}</span>
                  </span>
                </div>
              );
            })}

            <div className="absolute inset-x-[18%] top-1/2 -translate-y-1/2 text-center">
              {reduced ? null : (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22, ease: MOTION_EASE }}
                    className="mx-auto flex min-h-[8.5rem] max-w-md flex-col items-center justify-center gap-2 rounded-[22px] bg-black/70 px-4 py-4 backdrop-blur-sm"
                  >
                    <p className="font-pixel text-[10px] uppercase tracking-[0.18em] text-[var(--g2-phosphor)]">
                      Step {step + 1} of {STEPS.length}
                    </p>
                    <p className="font-display text-xl sm:text-3xl font-semibold text-[var(--bright)] leading-tight">
                      {STEPS[step].title}
                    </p>
                    <p className="text-xs sm:text-sm text-[var(--lightgray)] leading-relaxed">{STEPS[step].body}</p>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>

        {/* Full list for screen readers, and the visible fallback when motion is reduced. */}
        <ol
          className={
            reduced
              ? 'container-page mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'
              : 'sr-only'
          }
        >
          {STEPS.map((s, i) => (
            <li key={s.title} className={reduced ? 'ob-card px-5 py-4 space-y-1' : undefined}>
              <p className={reduced ? 'font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]' : undefined}>
                {i + 1}. {s.title}
              </p>
              <p className={reduced ? 'text-sm text-[var(--lightgray)]' : undefined}>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
