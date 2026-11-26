"use client";

import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { DocumentSheet, Glow, HONEY, INK, VIOLET, seeded } from "./scene-kit";

/** Cahaya yang meluber dari benda terang. Hanya untuk layar lebar karena menambah beban GPU. */
export function Bloom() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const composer = useMemo(() => {
    const next = new EffectComposer(gl);
    next.addPass(new RenderPass(scene, camera));
    next.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.42, 0.5, 0.86));
    next.addPass(new OutputPass());
    return next;
  }, [gl, scene, camera]);

  useEffect(() => () => composer.dispose(), [composer]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);

  // Prioritas 1: menggantikan penggambaran bawaan
  useFrame(() => composer.render(), 1);
  return null;
}

/** Pilar cahaya di atas sebuah panggung. */
export function Beam({ color, active, animate }: { color: string; active: boolean; animate: boolean }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }, delta) => {
    if (!material.current) return;
    const pulse = animate ? Math.sin(clock.getElapsedTime() * 2.4) * 0.025 : 0;
    const goal = (active ? 0.065 : 0.028) + pulse * 0.5;
    material.current.opacity += (goal - material.current.opacity) * (animate ? Math.min(1, delta * 4) : 1);
  });
  return (
    <mesh position={[0, 2.6, 0]}>
      <cylinderGeometry args={[0.55, 1.35, 4.8, 6, 1, true]} />
      <meshBasicMaterial ref={material} color={color} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

/** Tinggi inti sarang; cukup rendah agar tidak menutupi role di belakangnya. */
export const CORE = 0.9;

/** Inti sarang di tengah: kristal berputar dengan cincin orbit. */
export function HiveCore({ animate, dim }: { animate: boolean; dim: boolean }) {
  const crystal = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    if (crystal.current) {
      crystal.current.rotation.y = t * 0.7;
      crystal.current.position.y = CORE + Math.sin(t * 1.4) * 0.1;
    }
    rings.current?.children.forEach((ring, i) => {
      ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.5 + i * 2) * 0.45;
      ring.rotation.y = t * (0.35 + i * 0.2) * (i % 2 ? -1 : 1);
    });
  });
  return (
    <group>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.05, 1.16, 6]} />
        <meshBasicMaterial color={HONEY} transparent opacity={0.5} />
      </mesh>
      <group ref={crystal} position={[0, CORE, 0]} scale={dim ? 0.5 : 0.72}>
        <mesh>
          <octahedronGeometry args={[0.48, 0]} />
          <meshStandardMaterial color="#ffd25c" emissive={HONEY} emissiveIntensity={dim ? 0.35 : 0.75} metalness={0.5} roughness={0.2} flatShading />
        </mesh>
        <mesh scale={1.55}>
          <octahedronGeometry args={[0.48, 0]} />
          <meshBasicMaterial color="#c4b5fd" wireframe transparent opacity={0.5} />
        </mesh>
        <Glow color={HONEY} size={dim ? 1.4 : 2.4} opacity={dim ? 0.2 : 0.32} />
      </group>
      <group ref={rings} position={[0, CORE, 0]}>
        {[0.75, 0.98].map((radius, i) => (
          <mesh key={radius} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius, 0.014, 8, 96]} />
            <meshBasicMaterial color={i ? HONEY : "#a98bff"} transparent opacity={dim ? 0.25 : 0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Kawanan lebah kecil yang berkeliling jauh di sekitar sarang. */
export function Swarm({ animate }: { animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = animate ? clock.getElapsedTime() : 0;
    group.current?.children.forEach((bee, i) => {
      const radius = 5.6 + seeded(i + 7) * 3.4;
      const speed = (0.18 + seeded(i + 19) * 0.22) * (i % 2 ? 1 : -1);
      const angle = t * speed + seeded(i + 3) * Math.PI * 2;
      bee.position.set(Math.cos(angle) * radius, 1.8 + seeded(i + 11) * 3 + Math.sin(t * 2.4 + i) * 0.35, Math.sin(angle) * radius * 0.75);
      bee.rotation.y = -angle + (speed > 0 ? 0 : Math.PI);
      const flap = Math.sin(t * 40 + i * 3) * 0.7;
      bee.children[3].rotation.x = 0.4 + flap;
      bee.children[4].rotation.x = -0.4 - flap;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: 9 }, (_, i) => (
        <group key={i} scale={0.75}>
          <mesh scale={[0.14, 0.14, 0.22]}>
            <sphereGeometry args={[1, 14, 10]} />
            <meshStandardMaterial color={HONEY} emissive={HONEY} emissiveIntensity={0.55} />
          </mesh>
          <mesh position={[0, 0, -0.04]} scale={[0.145, 0.145, 0.05]}>
            <sphereGeometry args={[1, 14, 10]} />
            <meshStandardMaterial color={INK} />
          </mesh>
          <mesh position={[0, 0.03, 0.21]}>
            <sphereGeometry args={[0.1, 12, 10]} />
            <meshStandardMaterial color={INK} />
          </mesh>
          {[1, -1].map((side) => (
            <group key={side} position={[side * 0.08, 0.1, 0]}>
              <mesh position={[side * 0.15, 0.04, -0.02]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.17, 0.09, 1]}>
                <circleGeometry args={[1, 18]} />
                <meshBasicMaterial color="#d9ccff" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

const TRAIL = 46;

/** Jejak serbuk bercahaya di belakang lebah kurir. */
export function Trail({ target, animate }: { target: React.RefObject<THREE.Group | null>; animate: boolean }) {
  const points = useRef<THREE.Points>(null);
  const data = useMemo(() => ({ positions: new Float32Array(TRAIL * 3), colors: new Float32Array(TRAIL * 3) }), []);
  const head = useRef(0);
  const wait = useRef(0);

  useFrame((_, delta) => {
    const geometry = points.current?.geometry;
    const bee = target.current;
    if (!animate || !geometry || !bee) return;
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const color = geometry.getAttribute("color") as THREE.BufferAttribute;
    // Warna additive: makin gelap berarti makin pudar
    for (let i = 0; i < TRAIL; i++) {
      color.setXYZ(i, color.getX(i) * (1 - delta * 1.9), color.getY(i) * (1 - delta * 2.3), color.getZ(i) * (1 - delta * 2.6));
      position.setY(i, position.getY(i) - delta * 0.22);
    }
    wait.current += delta;
    if (wait.current > 0.035) {
      wait.current = 0;
      const i = (head.current = (head.current + 1) % TRAIL);
      position.setXYZ(
        i,
        bee.position.x + (seeded(i + bee.position.x) - 0.5) * 0.35,
        bee.position.y - 0.3 + (seeded(i + 5) - 0.5) * 0.35,
        bee.position.z - 0.5 + (seeded(i + 9) - 0.5) * 0.35
      );
      color.setXYZ(i, 1, 0.76, 0.32);
    }
    position.needsUpdate = true;
    color.needsUpdate = true;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial vertexColors size={0.13} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ── Peragaan tiap perhentian: muncul saat disorot ───────────────── */

/** Membesar dari nol saat `show`, mengecil lagi saat tidak. */
function Reveal({ show, animate, children, position }: { show: boolean; animate: boolean; children: React.ReactNode; position: [number, number, number] }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    const goal = show ? 1 : 0.001;
    const next = animate ? node.scale.x + (goal - node.scale.x) * Math.min(1, delta * 6) : goal;
    node.scale.setScalar(next);
    node.visible = next > 0.02;
  });
  return (
    <group ref={group} position={position} scale={0.001} visible={false}>
      {children}
    </group>
  );
}

/** Halaman-halaman yang berputar mengelilingi rak dokumen. */
export function PageOrbit({ show, animate }: { show: boolean; animate: boolean }) {
  const ring = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (animate && show && ring.current) ring.current.rotation.y = clock.getElapsedTime() * 0.9;
  });
  return (
    <Reveal show={show} animate={animate} position={[0, 1.35, 0]}>
      <group ref={ring}>
        {Array.from({ length: 6 }, (_, i) => {
          const angle = (i / 6) * Math.PI * 2;
          return (
            <group key={i} position={[Math.cos(angle) * 1.65, Math.sin(i * 2) * 0.35, Math.sin(angle) * 1.65]} rotation={[0.1, -angle + Math.PI / 2, 0]} scale={0.46}>
              <DocumentSheet accent={i % 2 ? HONEY : "#38bdf8"} />
            </group>
          );
        })}
      </group>
    </Reveal>
  );
}

/** Layar hologram: baris-baris hasil kerja tertulis satu per satu. */
export function Typing({ show, animate }: { show: boolean; animate: boolean }) {
  const lines = useRef<THREE.Group>(null);
  const widths = [0.82, 1.05, 0.94, 1.1, 0.7, 0.55];
  useFrame(({ clock }) => {
    const progress = animate ? (clock.getElapsedTime() * 1.7) % (widths.length + 2) : widths.length;
    lines.current?.children.forEach((line, i) => {
      const grow = Math.min(1, Math.max(0.001, progress - i));
      line.scale.x = grow;
      line.position.x = -0.55 + (widths[i] * grow) / 2;
    });
  });
  return (
    <Reveal show={show} animate={animate} position={[-1.35, 1.9, 0.35]}>
      <group rotation={[0, 0.42, 0]}>
        <mesh>
          <planeGeometry args={[1.35, 1.15]} />
          <meshBasicMaterial color="#6d46e0" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <group ref={lines} position={[0, 0, 0.02]}>
          {widths.map((width, i) => (
            <mesh key={i} position={[0, 0.38 - i * 0.15, 0]}>
              <boxGeometry args={[width, 0.055, 0.01]} />
              <meshBasicMaterial color={i === 4 ? HONEY : "#d9ccff"} />
            </mesh>
          ))}
        </group>
      </group>
    </Reveal>
  );
}

/** Garis pindai yang menyapu lembar hasil. */
export function Scanner({ show, animate }: { show: boolean; animate: boolean }) {
  const line = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (line.current) line.current.position.y = animate ? Math.sin(clock.getElapsedTime() * 2.6) * 0.52 : 0;
  });
  return (
    <Reveal show={show} animate={animate} position={[-1.35, 1.85, 0.35]}>
      <group rotation={[0, 0.42, 0]}>
        <group scale={1.35}>
          <DocumentSheet accent={HONEY} />
        </group>
        <group ref={line}>
          <mesh position={[0, 0, 0.12]}>
            <boxGeometry args={[1.25, 0.035, 0.02]} />
            <meshBasicMaterial color="#ffd25c" />
          </mesh>
          <mesh position={[0, 0.12, 0.11]}>
            <planeGeometry args={[1.2, 0.22]} />
            <meshBasicMaterial color={HONEY} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      </group>
    </Reveal>
  );
}

const CONFETTI = 70;
const PALETTE = [HONEY, VIOLET, "#ec4899", "#38bdf8", "#10b981"];

/** Medali centang beserta hamburan konfeti saat keputusan diambil. */
export function Celebration({ show, animate }: { show: boolean; animate: boolean }) {
  const medal = useRef<THREE.Group>(null);
  const pieces = useRef<THREE.InstancedMesh>(null);
  const started = useRef<number | null>(null);
  const dummy = useRef(new THREE.Object3D());

  useEffect(() => {
    const mesh = pieces.current;
    if (!mesh) return;
    const color = new THREE.Color();
    for (let i = 0; i < CONFETTI; i++) mesh.setColorAt(i, color.set(PALETTE[i % PALETTE.length]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!show) started.current = null;
    else if (started.current === null) started.current = t;
    if (medal.current) medal.current.rotation.y = animate ? Math.sin(t * 2) * 0.4 : 0;
    const mesh = pieces.current;
    if (!mesh) return;
    // Hamburan diulang tiap 2,6 detik selama perhentian ini disorot
    const age = show && animate && started.current !== null ? (t - started.current) % 2.6 : 9;
    for (let i = 0; i < CONFETTI; i++) {
      const angle = seeded(i + 31) * Math.PI * 2;
      const speed = 0.7 + seeded(i + 57) * 1.7;
      const node = dummy.current;
      node.position.set(Math.cos(angle) * speed * age, (1.8 + seeded(i + 71) * 1.9) * age - 2.1 * age * age, Math.sin(angle) * speed * age * 0.6);
      node.rotation.set(age * (3 + seeded(i) * 6), age * 4, angle);
      node.scale.setScalar(age > 2 ? 0.001 : 1);
      node.updateMatrix();
      mesh.setMatrixAt(i, node.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <Reveal show={show} animate={animate} position={[-1.35, 2.25, 0.4]}>
      <group ref={medal}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.52, 0.52, 0.12, 6]} />
          <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.75} />
        </mesh>
        <mesh position={[-0.14, -0.05, 0.09]} rotation={[0, 0, -0.75]}>
          <boxGeometry args={[0.11, 0.3, 0.04]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.1, 0.03, 0.09]} rotation={[0, 0, 0.65]}>
          <boxGeometry args={[0.11, 0.52, 0.04]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <Glow color="#34d399" size={2.2} opacity={0.5} />
      </group>
      <instancedMesh ref={pieces} args={[undefined, undefined, CONFETTI]} frustumCulled={false}>
        <planeGeometry args={[0.1, 0.07]} />
        <meshBasicMaterial side={THREE.DoubleSide} />
      </instancedMesh>
    </Reveal>
  );
}
