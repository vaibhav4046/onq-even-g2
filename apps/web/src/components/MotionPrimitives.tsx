import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, useInView, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { decodeText } from '../lib/binaryMath';

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

/**
 * Bits-to-text reveal. The real text always owns the layout (it is only hidden while the overlay runs),
 * and the 0/1 overlay is absolutely positioned, so the reveal can never move the page (no CLS).
 */
export function GlyphDecodeHeading({ text, className = '' }: GlyphDecodeHeadingProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();
  const [overlay, setOverlay] = useState<string | null>(null);

  useEffect(() => {
    if (reduced || !inView) return;
    const totalFrames = 16;
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      if (frame >= totalFrames) {
        window.clearInterval(id);
        setOverlay(null);
        return;
      }
      setOverlay(decodeText(text, frame / totalFrames, frame));
    }, 28);
    return () => {
      window.clearInterval(id);
      setOverlay(null);
    };
  }, [inView, reduced, text]);

  return (
    <span ref={ref} className={`relative ${className}`}>
      <span style={overlay === null ? undefined : { opacity: 0 }}>{text}</span>
      {overlay !== null && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 text-[var(--g2-phosphor)]">
          {overlay}
        </span>
      )}
    </span>
  );
}

const STAGGER_PARENT = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
const STAGGER_CHILD = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: MOTION_EASE } },
};

/** Cards enter one after another once the group is on screen. Opacity and transform only. */
export function Stagger({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      variants={STAGGER_PARENT}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.1 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div variants={STAGGER_CHILD} className={className}>
      {children}
    </motion.div>
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
