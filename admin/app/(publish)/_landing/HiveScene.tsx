"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { avatarFromSeed } from "../../(admin)/_components/agent/avatar-config";
import { BlockyCharacter, type CharacterPose } from "../../(admin)/_components/agent/blocky-character";
import { TextSprite } from "../../(admin)/admin/kantor/components/Sprites";
import { Beam, Bloom, CORE, Celebration, HiveCore, PageOrbit, Scanner, Swarm, Trail, Typing } from "./effects";
import { RobotBee } from "./RobotBee";
import { DocumentSheet, Glow, HONEY, INK, NIGHT, VIOLET, seeded } from "./scene-kit";

/** Empat perhentian sebuah tugas, melingkar searah jarum jam. */
const STATIONS = [
  { name: "SOP & panduan", color: "#38bdf8", at: new THREE.Vector3(-4.1, 0, 0.5) },
  { name: "Rani · menyusun", color: VIOLET, at: new THREE.Vector3(-0.7, 0, -3.2) },
  { name: "Tegar · memeriksa", color: HONEY, at: new THREE.Vector3(4.1, 0, -0.7) },
  { name: "Anda · memutuskan", color: "#ec4899", at: new THREE.Vector3(0.7, 0, 3.1) },
];

const CAST = [
  { ...avatarFromSeed("Rani"), shirt: "#7c4dff", hair_style: "long" as const, accessory: "headset" as const },
  { ...avatarFromSeed("Tegar"), shirt: "#ffb81c", hair_style: "short" as const, accessory: "glasses" as const },
  { ...avatarFromSeed("Anda"), shirt: "#ec4899", hair_style: "bun" as const, accessory: "none" as const },
];

const FOV = 35;
const SPREAD = 2 * Math.tan((FOV / 2) * (Math.PI / 180));
const damp = (delta: number, speed: number) => 1 - Math.exp(-delta * speed);
/** Lebar kanvas minimum untuk susunan teks di kiri dan efek cahaya. */
export const WIDE = 1024;

const setCursor = (pointer: boolean) => {
  document.body.style.cursor = pointer ? "pointer" : "";
};

/** Lantai sarang lebah yang bergelombang, dengan cahaya yang merambat dari perhentian aktif. */
function Honeycomb({ step, animate }: { step: number; animate: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());
  const tone = useRef(new THREE.Color());
  const glow = useRef(new THREE.Color());
  const cells = useMemo(() => {
    const list: { x: number; z: number; far: number; base: THREE.Color }[] = [];
    const radius = 0.66;
    const stepX = Math.sqrt(3) * radius;
    for (let row = -16; row <= 16; row++) {
      for (let col = -16; col <= 16; col++) {
        const x = col * stepX + (row % 2 ? stepX / 2 : 0);
        const z = row * radius * 1.5;
        const far = Math.hypot(x, z);
        if (far >= 17) continue;
        const honey = seeded(list.length) > 0.93;
        const base = new THREE.Color(honey ? "#6b4a1f" : "#2a1d55").multiplyScalar(Math.max(0.22, 1 - far / 19));
        list.push({ x, z, far, base });
      }
    }
    return list;
  }, []);

  const place = (time: number) => {
    const target = mesh.current;
    if (!target) return;
    const origin = step === 0 ? null : STATIONS[step - 1].at;
    glow.current.set(step === 0 ? "#7c4dff" : STATIONS[step - 1].color);
    cells.forEach((cell, i) => {
      const distance = origin ? Math.hypot(cell.x - origin.x, cell.z - origin.z) : cell.far;
      // Cincin cahaya yang merambat keluar
      const wave = Math.max(0, Math.sin(distance * 0.85 - time * 2.2)) ** 14 * Math.max(0, 1 - distance / 14);
      const node = dummy.current;
      node.position.set(cell.x, -0.34 + Math.sin(time * 1.3 - cell.far * 0.75) * 0.09 + wave * 0.22, cell.z);
      node.updateMatrix();
      target.setMatrixAt(i, node.matrix);
      target.setColorAt(i, tone.current.copy(cell.base).lerp(glow.current, wave * 0.38));
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  };

  useLayoutEffect(() => {
    place(0);
  });

  useFrame(({ clock }) => {
    if (animate) place(clock.getElapsedTime());
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, cells.length]} receiveShadow frustumCulled={false}>
      <cylinderGeometry args={[0.6, 0.6, 0.22, 6]} />
      <meshStandardMaterial roughness={0.42} metalness={0.4} />
    </instancedMesh>
  );
}

/** Serbuk sari yang melayang naik dan bintang yang diam di kejauhan. */
function Sky({ animate }: { animate: boolean }) {
  const pollen = useRef<THREE.Points>(null);
  const data = useMemo(() => {
    const near = new Float32Array(220 * 3);
    for (let i = 0; i < 220; i++) {
      near.set([(seeded(i + 1) - 0.5) * 22, seeded(i + 401) * 9, (seeded(i + 801) - 0.5) * 16], i * 3);
    }
    const stars = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) {
      stars.set([(seeded(i + 1201) - 0.5) * 90, seeded(i + 1801) * 32 - 2, -14 - seeded(i + 2401) * 26], i * 3);
    }
    return { near, stars };
  }, []);

  useFrame((_, delta) => {
    const geometry = pollen.current?.geometry;
    if (!animate || !geometry) return;
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < attribute.count; i++) {
      const y = attribute.getY(i) + delta * (0.12 + seeded(i) * 0.32);
      attribute.setY(i, y > 9 ? 0 : y);
    }
    attribute.needsUpdate = true;
  });

  return (
    <>
      <points ref={pollen}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.near, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#ffd877" size={0.065} transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.stars, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#cfc2ff" size={0.12} transparent opacity={0.7} depthWrite={false} fog={false} />
      </points>
    </>
  );
}

