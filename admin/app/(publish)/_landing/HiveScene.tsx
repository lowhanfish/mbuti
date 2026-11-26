"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import React, { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { avatarFromSeed } from "../../(admin)/_components/agent/avatar-config";
import { BlockyCharacter, type CharacterPose } from "../../(admin)/_components/agent/blocky-character";
import { TextSprite } from "../../(admin)/admin/kantor/components/Sprites";
import { RobotBee } from "./RobotBee";
import { DocumentSheet, Glow, HONEY, INK, VIOLET, seeded } from "./scene-kit";

/** Empat perhentian sebuah tugas, melingkar searah jarum jam. */
const STATIONS = [
  { name: "SOP & panduan", color: "#38bdf8", at: new THREE.Vector3(-3.9, 0, 0.5) },
  { name: "Rani · menyusun", color: VIOLET, at: new THREE.Vector3(-0.7, 0, -2.9) },
  { name: "Tegar · memeriksa", color: HONEY, at: new THREE.Vector3(3.9, 0, -0.7) },
  { name: "Anda · memutuskan", color: "#ec4899", at: new THREE.Vector3(0.7, 0, 2.9) },
];

const CAST = [
  { ...avatarFromSeed("Rani"), shirt: "#7c4dff", hair_style: "long" as const, accessory: "headset" as const },
  { ...avatarFromSeed("Tegar"), shirt: "#ffb81c", hair_style: "short" as const, accessory: "glasses" as const },
  { ...avatarFromSeed("Anda"), shirt: "#ec4899", hair_style: "bun" as const, accessory: "none" as const },
];

const FOV = 35;
const SPREAD = 2 * Math.tan((FOV / 2) * (Math.PI / 180));
const damp = (delta: number, speed: number) => 1 - Math.exp(-delta * speed);

/** Lantai sarang lebah yang bergelombang pelan. */
function Honeycomb({ animate }: { animate: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => {
    const list: { x: number; z: number; phase: number }[] = [];
    const radius = 0.66;
    const stepX = Math.sqrt(3) * radius;
    for (let row = -12; row <= 12; row++) {
      for (let col = -12; col <= 12; col++) {
        const x = col * stepX + (row % 2 ? stepX / 2 : 0);
        const z = row * radius * 1.5;
        if (Math.hypot(x, z) < 12.5) list.push({ x, z, phase: Math.hypot(x, z) });
      }
    }
    return list;
  }, []);

  const place = (time: number) => {
    const target = mesh.current;
    if (!target) return;
    const dummy = new THREE.Object3D();
    cells.forEach((cell, i) => {
      dummy.position.set(cell.x, -0.34 + Math.sin(time * 1.3 - cell.phase * 0.75) * 0.09, cell.z);
      dummy.updateMatrix();
      target.setMatrixAt(i, dummy.matrix);
    });
    target.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const color = new THREE.Color();
    cells.forEach((cell, i) => {
      // Sel makin gelap ke tepi, sebagian kecil berwarna madu
      const honey = seeded(i) > 0.94;
      color.set(honey ? "#6b4a1f" : "#2b1f52").multiplyScalar(Math.max(0.3, 1 - cell.phase / 17));
      target.setColorAt(i, color);
    });
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    place(0);
  });

  useFrame(({ clock }) => {
    if (animate) place(clock.getElapsedTime());
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, cells.length]} receiveShadow frustumCulled={false}>
      <cylinderGeometry args={[0.6, 0.6, 0.22, 6]} />
      <meshStandardMaterial roughness={0.5} metalness={0.35} />
    </instancedMesh>
  );
}

/** Serbuk sari yang melayang naik. */
function Pollen({ animate }: { animate: boolean }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const data = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      data[i * 3] = (seeded(i + 1) - 0.5) * 18;
      data[i * 3 + 1] = seeded(i + 401) * 8;
      data[i * 3 + 2] = (seeded(i + 801) - 0.5) * 14;
    }
    return data;
  }, []);

  useFrame((_, delta) => {
    const geometry = points.current?.geometry;
    if (!animate || !geometry) return;
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < attribute.count; i++) {
      const y = attribute.getY(i) + delta * (0.12 + seeded(i) * 0.3);
      attribute.setY(i, y > 8 ? 0 : y);
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffd877" size={0.065} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/** Panggung heksagonal; bingkainya menyala saat perhentian itu disorot. */
function Platform({ color, active }: { color: string; active: boolean }) {
  const rim = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (rim.current) rim.current.opacity = active ? 0.75 + Math.sin(clock.getElapsedTime() * 4) * 0.25 : 0.35;
  });
  return (
    <group>
      <mesh position={[0, 0.02, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.5, 1.65, 0.4, 6]} />
        <meshStandardMaterial color="#40307a" roughness={0.45} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.235, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 6]}>
        <ringGeometry args={[1.33, 1.46, 6]} />
        <meshBasicMaterial ref={rim} color={color} transparent opacity={0.35} />
      </mesh>
      <Glow color={color} size={active ? 5.2 : 3} position={[0, 0.5, -0.4]} opacity={active ? 0.5 : 0.22} />
    </group>
  );
}

