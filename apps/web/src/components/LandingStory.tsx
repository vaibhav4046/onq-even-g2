import { useEffect, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { GlyphDecodeHeading, MOTION_EASE, ScrollReveal } from './MotionPrimitives';
import { VERIFIED_TEST_COUNT } from '../verifiedCounts';

/** Muted looping clip that only plays while on screen. Reduced motion: poster + controls, no autoplay. */
function LoopVideo({ name, label }: { name: string; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const reduced = useReducedMotion();

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (inView && !reduced) {
      v.muted = true;
      void v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  }, [inView, reduced]);

  return (
    <video
      ref={ref}
      src={`/clips/${name}.mp4`}
      poster={`/clips/${name}.jpg`}
      aria-label={label}
      muted
      loop
      playsInline
      autoPlay={!reduced}
      controls={Boolean(reduced)}
      preload="metadata"
      width={1280}
      height={720}
      className="block w-full h-auto aspect-video object-cover bg-black"
    />
  );
}

const CLIPS = [
  {
    name: 'real-app-ring',
    tag: 'Screen recording',
    title: 'Confirm, then a 2-second undo ring',
    body: 'The draft is ready. Confirm once and the ring runs. Tap to cancel.',
  },
  {
    name: 'real-app-receipt',
    tag: 'Screen recording',
    title: 'Done, with a receipt',
    body: 'Calendar moves, Gmail replies in the thread, a receipt is logged.',
  },
  {
    name: 'running-late',
    tag: 'Simulator capture',
    title: 'One phrase',
    body: 'Say "Push 15m and tell Investor". OnQ drafts it and waits for your yes.',
  },
  {
    name: 'double-booking-lock',
    tag: 'Simulator capture',
    title: 'Double-booking lock',
    body: 'A taken slot is blocked. You get the next free time instead.',
  },
  {
    name: 'telegram-approvals',
    tag: 'Simulator capture',
    title: 'Telegram on the lens',
    body: 'Only chats you pick. OnQ drafts the reply, you approve it on the glasses.',
  },
] as const;

export function ClipCards() {
  return (
    <section id="clips" aria-labelledby="clips-heading" className="py-20 sm:py-28">
      <div className="container-page space-y-10">
        <ScrollReveal className="max-w-2xl mx-auto text-center space-y-3">
          <h2 id="clips-heading" className="font-dots font-black leading-[0.95] text-[2.4rem] sm:text-[3.4rem] text-[var(--bright)]">
            <GlyphDecodeHeading text="Watch it work" />
          </h2>
          <p className="text-sm sm:text-base text-[var(--lightgray)]">
            Real screen recording and real Even Hub simulator captures.
          </p>
        </ScrollReveal>

        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {CLIPS.map((clip, i) => (
            <li key={clip.name} className={i === 0 ? 'md:col-span-2' : ''}>
              <ScrollReveal delay={i === 0 ? 0 : 0.05 * (i % 2)} className="ob-card p-2 sm:p-2.5 h-full">
                <div className="overflow-hidden rounded-[20px] border border-white/5">
                  <LoopVideo name={clip.name} label={`${clip.title}: ${clip.body}`} />
                </div>
                <div className="px-3 sm:px-4 pt-4 pb-3 space-y-1.5">
                  <p className="font-pixel text-[10px] uppercase tracking-[0.16em] text-[var(--g2-phosphor)]">{clip.tag}</p>
                  <h3 className="font-display text-lg sm:text-xl font-semibold text-[var(--bright)]">{clip.title}</h3>
                  <p className="text-sm text-[var(--lightgray)] leading-relaxed">{clip.body}</p>
                </div>
              </ScrollReveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export interface DayStoryActions {
  openLens: () => void;
  runLate: () => void;
  startScribe: () => void;
  tryLock: () => void;
  stageTelegram: () => void;
}

interface Chapter {
  time: string;
  title: string;
  body: string;
  img: string;
  imgAlt: string;
  cta: { label: string; run: keyof DayStoryActions };
}

const CHAPTERS: Chapter[] = [
  {
    time: '07:30',
    title: 'Morning brief',
    body: 'Your next meeting, the email that needs you and the doc. One glance.',
    img: '/stills/sim-01-dossier.png',
    imgAlt: 'Simulator capture: meeting brief for Investor call',
    cta: { label: 'See it on the lens', run: 'openLens' },
  },
  {
    time: '09:50',
    title: 'Running late',
    body: 'Say "Push 15m and tell Investor". Nothing sends until you confirm.',
    img: '/stills/sim-05-armed-ring.png',
    imgAlt: 'Simulator capture: 2-second confirm ring',
    cta: { label: 'Run Shift + Reply', run: 'runLate' },
  },
  {
    time: '10:30',
    title: 'Meeting scribe',
    body: 'Tells speakers apart and keeps notes in memory only. Wrap up into tasks.',
    img: '/clips/meeting-scribe.jpg',
    imgAlt: 'Pixel film frame with a real simulator capture of the meeting scribe',
    cta: { label: 'Start Live Meeting Scribe', run: 'startScribe' },
  },
  {
    time: '13:00',
    title: 'Double-booking lock',
    body: 'Someone asks for a taken slot. OnQ blocks it and offers the next free time.',
    img: '/stills/sim-07-conflict-409.png',
    imgAlt: 'Simulator capture: slot busy, next free time offered',
    cta: { label: 'Try the lock', run: 'tryLock' },
  },
  {
    time: '15:00',
    title: 'Telegram reply',
    body: 'Only chats you pick reach the lens. OnQ drafts the reply. You approve it on the glasses.',
    img: '/stills/sim-10-telegram.png',
    imgAlt: 'Simulator capture: Telegram card on the lens',
    cta: { label: 'Stage Telegram Brief', run: 'stageTelegram' },
  },
];

/** Sticky stacked day story: heading pins on the left, each hour stacks over the last. */
export function DayStory({ actions }: { actions: DayStoryActions }) {
  const reduced = useReducedMotion();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
      <ScrollReveal className="lg:col-span-4 lg:sticky lg:top-24 self-start space-y-4">
        <p className="font-pixel text-[11px] uppercase tracking-[0.22em] text-[var(--g2-phosphor)]">One day with OnQ</p>
        <h2 className="font-dots font-black leading-[0.95] text-[2.4rem] sm:text-[3.2rem] text-[var(--bright)]">
          <GlyphDecodeHeading text="Your day" />
        </h2>
        <p className="text-sm sm:text-base text-[var(--lightgray)] leading-relaxed max-w-sm">
          Five moments. Each one runs here in your browser. Tap to try.
        </p>
      </ScrollReveal>

      <ol className="lg:col-span-8 space-y-6">
        {CHAPTERS.map((ch, i) => (
          <li key={ch.title} className="lg:sticky" style={{ top: `${96 + i * 12}px` }}>
            <motion.article
              initial={reduced ? false : { opacity: 0, y: 28, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, ease: MOTION_EASE }}
              className="ob-card ob-card-solid p-5 sm:p-7 grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-7 items-center"
            >
              <div className="space-y-3 order-2 md:order-1">
                <div className="flex items-center justify-between gap-3 font-pixel text-[10px] uppercase tracking-[0.16em]">
                  <span className="text-[var(--g2-phosphor)]">{ch.time}</span>
                  <span className="text-[var(--lightgray)]">
                    {String(i + 1).padStart(2, '0')} / {String(CHAPTERS.length).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="font-display text-2xl sm:text-[1.75rem] font-semibold text-[var(--bright)] leading-tight">{ch.title}</h3>
                <p className="text-sm text-[var(--lightgray)] leading-relaxed">{ch.body}</p>
                <button
                  type="button"
                  onClick={actions[ch.cta.run]}
                  className="retro-btn-glass mt-1 inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm text-[var(--bright)] hover:text-[var(--lime)] cursor-pointer"
                >
                  {ch.cta.label}
                  <span aria-hidden="true">-&gt;</span>
                </button>
              </div>
              <div className="order-1 md:order-2 overflow-hidden rounded-[18px] border border-[var(--g2-phosphor)]/20 bg-black">
                <img
                  src={ch.img}
                  alt={ch.imgAlt}
                  width={576}
                  height={288}
                  loading="lazy"
                  decoding="async"
                  className={`block w-full h-auto ${ch.img.endsWith('.png') ? 'aspect-[2/1] object-contain' : 'aspect-video object-cover'}`}
                />
              </div>
            </motion.article>
          </li>
        ))}
      </ol>
    </div>
  );
}

const TRACK_APPS = ['Google Calendar', 'Gmail', 'Google Drive', 'Notion', 'Telegram', 'Claude', 'ChatGPT', 'OpenRouter', 'AssemblyAI'];

export function ProofStrip() {
  const stats = [
    { value: String(VERIFIED_TEST_COUNT), label: 'automated tests' },
    { value: '32/32', label: 'eval intents' },
    { value: '11/11', label: 'display geometry gates' },
    { value: '10/10', label: 'security checks' },
    { value: '13', label: 'simulator captures' },
  ];
  return (
    <section id="proof" aria-label="Proof" className="py-16 sm:py-20">
      <div className="container-page space-y-8">
        <ScrollReveal className="ob-card p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-dots font-black text-[1.9rem] sm:text-[2.4rem] text-[var(--bright)]"><GlyphDecodeHeading text="Proof" /></h2>
            <p className="text-xs sm:text-sm text-[var(--lightgray)]">Verified in the simulator. Physical glasses are next.</p>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-5">
            {stats.map((s) => (
              <div key={s.label} className="space-y-1">
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-3xl sm:text-4xl font-semibold text-[var(--g2-phosphor)] tabular-nums">{s.value}</dd>
                <dd className="text-xs text-[var(--lightgray)]">{s.label}</dd>
              </div>
            ))}
          </dl>
        </ScrollReveal>

        <div className="ob-marquee" aria-label="Works with">
          <ul className="ob-marquee-track">
            {[...TRACK_APPS, ...TRACK_APPS].map((app, i) => (
              <li key={`${app}-${i}`} aria-hidden={i >= TRACK_APPS.length} className="ob-pill">
                {app}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