/** Panggung heksagonal; bingkainya menyala saat perhentian itu disorot. */
function Platform({ color, active, animate }: { color: string; active: boolean; animate: boolean }) {
  const rim = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (rim.current) rim.current.opacity = active ? 0.8 + Math.sin(t * 4) * 0.2 : 0.55;
    if (halo.current) halo.current.rotation.z = animate ? t * 0.5 : 0;
  });
  return (
    <group>
      <mesh position={[0, 0.02, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.5, 1.65, 0.4, 6]} />
        <meshStandardMaterial color="#4a3894" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.235, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 6]}>
        <ringGeometry args={[1.32, 1.47, 6]} />
        <meshBasicMaterial ref={rim} color={color} transparent opacity={0.55} />
      </mesh>
      <mesh ref={halo} position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.95, 2.0, 48, 1, 0, Math.PI * 1.35]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.35} side={THREE.DoubleSide} />
      </mesh>
      <Beam color={color} active={active} animate={animate} />
      <Glow color={color} size={active ? 5.4 : 3.2} position={[0, 0.5, -0.4]} opacity={active ? 0.45 : 0.22} />
    </group>
  );
}

function Desk({ color, lit }: { color: string; lit: boolean }) {
  return (
    <group position={[0, 0.22, 0.62]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.5, 0.08, 0.66]} />
        <meshStandardMaterial color="#8d80bb" roughness={0.55} />
      </mesh>
      {[-0.66, 0.66].map((x) => (
        <mesh key={x} position={[x, 0.24, 0]}>
          <boxGeometry args={[0.07, 0.48, 0.56]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
        </mesh>
      ))}
      <mesh position={[0.38, 0.76, 0.1]} rotation={[0, -0.35, 0]}>
        <boxGeometry args={[0.55, 0.36, 0.04]} />
        <meshStandardMaterial color={INK} emissive={color} emissiveIntensity={lit ? 1.1 : 0.25} />
      </mesh>
    </group>
  );
}

/** Rak dokumen yang mengambang di perhentian pertama. */
function Library({ animate }: { animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!animate || !group.current) return;
    const t = clock.getElapsedTime();
    group.current.children.forEach((child, i) => {
      child.position.y = 1.15 + i * 0.16 + Math.sin(t * 1.6 + i * 1.3) * 0.14;
      child.rotation.y = Math.sin(t * 0.7 + i) * 0.3 - 0.35 + i * 0.35;
    });
  });
  return (
    <group ref={group}>
      {[-0.72, 0, 0.72].map((x, i) => (
        <group key={x} position={[x, 1.15 + i * 0.16, i === 1 ? 0.25 : -0.15]} rotation={[0, -0.35 + i * 0.35, 0]}>
          <DocumentSheet accent={[VIOLET, "#38bdf8", HONEY][i]} />
        </group>
      ))}
    </group>
  );
}