function Desk({ color, lit }: { color: string; lit: boolean }) {
  return (
    <group position={[0, 0.22, 0.62]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.5, 0.08, 0.66]} />
        <meshStandardMaterial color="#f4f0ff" roughness={0.35} />
      </mesh>
      {[-0.66, 0.66].map((x) => (
        <mesh key={x} position={[x, 0.24, 0]}>
          <boxGeometry args={[0.07, 0.48, 0.56]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      <mesh position={[0.38, 0.76, 0.1]} rotation={[0, -0.35, 0]}>
        <boxGeometry args={[0.55, 0.36, 0.04]} />
        <meshStandardMaterial color={INK} emissive={color} emissiveIntensity={lit ? 0.85 : 0.15} />
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
      child.position.y = 1.15 + i * 0.16 + Math.sin(t * 1.6 + i * 1.3) * 0.12;
      child.rotation.y = Math.sin(t * 0.7 + i) * 0.25 - 0.35 + i * 0.35;
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

function Station({ index, step, animate }: { index: number; step: number; animate: boolean }) {
  const { name, color, at } = STATIONS[index];
  const active = step === index + 1;
  const overview = step === 0;
  const pose: CharacterPose = index === 3 ? "waving" : active || overview ? "working" : "idle";
  return (
    <group position={at}>
      <Platform color={color} active={active} />
      {index === 0 ? (
        <Library animate={animate} />
      ) : (
        <>
          <group position={[index === 3 ? 0 : -0.15, 0.22, -0.15]} scale={0.66}>
            <BlockyCharacter avatar={CAST[index - 1]} pose={pose} />
          </group>
          <Desk color={color} lit={active || overview} />
        </>
      )}
      {index === 2 && (
        <group position={[0.85, 1.7, 0.2]} rotation={[0, -0.3, 0]}>
          <mesh>
            <torusGeometry args={[0.28, 0.055, 14, 40]} />
            <meshStandardMaterial color={HONEY} emissive={HONEY} emissiveIntensity={active ? 1 : 0.35} />
          </mesh>
          <mesh position={[0.28, -0.3, 0]} rotation={[0, 0, 0.75]}>
            <cylinderGeometry args={[0.05, 0.05, 0.36, 12]} />
            <meshStandardMaterial color="#f4f0ff" />
          </mesh>
        </group>
      )}
      {/* Saat menyorot satu perhentian, label lain disembunyikan agar tidak menutupi layar */}
      {(overview || active) && (
        <TextSprite text={name} position={[0, 2.75, 0]} height={0.4} bg={active ? color : "rgba(255,255,255,.94)"} fg={active && index !== 2 ? "#ffffff" : INK} font={21} bold />
      )}
    </group>
  );
}

/** Garis alur bercahaya antar-perhentian dengan butiran yang mengalir. */
function Route({ curve, animate }: { curve: THREE.CatmullRomCurve3; animate: boolean }) {
  const dots = useRef<THREE.Group>(null);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 160, 0.022, 8, true), [curve]);
  useFrame(({ clock }) => {
    if (!dots.current) return;
    const t = animate ? clock.getElapsedTime() * 0.09 : 0;
    dots.current.children.forEach((dot, i) => curve.getPointAt((t + i / dots.current!.children.length) % 1, dot.position));
  });
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial color="#8b6cff" transparent opacity={0.45} />
      </mesh>
      <group ref={dots}>
        {Array.from({ length: 14 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshBasicMaterial color={i % 2 ? "#ffd25c" : "#c4b5fd"} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Lebah kurir: berkeliling di tampilan utama, lalu hinggap di perhentian yang disorot. */
function Courier({ step, curve, animate }: { step: number; curve: THREE.CatmullRomCurve3; animate: boolean }) {
  const bee = useRef<THREE.Group>(null);
  const targetRef = useRef(new THREE.Vector3());
  const aheadRef = useRef(new THREE.Vector3());

  useFrame(({ clock, camera }, delta) => {
    const group = bee.current;
    if (!group) return;
    const target = targetRef.current;
    const ahead = aheadRef.current;
    const t = animate ? clock.getElapsedTime() : 0;
    let yaw: number;
    if (step === 0) {
      const u = (t * 0.055 + 0.04) % 1;
      curve.getPointAt(u, target);
      curve.getPointAt((u + 0.03) % 1, ahead);
      target.y += 1.45;
      // Menoleh ke arah terbang, tetapi wajahnya tetap condong ke penonton
      yaw = Math.atan2(ahead.x - target.x, ahead.z - target.z) * 0.45;
    } else {
      const station = STATIONS[step - 1].at;
      target.set(station.x + 1.95, 2.15, station.z - 0.1);
      yaw = Math.atan2(camera.position.x - target.x, camera.position.z - target.z) - 0.35;
    }
    target.y += Math.sin(t * 3.1) * 0.12;
    const follow = animate ? damp(delta, step === 0 ? 5 : 2.6) : 1;
    group.position.lerp(target, follow);
    group.rotation.y += (yaw - group.rotation.y) * follow;
    group.rotation.z = Math.sin(t * 2.2) * 0.07;
  });

  return (
    <group ref={bee} position={[0, 3.4, 2]}>
      <group scale={1.02}>
        <RobotBee animate={animate} />
      </group>
      <group position={[0, -0.9, 0.52]} rotation={[-0.15, 0, 0.08]} scale={0.8}>
        <DocumentSheet approved={step >= 3} />
      </group>
      <Glow color={HONEY} size={2.6} position={[0, 0, -0.5]} opacity={0.28} />
    </group>
  );
}

/** Kamera meluncur ke perhentian aktif dan sedikit mengikuti penunjuk. Jaraknya menyesuaikan bentuk layar. */
function CameraRig({ step, animate }: { step: number; animate: boolean }) {
  const look = useRef(new THREE.Vector3(0, 1, 0));
  const goalRef = useRef(new THREE.Vector3());
  const focusRef = useRef(new THREE.Vector3());
  const directionRef = useRef(new THREE.Vector3());

  useFrame(({ camera, pointer, size, clock }, delta) => {
    const goal = goalRef.current;
    const focus = focusRef.current;
    const direction = directionRef.current;
    const aspect = size.width / Math.max(1, size.height);
    const overview = step === 0;
    // Di layar lebar tepi kiri adegan tertutup teks, jadi susunannya digeser ke kanan
    const aside = size.width >= 560;
    if (overview) {
      focus.set(aside ? -1 : 0, 1, 0);
      direction.set(Math.sin(clock.getElapsedTime() * (animate ? 0.12 : 0)) * 0.16, 0.55, 0.83);
    } else {
      const station = STATIONS[step - 1].at;
      focus.set(station.x + 0.55, 1.5, station.z);
      direction.set(0.12, 0.4, 0.9);
    }
    const width = overview ? (aside ? 12.8 : 11.2) : 6.8;
    const height = overview ? 8 : 6.4;
    const distance = Math.max(width / (SPREAD * aspect), height / SPREAD);
    goal.copy(direction.normalize()).multiplyScalar(distance).add(focus);
    if (animate) {
      goal.x += pointer.x * 0.7;
      goal.y += pointer.y * 0.35;
    }
    const follow = animate ? damp(delta, 2.4) : 1;
    camera.position.lerp(goal, follow);
    look.current.lerp(focus, follow);
    camera.lookAt(look.current);
  });
  return null;
}

export default function HiveScene({ step, animate, running }: { step: number; animate: boolean; running: boolean }) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        STATIONS.map((s) => s.at.clone().setY(1.7)),
        true,
        "catmullrom",
        0.7
      ),
    []
  );
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      frameloop={!running ? "never" : animate ? "always" : "demand"}
      camera={{ position: [0, 12, 20], fov: FOV }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <fog attach="fog" args={["#1c1338", 18, 40]} />
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#d9ccff", "#1c1338", 0.7]} />
      <directionalLight position={[5, 9, 6]} intensity={1.9} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} />
      <pointLight position={[-6, 3, 4]} intensity={40} color={VIOLET} />
      <pointLight position={[6, 3, -3]} intensity={36} color={HONEY} />
      <CameraRig step={step} animate={animate} />
      <Honeycomb animate={animate} />
      <Route curve={curve} animate={animate} />
      {STATIONS.map((station, i) => (
        <Station key={station.name} index={i} step={step} animate={animate} />
      ))}
      <Courier step={step} curve={curve} animate={animate} />
      <Pollen animate={animate} />
    </Canvas>
  );
}
