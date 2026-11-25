import { useEffect, useRef } from 'react';

interface PhosphorMeshShaderProps {
  className?: string;
  intensity?: number;
}

const VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Domain-warped 525nm monochrome matrix-green phosphor field (respects reduced motion via low dt)
const FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec2 u_res;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform float u_intensity;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.04 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / max(u_res, vec2(1.0));
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_res.x / max(u_res.y, 1.0);

    vec2 q = vec2(
      fbm(p * 1.45 + vec2(0.0, u_time * 0.09)),
      fbm(p * 1.45 + vec2(4.2, -u_time * 0.07))
    );
    float f = fbm(p * 1.7 + 2.2 * q + vec2(u_time * 0.04, -u_time * 0.05));

    // Subtle pointer phosphor bloom
    vec2 mp = (u_mouse * 2.0 - 1.0);
    mp.x *= u_res.x / max(u_res.y, 1.0);
    float mGlow = exp(-dot(p - mp, p - mp) * 2.6) * 0.38;

    // Subtle optical scanline & waveguide vignette
    float scan = 0.94 + 0.06 * sin(gl_FragCoord.y * 0.45);
    float vig = smoothstep(1.65, 0.15, length(p * vec2(0.82, 1.05)));

    float energy = clamp((f * 0.85 + mGlow) * vig * scan * u_intensity, 0.0, 1.0);
    vec3 obsidian = vec3(0.025, 0.032, 0.027);
    vec3 pine = vec3(0.04, 0.22, 0.11);
    vec3 phosphor = vec3(0.204, 0.961, 0.494); // #34F57E

    vec3 col = mix(obsidian, pine, smoothstep(0.18, 0.62, energy));
    col = mix(col, phosphor * 0.36, smoothstep(0.64, 1.0, energy));
    gl_FragColor = vec4(col, 0.88);
  }
`;

export function PhosphorMeshShader({ className = '', intensity = 0.92 }: PhosphorMeshShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const mouse = { x: 0.65, y: 0.45 };
    const handleMove = (e: MouseEvent) => {
      mouse.x = e.clientX / Math.max(1, window.innerWidth);
      mouse.y = 1 - e.clientY / Math.max(1, window.innerHeight);
    };
    window.addEventListener('mousemove', handleMove, { passive: true });

    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' });
    let rafId = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
      const h = Math.max(1, Math.floor((canvas.clientHeight || 520) * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    if (gl) {
      const compile = (type: number, src: string) => {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      const prog = vs && fs ? gl.createProgram() : null;
      if (prog && vs && fs) {
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
      }
      if (prog && gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(prog, 'a_position');
        const resLoc = gl.getUniformLocation(prog, 'u_res');
        const timeLoc = gl.getUniformLocation(prog, 'u_time');
        const mouseLoc = gl.getUniformLocation(prog, 'u_mouse');
        const intLoc = gl.getUniformLocation(prog, 'u_intensity');

        const start = performance.now();
        const renderGl = (now: number) => {
          resize();
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.useProgram(prog);
          gl.enableVertexAttribArray(posLoc);
          gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
          gl.uniform2f(resLoc, canvas.width, canvas.height);
          gl.uniform1f(timeLoc, reduced ? 0.5 : (now - start) * 0.001);
          gl.uniform2f(mouseLoc, mouse.x, mouse.y);
          gl.uniform1f(intLoc, intensity);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          if (!reduced) rafId = requestAnimationFrame(renderGl);
        };
        rafId = requestAnimationFrame(renderGl);

        return () => {
          cancelAnimationFrame(rafId);
          window.removeEventListener('resize', resize);
          window.removeEventListener('mousemove', handleMove);
        };
      }
    }

    // 2D phosphor fallback when WebGL is unavailable
    const ctx = canvas.getContext('2d');
    const drawFallback = () => {
      if (!ctx) return;
      resize();
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const grad = ctx.createRadialGradient(
        width * mouse.x,
        height * (1 - mouse.y),
        10,
        width * 0.5,
        height * 0.45,
        width * 0.72,
      );
      grad.addColorStop(0, 'rgba(52, 245, 126, 0.16)');
      grad.addColorStop(0.55, 'rgba(20, 72, 42, 0.10)');
      grad.addColorStop(1, 'rgba(10, 12, 11, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    };
    drawFallback();
    if (!reduced) {
      const loop = () => {
        drawFallback();
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMove);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 w-full h-full opacity-90 ${className}`}
    />
  );
}