function Station({
  index,
  step,
  animate,
  hovered,
  onHover,
  onSelect,
}: {
  index: number;
  step: number;
  animate: boolean;
  hovered: boolean;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
}) {
  const { name, color, at } = STATIONS[index];
  const active = step === index + 1;
  const overview = step === 0;
  const body = useRef<THREE.Group>(null);
  const pose: CharacterPose = hovered || (index === 3 && (overview || active)) ? "waving" : active || overview ? "working" : "idle";

  // Karakter melompat kecil saat disorot penunjuk
  useFrame(({ clock }) => {
    if (body.current) body.current.position.y = 0.22 + (hovered && animate ? Math.abs(Math.sin(clock.getElapsedTime() * 6)) * 0.28 : 0);
  });

  return (
    <group
      position={at}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(index);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(index);
        setCursor(true);
      }}
      onPointerOut={() => {
        onHover(null);
        setCursor(false);
      }}
    >
      <Platform color={color} active={active || hovered} animate={animate} />
      {index === 0 ? (
        <>
          <Library animate={animate} />
          <PageOrbit show={active} animate={animate} />
        </>
      ) : (
        <>
          <group ref={body} position={[index === 3 ? 0 : -0.15, 0.22, -0.15]} scale={0.68}>
            <BlockyCharacter avatar={CAST[index - 1]} pose={pose} />
          </group>
          <Desk color={color} lit={active || overview} />
        </>
      )}
      {index === 1 && <Typing show={active} animate={animate} />}
      {index === 2 && (
        <>
          <group position={[0.9, 1.75, 0.2]} rotation={[0, -0.3, 0]}>
            <mesh>
              <torusGeometry args={[0.28, 0.055, 14, 40]} />
              <meshStandardMaterial color={HONEY} emissive={HONEY} emissiveIntensity={active ? 1.2 : 0.45} />
            </mesh>
            <mesh position={[0.28, -0.3, 0]} rotation={[0, 0, 0.75]}>
              <cylinderGeometry args={[0.05, 0.05, 0.36, 12]} />
              <meshStandardMaterial color="#cfc6ee" />
            </mesh>
          </group>
          <Scanner show={active} animate={animate} />
        </>
      )}
      {index === 3 && <Celebration show={active} animate={animate} />}
      {/* Saat menyorot satu perhentian, label lain disembunyikan agar tidak menutupi layar */}
      {(overview || active) && (
        <TextSprite
          text={name}
          position={[0, 2.95, 0]}
          height={hovered ? 0.5 : 0.4}
          bg={active || hovered ? color : "rgba(20,14,40,.86)"}
          fg={(active || hovered) && index === 2 ? INK : "#d6cdf2"}
          font={21}
          bold
        />
      )}
    </group>
  );
}

