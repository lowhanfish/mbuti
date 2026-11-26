"use client";

import { useFrame } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Glow, HONEY, INK, VIOLET } from "./scene-kit";

const EYE = "#5ee7ff";

const wingShape = (length: number, width: number) => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(length * 0.25, width, length * 0.95, width * 0.9, length, width * 0.2);
  shape.bezierCurveTo(length * 1.02, -width * 0.45, length * 0.35, -width * 0.45, 0, 0);
  return shape;
};

/**
 * Maskot lebah robot dalam 3D, disusun dari bentuk dasar mengikuti gambar maskot MBUTI.
 * Menghadap sumbu +z. `animate` mematikan kepakan sayap bagi pengguna yang mengurangi gerak.
 */
export function RobotBee({ animate = true }: { animate?: boolean }) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const wings = useMemo(
    () => [new THREE.ShapeGeometry(wingShape(1.15, 0.52), 24), new THREE.ShapeGeometry(wingShape(0.82, 0.34), 24)],
    []
  );
  const edges = useMemo(() => wings.map((g) => new THREE.EdgesGeometry(g)), [wings]);
  useEffect(() => () => [...wings, ...edges].forEach((g) => g.dispose()), [wings, edges]);

  useFrame(({ clock }) => {
    if (!animate) return;
    // Sayap kiri berada di dalam grup cermin, jadi putarannya sama dengan yang kanan
    const swing = 0.5 + Math.sin(clock.getElapsedTime() * 34) * 0.55;
    if (left.current) left.current.rotation.y = swing;
    if (right.current) right.current.rotation.y = swing;
  });

  const wingPair = (
    <>
      {wings.map((geometry, i) => (
        <group key={i} position={[0, i === 0 ? 0.1 : -0.14, 0]} rotation={[0, 0, i === 0 ? 0.55 : -0.2]}>
          <mesh geometry={geometry}>
            <meshBasicMaterial color="#b79cff" transparent opacity={0.34} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <lineSegments geometry={edges[i]}>
            <lineBasicMaterial color="#ffd98a" transparent opacity={0.9} />
          </lineSegments>
        </group>
      ))}
    </>
  );

  return (
    <group>
      {/* perut bergaris */}
      <group position={[0, -0.12, -0.48]} rotation={[0.38, 0, 0]}>
        <mesh scale={[0.44, 0.4, 0.62]} castShadow>
          <sphereGeometry args={[1, 32, 24]} />
          <meshStandardMaterial color={HONEY} roughness={0.28} metalness={0.2} />
        </mesh>
        {[0.12, -0.24].map((z) => {
          const r = Math.sqrt(1 - (z / 0.62) ** 2);
          return (
            <mesh key={z} position={[0, 0, z]} scale={[0.44 * r, 0.4 * r, 1]}>
              <torusGeometry args={[0.99, 0.17, 14, 40]} />
              <meshStandardMaterial color={INK} roughness={0.35} metalness={0.3} />
            </mesh>
          );
        })}
        <Glow color="#c084fc" size={1.1} position={[0, 0, -0.78]} opacity={0.8} />
      </group>
      {/* dada dengan lambang */}
      <mesh position={[0, -0.04, 0.08]} castShadow>
        <sphereGeometry args={[0.29, 28, 20]} />
        <meshStandardMaterial color={INK} roughness={0.3} metalness={0.45} />
      </mesh>
      <mesh position={[0, -0.08, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.03, 6]} />
        <meshStandardMaterial color={VIOLET} emissive={VIOLET} emissiveIntensity={1.1} />
      </mesh>
      {/* kaki */}
      {[-0.17, 0.17].map((x) => (
        <group key={x} position={[x, -0.36, 0.02]} rotation={[0.5, 0, x > 0 ? 0.18 : -0.18]}>
          <mesh position={[0, -0.08, 0]}>
            <capsuleGeometry args={[0.055, 0.22, 6, 12]} />
            <meshStandardMaterial color={INK} roughness={0.35} />
          </mesh>
          <mesh position={[0, -0.27, 0.02]}>
            <sphereGeometry args={[0.085, 16, 12]} />
            <meshStandardMaterial color={HONEY} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* lengan */}
      {[-0.31, 0.31].map((x) => (
        <group key={x} position={[x, -0.06, 0.22]} rotation={[-1.15, 0, x > 0 ? 0.35 : -0.35]}>
          <mesh position={[0, -0.12, 0]}>
            <capsuleGeometry args={[0.05, 0.2, 6, 12]} />
            <meshStandardMaterial color={INK} />
          </mesh>
          <mesh position={[0, -0.28, 0]}>
            <sphereGeometry args={[0.075, 16, 12]} />
            <meshStandardMaterial color="#fff7e6" />
          </mesh>
        </group>
      ))}
      {/* kepala */}
      <group position={[0, 0.43, 0.24]}>
        <mesh scale={[0.5, 0.43, 0.44]} castShadow>
          <sphereGeometry args={[1, 36, 28]} />
          <meshStandardMaterial color={HONEY} roughness={0.22} metalness={0.25} />
        </mesh>
        <mesh position={[0, -0.01, 0.19]} scale={[0.4, 0.31, 0.29]}>
          <sphereGeometry args={[1, 36, 28]} />
          <meshStandardMaterial color="#0d0a18" roughness={0.12} metalness={0.5} />
        </mesh>
        {/* mata: satu terbuka, satu mengedip seperti maskot */}
        <mesh position={[-0.15, 0.03, 0.475]} scale={[1, 1.35, 0.5]}>
          <sphereGeometry args={[0.062, 18, 14]} />
          <meshBasicMaterial color={EYE} />
        </mesh>
        <mesh position={[0.15, 0.03, 0.47]}>
          <torusGeometry args={[0.065, 0.017, 10, 24, Math.PI]} />
          <meshBasicMaterial color={EYE} />
        </mesh>
        <mesh position={[0, -0.1, 0.475]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.055, 0.018, 10, 24, Math.PI]} />
          <meshBasicMaterial color={HONEY} />
        </mesh>
        {[-0.25, 0.25].map((x) => (
          <mesh key={x} position={[x, -0.07, 0.435]} scale={[1.5, 0.8, 0.4]}>
            <sphereGeometry args={[0.035, 12, 10]} />
            <meshBasicMaterial color="#f472b6" />
          </mesh>
        ))}
        {/* penyuara telinga */}
        {[-0.49, 0.49].map((x) => (
          <group key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <mesh>
              <cylinderGeometry args={[0.15, 0.15, 0.1, 24]} />
              <meshStandardMaterial color={INK} roughness={0.3} />
            </mesh>
            <mesh>
              <torusGeometry args={[0.13, 0.025, 10, 32]} />
              <meshStandardMaterial color={VIOLET} emissive={VIOLET} emissiveIntensity={1.4} />
            </mesh>
          </group>
        ))}
        {/* antena */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.17, 0.38, 0]} rotation={[0, 0, side * -0.42]}>
            <mesh position={[0, 0.16, 0]}>
              <cylinderGeometry args={[0.022, 0.026, 0.34, 10]} />
              <meshStandardMaterial color={INK} />
            </mesh>
            <mesh position={[0, 0.36, 0]}>
              <sphereGeometry args={[0.07, 16, 12]} />
              <meshStandardMaterial color={HONEY} emissive={HONEY} emissiveIntensity={1.6} />
            </mesh>
            <Glow color={HONEY} size={0.5} position={[0, 0.36, 0]} />
          </group>
        ))}
        {/* bunga kecil */}
        <group position={[0.3, 0.3, 0.25]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[Math.cos((i * Math.PI * 2) / 5) * 0.065, Math.sin((i * Math.PI * 2) / 5) * 0.065, 0]}>
              <sphereGeometry args={[0.045, 12, 10]} />
              <meshStandardMaterial color="#fff7f0" />
            </mesh>
          ))}
          <mesh position={[0, 0, 0.035]}>
            <sphereGeometry args={[0.035, 12, 10]} />
            <meshStandardMaterial color={HONEY} />
          </mesh>
        </group>
      </group>
      {/* sayap */}
      <group ref={right} position={[0.18, 0.18, -0.16]} rotation={[0, 0.5, 0]}>
        {wingPair}
      </group>
      <group position={[-0.18, 0.18, -0.16]} scale={[-1, 1, 1]}>
        <group ref={left} rotation={[0, 0.5, 0]}>
          {wingPair}
        </group>
      </group>
    </group>
  );
}
