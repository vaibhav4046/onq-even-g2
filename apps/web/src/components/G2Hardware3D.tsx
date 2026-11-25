import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useReducedMotion } from 'motion/react';
import * as THREE from 'three';
import type { HudPhase, VoiceOrbState } from '@onq/core';
import { G2Model } from './G2Model';
import { R1RingModel } from './R1RingModel';

export type HardwareViewMode = 'optics' | 'exploded' | 'ring';

interface G2Hardware3DProps {
  phase?: HudPhase;
  orbState?: VoiceOrbState;
  activeWord?: string;
  headerLine?: string;
  primaryLine?: string;
  ringProgress?: number;
  rmsLevel?: number;
  defaultMode?: HardwareViewMode;
  theme?: 'dark' | 'light';
  onEnterLensView?: () => void;
  className?: string;
}

function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

class CanvasErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(_err: Error, _info: ErrorInfo) {
    // Graceful silent drop to optical SVG fallback in headless/GPU-less CI
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function OpticalSvgFallback({
  phase,
  headerLine,
  primaryLine,
  theme,
}: {
  phase: HudPhase;
  headerLine: string;
  primaryLine: string;
  theme: 'dark' | 'light';
}) {
  const accent = phase === 'conflict' ? '#ffb020' : theme === 'light' ? '#0a0a0a' : '#34F57E';
  const frameFill = theme === 'light' ? '#181b1a' : '#141716';
  return (
    <div
      className="w-full h-[270px] sm:h-[290px] flex flex-col items-center justify-center gap-3 select-none"
      aria-label="Even Realities G2 camera-free eyewear and R1 ring optical view"
    >
      <svg viewBox="0 0 360 130" className="w-full max-w-[330px] h-auto" role="img" aria-label="Even G2 Silhouette">
        <defs>
          <linearGradient id="g2LensGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor="#080b0a" stopOpacity="0.88" />
          </linearGradient>
        </defs>
        {/* Smooth sculpted panto front frame (no cameras) */}
        <path
          d="M28,34 C58,20 120,20 148,34 C162,40 198,40 212,34 C240,20 302,20 332,34 C338,54 334,94 310,104 C268,114 226,102 214,68 C202,48 158,48 146,68 C134,102 92,114 50,104 C26,94 22,54 28,34 Z"
          fill={frameFill}
          stroke={theme === 'light' ? '#404547' : '#2d3233'}
          strokeWidth="2.5"
        />
        <rect x="44" y="34" width="96" height="62" rx="18" fill="url(#g2LensGrad)" stroke={accent} strokeOpacity="0.4" />
        <rect x="220" y="34" width="96" height="62" rx="18" fill="url(#g2LensGrad)" stroke={accent} strokeOpacity="0.4" />
        <text x="54" y="58" fill={accent} fontSize="9" fontFamily="monospace" fontWeight="700">
          {headerLine.slice(0, 16)}
        </text>
        <text x="54" y="76" fill={accent} fontSize="10" fontFamily="monospace">
          {primaryLine.slice(0, 15)}
        </text>
        <circle cx="268" cy="65" r="18" fill="none" stroke={accent} strokeWidth="2.5" strokeDasharray="88 26" />
      </svg>
    </div>
  );
}

interface StudioSceneProps {
  mode: HardwareViewMode;
  phase: HudPhase;
  orbState?: VoiceOrbState;
  activeWord?: string;
  headerLine: string;
  primaryLine: string;
  ringProgress: number;
  rmsLevel: number;
  reducedMotion: boolean;
  theme: 'dark' | 'light';
  onEnterLensView?: () => void;
  pointerRef: React.MutableRefObject<{ x: number; y: number }>;
  scrollProgressRef: React.MutableRefObject<number>;
}

function StudioScene({
  mode,
  phase,
  orbState,
  activeWord,
  headerLine,
  primaryLine,
  ringProgress,
  rmsLevel,
  reducedMotion,
  theme,
  onEnterLensView,
  pointerRef,
  scrollProgressRef,
}: StudioSceneProps) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const rigRef = useRef<THREE.Group>(null);
  const explodeValRef = useRef(mode === 'exploded' ? 1 : 0);
  const modeRef = useRef<HardwareViewMode>(mode);
  const userInteractingRef = useRef(false);