/** Garis alur bercahaya antar-perhentian dengan butiran yang mengalir, dan jari-jari ke inti sarang. */
function Route({ curve, step, animate }: { curve: THREE.CatmullRomCurve3; step: number; animate: boolean }) {
  const dots = useRef<THREE.Group>(null);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 180, 0.026, 8, true), [curve]);
  const spokes = useMemo(
    () =>
      STATIONS.map((s) => {
        const from = s.at.clone().setY(0.35);
        const middle = from.clone().multiplyScalar(0.5).setY(CORE + 0.25);
        return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, middle, new THREE.Vector3(0, CORE, 0)), 40, 0.014, 6, false);
      }),
    []
  );
  useEffect(() => () => [tube, ...spokes].forEach((g) => g.dispose()), [tube, spokes]);
  useFrame(({ clock }) => {
    if (!dots.current) return;
    const t = animate ? clock.getElapsedTime() * 0.1 : 0;
    dots.current.children.forEach((dot, i) => curve.getPointAt((t + i / dots.current!.children.length) % 1, dot.position));
  });
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial color="#8b6cff" transparent opacity={0.6} />
      </mesh>
      {spokes.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshBasicMaterial color={STATIONS[i].color} transparent opacity={step === i + 1 ? 0.85 : 0.22} />
        </mesh>
      ))}
      <group ref={dots}>
        {Array.from({ length: 18 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.065, 10, 8]} />
            <meshBasicMaterial color={i % 2 ? "#ffd25c" : "#c4b5fd"} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Lebah kurir, bintang utamanya: berkeliling di tampilan utama, lalu hinggap di perhentian aktif. */
function Courier({ step, curve, animate }: { step: number; curve: THREE.CatmullRomCurve3; animate: boolean }) {
  const bee = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const targetRef = useRef(new THREE.Vector3());
  const aheadRef = useRef(new THREE.Vector3());
  /** Sisa putaran salto, 1 → 0 */
  const spin = useRef(0);

  useFrame(({ clock, camera }, delta) => {
    const group = bee.current;
    if (!group) return;
    const target = targetRef.current;
    const ahead = aheadRef.current;
    const t = animate ? clock.getElapsedTime() : 0;
    let yaw: number;
    if (step === 0) {
      const u = (t * 0.06 + 0.72) % 1;
      curve.getPointAt(u, target);
      curve.getPointAt((u + 0.03) % 1, ahead);
      target.y += 1.75;
      // Menoleh ke arah terbang, tetapi wajahnya tetap condong ke penonton
      yaw = Math.atan2(ahead.x - target.x, ahead.z - target.z) * 0.4;
    } else {
      const station = STATIONS[step - 1].at;
      target.set(station.x + 1.95, 2.2, station.z - 0.1);
      yaw = Math.atan2(camera.position.x - target.x, camera.position.z - target.z) - 0.35;
    }
    target.y += Math.sin(t * 3.1) * 0.13;
    const follow = animate ? damp(delta, step === 0 ? 5 : 2.6) : 1;
    group.position.lerp(target, follow);
    group.rotation.y += (yaw - group.rotation.y) * follow;
    group.rotation.z = Math.sin(t * 2.2) * 0.07;
    spin.current = Math.max(0, spin.current - delta * 1.1);
    if (body.current) {
      // Salto penuh dengan perlambatan di akhir
      const left = spin.current;
      body.current.rotation.z = left ? (1 - left * left * left) * Math.PI * 2 : 0;
      body.current.scale.setScalar((step === 0 ? 1.4 : 1.08) * (1 + Math.sin(left * Math.PI) * 0.25));
    }
  });

  return (
    <>
      <group
        ref={bee}
        position={[0, 4, 2]}
        onClick={(e) => {
          e.stopPropagation();
          spin.current = 1;
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setCursor(true);
        }}
        onPointerOut={() => setCursor(false)}
      >
        <group ref={body}>
          <RobotBee animate={animate} />
        </group>
        <group position={[0, -1.08, 0.62]} rotation={[-0.15, 0, 0.08]} scale={0.82}>
          <DocumentSheet approved={step >= 3} />
        </group>
        <Glow color={HONEY} size={3.4} position={[0, 0, -0.6]} opacity={0.3} />
        <pointLight color="#ffcf6b" intensity={9} distance={5} />
      </group>
      <Trail target={bee} animate={animate} />
    </>
  );
}

/**
 * Kamera meluncur ke perhentian aktif, mengikuti penunjuk, dan bisa diputar dengan menyeret.
 * Gambar digeser agar tidak tertutup teks: ke kanan di layar lebar, ke atas di layar sempit.
 */
function CameraRig({ step, animate }: { step: number; animate: boolean }) {
  const look = useRef(new THREE.Vector3(0, 1, 0));
  const goalRef = useRef(new THREE.Vector3());
  const focusRef = useRef(new THREE.Vector3());
  const directionRef = useRef(new THREE.Vector3());
  const aim = useRef({ x: 0, y: 0, turn: 0, dragX: null as number | null });
  const element = useThree((s) => s.gl.domElement);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const state = aim.current;
      state.x = (e.clientX / window.innerWidth) * 2 - 1;
      state.y = 1 - (e.clientY / window.innerHeight) * 2;
      if (state.dragX !== null) {
        state.turn = Math.max(-0.9, Math.min(0.9, state.turn - (e.clientX - state.dragX) * 0.004));
        state.dragX = e.clientX;
      }
    };
    // Hanya tetikus yang memutar: di layar sentuh, geseran dipakai untuk menggulir
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") aim.current.dragX = e.clientX;
    };
    const up = () => (aim.current.dragX = null);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
    element.addEventListener("pointerdown", down);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      element.removeEventListener("pointerdown", down);
    };
  }, [element]);

  useFrame(({ camera, size, clock, scene }, delta) => {
    const goal = goalRef.current;
    const focus = focusRef.current;
    const direction = directionRef.current;
    const state = aim.current;
    const aspect = size.width / Math.max(1, size.height);
    const wide = size.width >= WIDE;
    const overview = step === 0;
    if (overview) {
      focus.set(0, 1.15, 0);
      const angle = Math.sin(clock.getElapsedTime() * (animate ? 0.11 : 0)) * 0.22 + state.turn;
      direction.set(Math.sin(angle) * 0.84, 0.54, Math.cos(angle) * 0.84);
    } else {
      const station = STATIONS[step - 1].at;
      focus.set(station.x + (wide ? 0.25 : 0.35), 1.4, station.z);
      direction.set(0.12, 0.4, 0.9);
    }
    // Perputaran hasil seretan memudar begitu tampilan utama ditinggalkan
    if (!overview) state.turn *= 0.9;
    const width = overview ? (wide ? 13.2 : 11.6) : wide ? 6.8 : 5.6;
    const height = overview ? 8.2 : 6.9;
    const distance = Math.max(width / (SPREAD * aspect * (wide ? 0.6 : 1)), height / (SPREAD * (wide ? 0.88 : 0.56)));
    goal.copy(direction.normalize()).multiplyScalar(distance).add(focus);
    if (animate) {
      goal.x += state.x * 0.6;
      goal.y += state.y * 0.35;
    }
    const follow = animate ? damp(delta, state.dragX === null ? 2.4 : 9) : 1;
    camera.position.lerp(goal, follow);
    look.current.lerp(focus, follow);
    camera.lookAt(look.current);
    (camera as THREE.PerspectiveCamera).setViewOffset(
      size.width,
      size.height,
      wide ? -size.width * 0.215 : 0,
      wide ? 0 : size.height * 0.2,
      size.width,
      size.height
    );
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = distance * 0.95;
      fog.far = distance * 2.3;
    }
  });
  return null;
}

