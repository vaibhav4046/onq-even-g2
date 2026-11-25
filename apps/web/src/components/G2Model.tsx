import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HudPhase, VoiceOrbState } from '@onq/core';
import {
  createBrushedTitaniumMaps,
  createDotSpriteTexture,
  createMatteAcetateMaps,
  createWaveguideGratingTexture,
  drawLeftLensHudCanvas,
  drawRightLensHudCanvas,
} from './hardwareTextures';

interface G2ModelProps {
  phase: HudPhase;
  orbState?: VoiceOrbState;
  activeWord?: string;
  headerLine: string;
  primaryLine: string;
  ringProgress: number;
  rmsLevel?: number;
  explodeFactor?: number;
  reducedMotion?: boolean;
  theme?: 'dark' | 'light';
  onLensClick?: () => void;
}

/**
 * Applies smooth optical face-wrap curvature along the Z-axis and recomputes vertex normals.
 */
function applyFaceWrap(geom: THREE.BufferGeometry, wrapK = 0.082, convexZ = 0, centerX = 0) {
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i) - wrapK * x * x;
    if (convexZ !== 0) {
      const dx = (x - centerX) / 0.5;
      const dy = y / 0.42;
      const r2 = Math.min(1, dx * dx + dy * dy);
      z += convexZ * (1 - r2);
    }
    pos.setZ(i, z);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

/**
 * Samples evenly spaced vertices across sculpted hardware meshes so micro-dots form
 * the glasses contour and assemble into photorealistic matte acetate + brushed titanium.
 */
function buildHardwareDotCloud(
  geometries: THREE.BufferGeometry[],
  maxDots: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const emerald = new THREE.Color('#34F57E');
  const lime = new THREE.Color('#daff52');
  const titanium = new THREE.Color('#b8ccc0');

  const totalVerts = geometries.reduce((acc, g) => acc + g.attributes.position.count, 0);
  const stride = Math.max(1, Math.floor(totalVerts / maxDots));

  let globalIdx = 0;
  for (const g of geometries) {
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    for (let i = 0; i < pos.count; i += stride) {
      const nx = norm ? norm.getX(i) : 0;
      const ny = norm ? norm.getY(i) : 0;
      const nz = norm ? norm.getZ(i) : 0;
      positions.push(
        pos.getX(i) + nx * 0.0045,
        pos.getY(i) + ny * 0.0045,
        pos.getZ(i) + nz * 0.0045,
      );
      const t = (globalIdx % 13) / 12;
      const c =
        globalIdx % 9 === 0
          ? lime
          : globalIdx % 3 === 0
            ? emerald
            : titanium.clone().lerp(emerald, t * 0.42);
      colors.push(c.r, c.g, c.b);
      globalIdx++;
    }
  }

  const cloud = new THREE.BufferGeometry();
  cloud.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cloud.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return cloud;
}

/**
 * Builds the inner panto-wayfarer lens cutout path centered at cx (used identically for
 * front-frame holes AND convex lens geometry so lens rims seat seamlessly).
 */
function createLensContour(cx: number, shrink = 0, ccw = false): THREE.Path {
  const w = 0.49 - shrink;
  const topY = 0.36 - shrink;
  const botY = -0.38 + shrink;
  const p = new THREE.Path();

  if (!ccw) {
    p.moveTo(cx - w + 0.06, topY - 0.03);
    p.bezierCurveTo(cx - w * 0.4, topY + 0.05, cx + w * 0.4, topY + 0.05, cx + w - 0.04, topY - 0.02);
    p.bezierCurveTo(cx + w + 0.04, topY - 0.07, cx + w + 0.03, botY + 0.22, cx + w - 0.08, botY + 0.06);
    p.bezierCurveTo(cx + w * 0.45, botY - 0.06, cx - w * 0.45, botY - 0.06, cx - w + 0.08, botY + 0.06);
    p.bezierCurveTo(cx - w - 0.03, botY + 0.22, cx - w - 0.04, topY - 0.07, cx - w + 0.06, topY - 0.03);
  } else {
    p.moveTo(cx - w + 0.06, topY - 0.03);
    p.bezierCurveTo(cx - w - 0.04, topY - 0.07, cx - w - 0.03, botY + 0.22, cx - w + 0.08, botY + 0.06);
    p.bezierCurveTo(cx - w * 0.45, botY - 0.06, cx + w * 0.45, botY - 0.06, cx + w - 0.08, botY + 0.06);
    p.bezierCurveTo(cx + w + 0.03, botY + 0.22, cx + w + 0.04, topY - 0.07, cx + w - 0.04, topY - 0.02);
    p.bezierCurveTo(cx + w * 0.4, topY + 0.05, cx - w * 0.4, topY + 0.05, cx - w + 0.06, topY - 0.03);
  }
  return p;
}

