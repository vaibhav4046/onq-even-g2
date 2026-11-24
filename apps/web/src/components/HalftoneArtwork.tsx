import { useEffect, useRef } from 'react';

interface HalftoneArtworkProps {
  variant: 'optics' | 'wave' | 'ring';
  theme?: 'dark' | 'light';
  className?: string;
}

/**
 * Procedural dot-matrix halftone canvas matching KaneCLI's monochrome halftone aesthetic,
 * depicting Even G2 optical waveguide and R1 ring geometry with subtle pointer dispersion.
 */
export function HalftoneArtwork({ variant, theme = 'dark', className = '' }: HalftoneArtworkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({ x: -999, y: -999, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const step = 7;
    let rafId = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const ink = theme === 'light' ? '#0a0a0a' : '#f2f2f2';
      const accent = theme === 'light' ? '#0a0a0a' : '#daff52';
      const ptr = pointerRef.current;

      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          const nx = x / w;
          const ny = y / h;
          let intensity = 0;

          if (variant === 'optics') {
            // Two stylized rectangular waveguide lens frames + bridge
            const leftLens = Math.abs(nx - 0.31) < 0.16 && Math.abs(ny - 0.5) < 0.22;
            const rightLens = Math.abs(nx - 0.69) < 0.16 && Math.abs(ny - 0.5) < 0.22;
            const bridge = Math.abs(nx - 0.5) < 0.05 && Math.abs(ny - 0.44) < 0.03;
            const distL = Math.hypot(nx - 0.31, ny - 0.5);
            const distR = Math.hypot(nx - 0.69, ny - 0.5);
            if (leftLens || rightLens || bridge) {
              intensity = 0.85 - Math.min(distL, distR) * 1.4;
            } else {
              intensity = Math.max(0, 0.28 - Math.hypot(nx - 0.5, ny - 0.5) * 0.45);
            }
          } else if (variant === 'ring') {
            const dist = Math.hypot(nx - 0.5, ny - 0.5);
            if (dist >= 0.22 && dist <= 0.38) {
              intensity = 0.95 - Math.abs(dist - 0.3) * 4;
            } else if (dist < 0.1) {
              intensity = 0.6;
            }
          } else {
            // wave
            const waveY = 0.5 + Math.sin(nx * Math.PI * 3) * 0.22;
            const d = Math.abs(ny - waveY);
            intensity = Math.max(0, 0.9 - d * 3.8);
          }

          if (intensity <= 0.06) continue;

          let dx = 0;
          let dy = 0;
          if (ptr.active) {
            const px = x - ptr.x;
            const py = y - ptr.y;
            const pd = Math.hypot(px, py);
            if (pd > 0 && pd < 56) {
              const push = ((56 - pd) / 56) * 10;
              dx = (px / pd) * push;
              dy = (py / pd) * push;
            }
          }

          const radius = Math.max(0.6, Math.min(2.8, intensity * 2.8));
          ctx.fillStyle = intensity > 0.72 && variant === 'ring' ? accent : ink;
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [variant, theme]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={200}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        pointerRef.current = {
          x: ((e.clientX - rect.left) / rect.width) * 320,
          y: ((e.clientY - rect.top) / rect.height) * 200,
          active: true,
        };
      }}
      onMouseLeave={() => {
        pointerRef.current.active = false;
      }}
      className={`block ${className}`}
      aria-hidden="true"
    />
  );
}