  // Snap target shift only when mode toggles so manual OrbitControls drag remains responsive
  const transitionTimerRef = useRef(0);
  useEffect(() => {
    modeRef.current = mode;
    transitionTimerRef.current = 1.1;
  }, [mode]);

  useFrame((state, delta) => {
    const dt = Math.min(0.05, delta);
    const targetExplode = mode === 'exploded' ? 1 : 0;
    explodeValRef.current = THREE.MathUtils.damp(explodeValRef.current, targetExplode, 6, dt);

    // Camera choreography for 3D Optics / Exploded / R1 Ring macro modes
    const targetPos =
      mode === 'ring'
        ? new THREE.Vector3(0.95, 0.56, 2.32)
        : mode === 'exploded'
          ? new THREE.Vector3(3.25, 0.82, 4.15)
          : new THREE.Vector3(0.82, 0.34, 4.82);

    const targetLook =
      mode === 'ring'
        ? new THREE.Vector3(0, -0.14, 0)
        : mode === 'exploded'
          ? new THREE.Vector3(0.04, -0.04, 0.12)
          : new THREE.Vector3(0.06, -0.1, -0.45);

    if (transitionTimerRef.current > 0 && !userInteractingRef.current) {
      transitionTimerRef.current = Math.max(0, transitionTimerRef.current - dt);
      camera.position.lerp(targetPos, 1 - Math.exp(-5.5 * dt));
      if (controlsRef.current) {
        controlsRef.current.target.lerp(targetLook, 1 - Math.exp(-6.5 * dt));
        controlsRef.current.update();
      }
    }

    if (rigRef.current) {
      const floatY = !reducedMotion && mode !== 'ring' ? Math.sin(state.clock.elapsedTime * 1.15) * 0.016 : 0;
      const scrollYaw = !reducedMotion ? (scrollProgressRef.current - 0.5) * 0.22 : 0;
      const targetYaw =
        (mode === 'ring' ? 0 : pointerRef.current.x * 0.22 + scrollYaw) +
        (mode === 'exploded' ? 0.16 : 0);
      const targetPitch = mode === 'ring' ? 0 : -pointerRef.current.y * 0.12;

      rigRef.current.position.y = THREE.MathUtils.damp(rigRef.current.position.y, floatY, 5, dt);
      rigRef.current.rotation.y = THREE.MathUtils.damp(rigRef.current.rotation.y, targetYaw, 5, dt);
      rigRef.current.rotation.x = THREE.MathUtils.damp(rigRef.current.rotation.x, targetPitch, 5, dt);
    }
  });

  const plinthColor = theme === 'light' ? '#d4d6d5' : '#0f1211';
  const plinthTrim = theme === 'light' ? '#9ea3a1' : '#252a28';