function World({ step, animate, onSelect }: { step: number; animate: boolean; onSelect: (index: number) => void }) {
  const wide = useThree((s) => s.size.width >= WIDE);
  const [hovered, setHovered] = React.useState<number | null>(null);
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        STATIONS.map((s) => s.at.clone().setY(1.5)),
        true,
        "catmullrom",
        0.7
      ),
    []
  );
  return (
    <>
      <color attach="background" args={[NIGHT]} />
      <fog attach="fog" args={[NIGHT, 20, 46]} />
      <ambientLight intensity={0.95} />
      <hemisphereLight args={["#e2d6ff", "#241753", 0.85]} />
      <directionalLight
        position={[5, 9, 6]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
      />
      <pointLight position={[-6, 3, 4]} intensity={60} color={VIOLET} />
      <pointLight position={[6, 3, -3]} intensity={54} color={HONEY} />
      <pointLight position={[0, 1.6, 0]} intensity={10} color={HONEY} />
      <CameraRig step={step} animate={animate} />
      <Honeycomb step={step} animate={animate} />
      <HiveCore animate={animate} dim={step !== 0} />
      <Route curve={curve} step={step} animate={animate} />
      {STATIONS.map((station, i) => (
        <Station key={station.name} index={i} step={step} animate={animate} hovered={hovered === i} onHover={setHovered} onSelect={onSelect} />
      ))}
      <Courier step={step} curve={curve} animate={animate} />
      <Swarm animate={animate} />
      <Sky animate={animate} />
      {wide && animate && <Bloom />}
    </>
  );
}

export default function HiveScene({
  step,
  animate,
  running,
  onSelect,
}: {
  step: number;
  animate: boolean;
  running: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      frameloop={!running ? "never" : animate ? "always" : "demand"}
      camera={{ position: [0, 14, 24], fov: FOV, far: 120 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <World step={step} animate={animate} onSelect={onSelect} />
    </Canvas>
  );
}