/**
 * Generates a twist-free parametric sculpted temple arm extending in -Z with natural
 * downward ear-hook sweep (no camera bumps, no speaker grilles).
 */
function buildSculptedTempleGeometry(side: -1 | 1): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 1.46, 0.15, -0.14),
    new THREE.Vector3(side * 1.5, 0.16, -0.58),
    new THREE.Vector3(side * 1.49, 0.15, -1.25),
    new THREE.Vector3(side * 1.44, 0.09, -1.86),
    new THREE.Vector3(side * 1.38, -0.14, -2.18),
    new THREE.Vector3(side * 1.33, -0.35, -2.32),
  ]);

  const segs = 36;
  const ringPts = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const pt = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    // Side vector stays strictly horizontal/world-aligned to avoid Frenet twist
    const worldUp = new THREE.Vector3(0, 1, 0);
    const sideVec = new THREE.Vector3().crossVectors(worldUp, tangent).normalize();
    const upVec = new THREE.Vector3().crossVectors(tangent, sideVec).normalize();

    const halfThick = 0.024 * (1 - 0.28 * t);
    const halfHeight = t < 0.7 ? 0.056 - 0.016 * t : 0.045 + 0.012 * Math.sin(((t - 0.7) / 0.3) * Math.PI);

    for (let j = 0; j < ringPts; j++) {
      const a = (j / ringPts) * Math.PI * 2;
      // Squircle cross-section for milled acetate edge feel
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.72) * halfThick;
      const sy = Math.sign(sa) * Math.pow(Math.abs(sa), 0.72) * halfHeight;

      const vx = pt.x + sideVec.x * sx + upVec.x * sy;
      const vy = pt.y + sideVec.y * sx + upVec.y * sy;
      const vz = pt.z + sideVec.z * sx + upVec.z * sy;
      positions.push(vx, vy, vz);
      uvs.push(t * 2, j / ringPts);
    }
  }

  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < ringPts; j++) {
      const nextJ = (j + 1) % ringPts;
      const a = i * ringPts + j;
      const b = (i + 1) * ringPts + j;
      const c = (i + 1) * ringPts + nextJ;
      const d = i * ringPts + nextJ;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Photorealistic camera-free Even Realities G2 smart glasses with sculpted matte acetate
 * front frame, brushed-titanium 3-barrel hinges, sculpted ear-hook temples, silicone nose pads,
 * AR-iridescent glass lenses, and live recessed 525nm phosphor waveguide HUD layers.
 */
export function G2Model({
  phase,
  orbState,
  activeWord,
  headerLine,
  primaryLine,
  ringProgress,
  rmsLevel = 0,
  explodeFactor = 0,
  reducedMotion = false,
  theme = 'dark',
  onLensClick,
}: G2ModelProps) {
  const frameGroupRef = useRef<THREE.Group>(null);
  const lensGroupRef = useRef<THREE.Group>(null);
  const hudGroupRef = useRef<THREE.Group>(null);
  const templesGroupRef = useRef<THREE.Group>(null);
  const frameDotMatRef = useRef<THREE.PointsMaterial>(null);
  const templeDotMatRef = useRef<THREE.PointsMaterial>(null);
  const solidFrameMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const solidLeftTempleMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const solidRightTempleMatRef = useRef<THREE.MeshPhysicalMaterial>(null);

  const acetateMaps = useMemo(() => createMatteAcetateMaps(), []);
  const titaniumMaps = useMemo(() => createBrushedTitaniumMaps(), []);
  const gratingTex = useMemo(() => createWaveguideGratingTexture(), []);
  const dotSpriteTex = useMemo(() => createDotSpriteTexture(), []);

  const leftHudCanvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    return c;
  }, []);
  const rightHudCanvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    return c;
  }, []);

  const leftHudTex = useMemo(() => {
    const t = new THREE.CanvasTexture(leftHudCanvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [leftHudCanvas]);

  const rightHudTex = useMemo(() => {
    const t = new THREE.CanvasTexture(rightHudCanvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [rightHudCanvas]);

  // Sculpted matte-obsidian eyewear front frame with keyhole nasal bridge & face-wrap
  const frontFrameGeom = useMemo(() => {
    const outer = new THREE.Shape();
    // Smooth sleek camera-free Even G2 silhouette (right temple lug clockwise)
    outer.moveTo(0, 0.34);
    outer.bezierCurveTo(0.28, 0.45, 0.92, 0.49, 1.38, 0.41);
    outer.bezierCurveTo(1.5, 0.38, 1.54, 0.29, 1.53, 0.14);
    outer.bezierCurveTo(1.52, 0.04, 1.44, -0.02, 1.4, -0.22);
    outer.bezierCurveTo(1.33, -0.49, 0.92, -0.56, 0.56, -0.51);
    outer.bezierCurveTo(0.32, -0.47, 0.2, -0.24, 0.17, 0.02);
    // Keyhole nasal bridge arch
    outer.bezierCurveTo(0.14, 0.15, -0.14, 0.15, -0.17, 0.02);
    outer.bezierCurveTo(-0.2, -0.24, -0.32, -0.47, -0.56, -0.51);
    outer.bezierCurveTo(-0.92, -0.56, -1.33, -0.49, -1.4, -0.22);
    outer.bezierCurveTo(-1.44, -0.02, -1.52, 0.04, -1.53, 0.14);
    outer.bezierCurveTo(-1.54, 0.29, -1.5, 0.38, -1.38, 0.41);
    outer.bezierCurveTo(-0.92, 0.49, -0.28, 0.45, 0, 0.34);

    outer.holes.push(createLensContour(-0.78, 0, true));
    outer.holes.push(createLensContour(0.78, 0, true));

    const extrude = new THREE.ExtrudeGeometry(outer, {
      depth: 0.068,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.015,
      bevelSegments: 10,
      curveSegments: 64,
    });
    extrude.translate(0, 0, -0.034);
    return applyFaceWrap(extrude, 0.078);
  }, []);

  // Convex glass lenses + outer specular AR shell matching exact rim contours
  const { leftLensGeom, rightLensGeom, leftShellGeom, rightShellGeom, leftHudGeom, rightHudGeom } =
    useMemo(() => {
      const makeLens = (cx: number, convex: number, zOff: number, shrink = 0) => {
        const s = new THREE.Shape(createLensContour(cx, shrink).getPoints(44));
        const g = new THREE.ShapeGeometry(s, 36);
        applyFaceWrap(g, 0.082, convex, cx);
        g.translate(0, 0, zOff);
        return g;
      };

      const hudW = 0.72;
      const hudH = 0.38;
      const lHud = new THREE.PlaneGeometry(hudW, hudH, 16, 8);
      lHud.translate(-0.78, 0, 0.026);
      applyFaceWrap(lHud, 0.082);

      const rHud = new THREE.PlaneGeometry(hudW, hudH, 16, 8);
      rHud.translate(0.78, 0, 0.026);
      applyFaceWrap(rHud, 0.082);

      return {
        leftLensGeom: makeLens(-0.78, 0.024, -0.004, -0.008),
        rightLensGeom: makeLens(0.78, 0.024, -0.004, -0.008),
        leftShellGeom: makeLens(-0.78, 0.028, 0.036, 0.004),
        rightShellGeom: makeLens(0.78, 0.028, 0.036, 0.004),
        leftHudGeom: lHud,
        rightHudGeom: rHud,
      };
    }, []);

  const leftTempleGeom = useMemo(() => buildSculptedTempleGeometry(-1), []);
  const rightTempleGeom = useMemo(() => buildSculptedTempleGeometry(1), []);

  const frameDotGeom = useMemo(() => buildHardwareDotCloud([frontFrameGeom], 1900), [frontFrameGeom]);
  const templeDotGeom = useMemo(
    () => buildHardwareDotCloud([leftTempleGeom, rightTempleGeom], 950),
    [leftTempleGeom, rightTempleGeom],
  );

  // Titanium gooseneck nose-pad stems
  const { leftPadStemGeom, rightPadStemGeom } = useMemo(() => {
    const mkStem = (side: -1 | 1) =>
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.21, 0.03, -0.04),
          new THREE.Vector3(side * 0.23, -0.05, -0.14),
          new THREE.Vector3(side * 0.24, -0.14, -0.17),
        ]),
        16,
        0.009,
        10,
        false,
      );
    return { leftPadStemGeom: mkStem(-1), rightPadStemGeom: mkStem(1) };
  }, []);

  useEffect(() => {
    return () => {
      acetateMaps.dispose();
      titaniumMaps.dispose();
      gratingTex.dispose();
      dotSpriteTex.dispose();
      leftHudTex.dispose();
      rightHudTex.dispose();
      frontFrameGeom.dispose();
      leftLensGeom.dispose();
      rightLensGeom.dispose();
      leftShellGeom.dispose();
      rightShellGeom.dispose();
      leftHudGeom.dispose();
      rightHudGeom.dispose();
      leftTempleGeom.dispose();
      rightTempleGeom.dispose();
      frameDotGeom.dispose();
      templeDotGeom.dispose();
      leftPadStemGeom.dispose();
      rightPadStemGeom.dispose();
    };
  }, [
    acetateMaps,
    titaniumMaps,
    gratingTex,
    dotSpriteTex,
    leftHudTex,
    rightHudTex,
    frontFrameGeom,
    leftLensGeom,
    rightLensGeom,
    leftShellGeom,
    rightShellGeom,
    leftHudGeom,
    rightHudGeom,
    leftTempleGeom,
    rightTempleGeom,
    frameDotGeom,
    templeDotGeom,
    leftPadStemGeom,
    rightPadStemGeom,
  ]);

  // Redraw Left Lens when telemetry state changes
  useEffect(() => {
    drawLeftLensHudCanvas(leftHudCanvas, { phase, headerLine, primaryLine });
    leftHudTex.needsUpdate = true;
  }, [leftHudCanvas, leftHudTex, phase, headerLine, primaryLine]);

  // Keep Right Lens dynamic at low overhead (12 Hz or state changes) for countdown/voice animation
  const lastDrawRef = useRef(-1);
  useFrame((state, delta) => {
    if (frameGroupRef.current && lensGroupRef.current && hudGroupRef.current && templesGroupRef.current) {
      const e = explodeFactor;
      frameGroupRef.current.position.z = THREE.MathUtils.damp(frameGroupRef.current.position.z, -e * 0.12, 7, delta);
      lensGroupRef.current.position.z = THREE.MathUtils.damp(lensGroupRef.current.position.z, e * 0.55, 7, delta);
      hudGroupRef.current.position.z = THREE.MathUtils.damp(hudGroupRef.current.position.z, e * 1.18, 7, delta);
      templesGroupRef.current.position.z = THREE.MathUtils.damp(templesGroupRef.current.position.z, -e * 0.78, 7, delta);
    }

    const now = state.clock.elapsedTime;
    // Dot-matrix photorealism reveal: micro-dots form the eyewear silhouette then shimmer along the contours
    const reveal = reducedMotion ? 1 : Math.min(1, Math.max(0.15, now / 1.35));
    const smoothReveal = reveal * reveal * (3 - 2 * reveal);
    const dotPulse = reducedMotion ? 0.32 : 0.34 + 0.14 * Math.sin(now * 2.1);
    const dotOpacity = THREE.MathUtils.lerp(0.95, dotPulse + explodeFactor * 0.24, smoothReveal);

    if (frameDotMatRef.current) frameDotMatRef.current.opacity = dotOpacity;
    if (templeDotMatRef.current) templeDotMatRef.current.opacity = dotOpacity * 0.92;
    if (solidFrameMatRef.current) solidFrameMatRef.current.opacity = THREE.MathUtils.lerp(0.28, 1, smoothReveal);
    if (solidLeftTempleMatRef.current) solidLeftTempleMatRef.current.opacity = THREE.MathUtils.lerp(0.28, 1, smoothReveal);
    if (solidRightTempleMatRef.current) solidRightTempleMatRef.current.opacity = THREE.MathUtils.lerp(0.28, 1, smoothReveal);

    if (lastDrawRef.current < 0 || (!reducedMotion && now - lastDrawRef.current > 0.08)) {
      lastDrawRef.current = now;
      drawRightLensHudCanvas(rightHudCanvas, {
        phase,
        orbState,
        activeWord,
        ringProgress,
        rmsLevel,
        timeSec: now,
      });
      rightHudTex.needsUpdate = true;
    }
  });

  // Update right lens immediately when key state props change even if reducedMotion is true
  useEffect(() => {
    drawRightLensHudCanvas(rightHudCanvas, {
      phase,
      orbState,
      activeWord,
      ringProgress,
      rmsLevel,
      timeSec: 0,
    });
    rightHudTex.needsUpdate = true;
  }, [rightHudCanvas, rightHudTex, phase, orbState, activeWord, ringProgress, rmsLevel]);

  const frameColor = theme === 'light' ? '#171a19' : '#141716';
  const hingeColor = theme === 'light' ? '#3f4547' : '#2d3233';

  return (
    <group>
      {/* Layer 1: Sculpted Matte Obsidian Front Frame + Dot-Matrix Photorealism Lattice */}
      <group ref={frameGroupRef}>
        <mesh geometry={frontFrameGeom} castShadow receiveShadow>
          <meshPhysicalMaterial
            ref={solidFrameMatRef}
            color={frameColor}
            transparent
            opacity={1}
            roughness={0.42}
            metalness={0.12}
            clearcoat={0.18}
            clearcoatRoughness={0.35}
            bumpMap={acetateMaps.bumpMap}
            bumpScale={0.003}
            roughnessMap={acetateMaps.roughnessMap}
            envMapIntensity={1.25}
          />
        </mesh>
        <points geometry={frameDotGeom}>
          <pointsMaterial
            ref={frameDotMatRef}
            map={dotSpriteTex}
            size={0.021}
            sizeAttenuation
            vertexColors
            transparent
            opacity={0.45}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </points>

        {/* Titanium gooseneck stems & dark smoke silicone nose pads */}
        <mesh geometry={leftPadStemGeom}>
          <meshStandardMaterial color={hingeColor} metalness={0.88} roughness={0.24} />
        </mesh>
        <mesh geometry={rightPadStemGeom}>
          <meshStandardMaterial color={hingeColor} metalness={0.88} roughness={0.24} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={`pad-${side}`}
            position={[side * 0.245, -0.15, -0.185]}
            rotation={[0.3, side * 0.25, side * -0.18]}
            scale={[0.85, 1.35, 0.55]}
          >
            <sphereGeometry args={[0.048, 16, 14]} />
            <meshPhysicalMaterial
              color="#1b1f1e"
              transmission={0.5}
              transparent
              opacity={0.88}
              roughness={0.32}
            />
          </mesh>
        ))}
      </group>

      {/* Layer 2: Physical AR-Coated Convex Optical Glass + Outer Specular Reflection Shell (click to enter POV) */}
      <group
        ref={lensGroupRef}
        onClick={(e) => {
          e.stopPropagation();
          onLensClick?.();
        }}
      >
        <mesh geometry={leftLensGeom}>
          <meshPhysicalMaterial
            color="#0b110f"
            transmission={0.92}
            opacity={1}
            transparent
            ior={1.52}
            thickness={0.35}
            roughness={0.04}
            metalness={0}
            reflectivity={0.95}
            clearcoat={1}
            clearcoatRoughness={0.03}
            iridescence={0.45}
            iridescenceIOR={1.38}
            iridescenceThicknessRange={[180, 420]}
            envMapIntensity={1.55}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh geometry={rightLensGeom}>
          <meshPhysicalMaterial
            color="#0b110f"
            transmission={0.92}
            opacity={1}
            transparent
            ior={1.52}
            thickness={0.35}
            roughness={0.04}
            metalness={0}
            reflectivity={0.95}
            clearcoat={1}
            clearcoatRoughness={0.03}
            iridescence={0.45}
            iridescenceIOR={1.38}
            iridescenceThicknessRange={[180, 420]}
            envMapIntensity={1.55}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Outer thin specular AR coating glaze so softbox highlights sweep over the HUD */}
        <mesh geometry={leftShellGeom}>
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={0.11}
            roughness={0.02}
            metalness={0.05}
            clearcoat={1}
            clearcoatRoughness={0.02}
            iridescence={0.62}
            iridescenceIOR={1.38}
            iridescenceThicknessRange={[200, 430]}
            depthWrite={false}
            envMapIntensity={1.9}
          />
        </mesh>
        <mesh geometry={rightShellGeom}>
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={0.11}
            roughness={0.02}
            metalness={0.05}
            clearcoat={1}
            clearcoatRoughness={0.02}
            iridescence={0.62}
            iridescenceIOR={1.38}
            iridescenceThicknessRange={[200, 430]}
            depthWrite={false}
            envMapIntensity={1.9}
          />
        </mesh>
      </group>

      {/* Layer 3: Recessed 525nm Phosphor Waveguide Grating & Live HUD Projections */}
      <group
        ref={hudGroupRef}
        onClick={(e) => {
          e.stopPropagation();
          onLensClick?.();
        }}
      >
        <mesh geometry={leftHudGeom}>
          <meshBasicMaterial
            map={gratingTex}
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={rightHudGeom}>
          <meshBasicMaterial
            map={gratingTex}
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        <mesh geometry={leftHudGeom} position={[0, 0, 0.004]}>
          <meshBasicMaterial
            map={leftHudTex}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh geometry={rightHudGeom} position={[0, 0, 0.004]}>
          <meshBasicMaterial
            map={rightHudTex}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Layer 4: Titanium 3-Barrel Hinges & Sculpted Camera-Free Temple Arms */}
      <group ref={templesGroupRef}>
        {([-1, 1] as const).map((side) => (
          <group key={`hinge-${side}`} position={[side * 1.46, 0.15, -0.145]}>
            {[-0.028, 0, 0.028].map((hy, idx) => (
              <mesh key={idx} position={[0, hy, 0]}>
                <cylinderGeometry args={[0.026, 0.026, 0.022, 18]} />
                <meshPhysicalMaterial
                  color={hingeColor}
                  metalness={0.9}
                  roughness={0.22}
                  roughnessMap={titaniumMaps.roughnessMap}
                  clearcoat={0.25}
                />
              </mesh>
            ))}
          </group>
        ))}

        <mesh geometry={leftTempleGeom} castShadow receiveShadow>
          <meshPhysicalMaterial
            ref={solidLeftTempleMatRef}
            color={frameColor}
            transparent
            opacity={1}
            roughness={0.4}
            metalness={0.14}
            clearcoat={0.2}
            bumpMap={acetateMaps.bumpMap}
            bumpScale={0.0025}
          />
        </mesh>
        <mesh geometry={rightTempleGeom} castShadow receiveShadow>
          <meshPhysicalMaterial
            ref={solidRightTempleMatRef}
            color={frameColor}
            transparent
            opacity={1}
            roughness={0.4}
            metalness={0.14}
            clearcoat={0.2}
            bumpMap={acetateMaps.bumpMap}
            bumpScale={0.0025}
          />
        </mesh>
        <points geometry={templeDotGeom}>
          <pointsMaterial
            ref={templeDotMatRef}
            map={dotSpriteTex}
            size={0.018}
            sizeAttenuation
            vertexColors
            transparent
            opacity={0.42}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </points>

        {/* Flush capacitive touch seam & micro-etched OnQ tick on right temple (NO camera/speaker) */}
        <mesh position={[1.515, 0.155, -0.78]} rotation={[0, 0.025, 0]}>
          <boxGeometry args={[0.008, 0.024, 0.42]} />
          <meshStandardMaterial color={hingeColor} metalness={0.86} roughness={0.25} />
        </mesh>
        <mesh position={[1.52, 0.155, -0.53]}>
          <boxGeometry args={[0.006, 0.012, 0.036]} />
          <meshBasicMaterial color="#34F57E" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