  return (
    <>
      <color attach="background" args={[theme === 'light' ? '#e8e8e8' : '#0c0d0d']} />

      {/* 100% Procedural Studio Lightbox (zero external HDRI/CDN URLs) */}
      <Environment resolution={256} frames={1}>
        {/* Warm amber-gold left grazing softbox for iconic eyewear AR lens reflections */}
        <Lightformer
          form="rect"
          intensity={2.8}
          color="#ffd49e"
          position={[-4.5, 2.2, 3.6]}
          scale={[5, 2.6, 1]}
          target={[0, 0, 0]}
        />
        {/* Crisp cool-white top-right studio strip for titanium/acetate bevel rim highlights */}
        <Lightformer
          form="rect"
          intensity={3.6}
          color="#edf5ff"
          position={[3.8, 4.2, 2.8]}
          scale={[6, 1.4, 1]}
          target={[0, 0, -0.5]}
        />
        {/* Soft front bounce fill */}
        <Lightformer
          form="rect"
          intensity={1.1}
          color="#b5c2be"
          position={[0, -2.5, 4.5]}
          scale={[7, 2.2, 1]}
          target={[0, 0, 0]}
        />
        {/* Signature 525nm phosphor emerald glow rim & ambient cast */}
        <Lightformer
          form="rect"
          intensity={1.15}
          color="#34F57E"
          position={[-3.2, 1.8, -3.5]}
          scale={[4.2, 1.3, 1]}
          target={[0, 0, -0.4]}
        />
      </Environment>

      <ambientLight intensity={theme === 'light' ? 0.55 : 0.38} />
      <directionalLight
        position={[3.2, 4.5, 3.8]}
        intensity={1.5}
        color="#fff9f0"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3.5, 2.0, 2.4]} intensity={0.75} color="#ffd9ad" />

      <group ref={rigRef}>
        <group visible={mode !== 'ring'}>
          <G2Model
            phase={phase}
            orbState={orbState}
            activeWord={activeWord}
            headerLine={headerLine}
            primaryLine={primaryLine}
            ringProgress={ringProgress}
            rmsLevel={rmsLevel}
            explodeFactor={mode === 'exploded' ? 1 : 0}
            reducedMotion={reducedMotion}
            theme={theme}
            onLensClick={onEnterLensView}
          />
        </group>

        <R1RingModel
          position={mode === 'ring' ? [0, -0.14, 0] : [1.34, -0.49, 0.68]}
          rotation={mode === 'ring' ? [Math.PI * 0.28, -0.42, 0.18] : [Math.PI * 0.12, -0.36, 0.08]}
          scale={mode === 'ring' ? 1.75 : 1.02}
          phase={phase}
          explodeFactor={mode === 'exploded' ? 1 : 0}
          macroFocus={mode === 'ring'}
          reducedMotion={reducedMotion}
          theme={theme}
        />

        {/* Minimalist anodized charging-case plinth resting underneath */}
        <mesh position={[0.06, -0.64, -0.44]} receiveShadow>
          <cylinderGeometry args={[2.55, 2.65, 0.07, 64]} />
          <meshPhysicalMaterial
            color={plinthColor}
            roughness={0.62}
            metalness={theme === 'light' ? 0.1 : 0.34}
            clearcoat={0.12}
          />
        </mesh>
        <mesh position={[0.06, -0.604, -0.44]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.46, 2.49, 64]} />
          <meshBasicMaterial color={plinthTrim} />
        </mesh>
      </group>

      <ContactShadows
        frames={1}
        resolution={256}
        position={[0.06, -0.6, -0.4]}
        opacity={theme === 'light' ? 0.42 : 0.68}
        scale={6.8}
        blur={2.1}
        far={2.6}
        color="#000000"
      />

      <OrbitControls
        ref={controlsRef}
        enableZoom
        enablePan={false}
        enableDamping
        dampingFactor={0.07}
        minDistance={1.55}
        maxDistance={7.2}
        minPolarAngle={0.14}
        maxPolarAngle={Math.PI - 0.18}
        onStart={() => {
          userInteractingRef.current = true;
        }}
        onEnd={() => {
          userInteractingRef.current = false;
        }}
      />
    </>
  );
}

/**
 * Photorealistic retro-realism Three.js Even Realities G2 glasses & R1 smart ring showcase
 * with procedural studio lighting, iridescent AR lenses, and live 525nm phosphor HUD.
 */
