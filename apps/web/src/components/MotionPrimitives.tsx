import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, useInView, useReducedMotion, useScroll, useSpring } from 'motion/react';

export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export function ScrollProgressRail() {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 32,
    restDelta: 0.001,
  });

  if (reduced) return null;

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX, transformOrigin: '0% 50%' }}
      className="fixed top-0 left-0 right-0 h-[2px] bg-[var(--lime)] z-50 pointer-events-none"
    />
  );
}

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function ScrollReveal({ children, className = '', delay = 0 }: ScrollRevealProps) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.42, delay, ease: MOTION_EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * 60fps GPU-friendly spotlight bento card inspired by 21st.dev & 60fps.design.
 */
export function SpotlightBentoCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
      }}
      className={`group relative overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 ${className}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(52,245,126,0.16), transparent 68%)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

interface GlyphDecodeHeadingProps {
  text: string;
  className?: string;
}

// No "." or "+": a lingering scramble glyph must never read as a stray plus or period.
const SCRAMBLE_GLYPHS = ':-=*#%01';

export function GlyphDecodeHeading({ text, className = '' }: GlyphDecodeHeadingProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();
  const [rendered, setRendered] = useState(text);

  useEffect(() => {
    if (reduced || !inView) {
      setRendered(text);
      return;
    }

    const totalFrames = 14;
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      const revealCount = Math.floor((frame / totalFrames) * text.length);
      const next = text
        .split('')
        .map((ch, idx) => {
          if (ch === ' ' || idx < revealCount) return ch;
          return SCRAMBLE_GLYPHS[(idx + frame) % SCRAMBLE_GLYPHS.length];
        })
        .join('');
      setRendered(next);
      if (frame >= totalFrames) {
        window.clearInterval(id);
        setRendered(text);
      }
    }, 26);

    return () => window.clearInterval(id);
  }, [inView, reduced, text]);

  return (
    <span ref={ref} className={className}>
      {rendered}
    </span>
  );
}

interface KineticNumberProps {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}

export function KineticNumber({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  className = '',
}: KineticNumberProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduced || !inView) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const duration = 680;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