export function G2Hardware3D({
  phase = 'idle',
  orbState,
  activeWord,
  headerLine = 'LIVE CORRIDOR BRIEF',
  primaryLine = 'VC Sync - Priya Nair',
  ringProgress = 0,
  rmsLevel = 0,
  defaultMode = 'optics',
  theme = 'dark',
  onEnterLensView,
  className = '',
}: G2Hardware3DProps) {
  const [mode, setMode] = useState<HardwareViewMode>(defaultMode);
  const [inView, setInView] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reduced = Boolean(useReducedMotion());
  const webglReady = useMemo(() => isWebGLAvailable(), []);
  const pointerRef = useRef({ x: 0, y: 0 });
  const scrollProgressRef = useRef(0.5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || reduced) return;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      scrollProgressRef.current = Math.min(1, Math.max(0, window.scrollY / max));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [reduced]);

  const borderCls =
    theme === 'light' ? 'border-[#c4c4c4] bg-[#e8e8e8]' : 'border-[var(--hairline)]/80 bg-[#070908]';

  const fallback = (
    <OpticalSvgFallback phase={phase} headerLine={headerLine} primaryLine={primaryLine} theme={theme} />
  );

  return (
    <div className={`relative border border-dashed ${borderCls} overflow-hidden ${className}`}>
      <div
        ref={containerRef}
        className="relative w-full h-[350px] sm:h-[400px] lg:h-[430px] overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          pointerRef.current.x = (e.clientX - rect.left) / rect.width - 0.5;
          pointerRef.current.y = (e.clientY - rect.top) / rect.height - 0.5;
        }}
        onMouseLeave={() => {
          pointerRef.current.x = 0;
          pointerRef.current.y = 0;
        }}
        aria-label="Interactive 360 degree photorealistic 3D Even Realities G2 glasses and R1 ring"
      >
        {!webglReady ? (
          fallback
        ) : (
          <CanvasErrorBoundary fallback={fallback}>
            <Canvas
              frameloop={inView ? 'always' : 'demand'}
              shadows
              dpr={[1, 1.5]}
              camera={{
                position: mode === 'ring' ? [0.95, 0.56, 2.32] : [0.82, 0.34, 4.82],
                fov: 32,
                near: 0.1,
                far: 40,
              }}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
              }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.15;
                gl.outputColorSpace = THREE.SRGBColorSpace;
              }}
            >
              <StudioScene
                mode={mode}
                phase={phase}
                orbState={orbState}
                activeWord={activeWord}
                headerLine={headerLine}
                primaryLine={primaryLine}
                ringProgress={ringProgress}
                rmsLevel={rmsLevel}
                reducedMotion={reduced}
                theme={theme}
                onEnterLensView={onEnterLensView}
                pointerRef={pointerRef}
                scrollProgressRef={scrollProgressRef}
              />
            </Canvas>
          </CanvasErrorBoundary>
        )}

        {/* Single sleek floating bottom dock: 3D Optics / Exploded / R1 Ring + Click-to-Expand POV */}
        <div className="absolute bottom-2.5 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div
            className="pointer-events-auto inline-flex items-center gap-1 bg-[var(--ink)]/88 backdrop-blur-sm border border-[var(--hairline)] p-1"
            role="group"
            aria-label="3D hardware view mode"
          >
            {(
              [
                ['optics', '3D Optics'],
                ['exploded', 'Exploded'],
                ['ring', 'R1 Ring'],
              ] as const
            ).map(([key, label]) => {
              const active = mode === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`px-2.5 py-1 font-pixel text-[9px] uppercase tracking-[0.12em] cursor-pointer transition-colors ${
                    active
                      ? 'bg-[var(--lime)] text-[#0a0a0a]'
                      : 'text-[var(--lightgray)] hover:text-[var(--bright)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            {onEnterLensView && (
              <button
                type="button"
                onClick={onEnterLensView}
                className="px-3 py-1 bg-[var(--ink)]/90 border border-[var(--g2-phosphor)] text-[var(--g2-phosphor)] hover:bg-[var(--g2-phosphor)] hover:text-[#0a0a0a] font-pixel text-[9px] uppercase tracking-[0.14em] cursor-pointer transition-colors"
              >
                Look Through G2
              </button>
            )}
            <span className="hidden sm:inline font-pixel text-[8.5px] uppercase tracking-[0.12em] text-[var(--lightgray)] bg-[var(--ink)]/80 px-2 py-1 border border-[var(--hairline)]/60">
              360° ORBIT · ZOOM · CLICK LENS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
