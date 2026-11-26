"use client";

import React, { useEffect, useMemo } from "react";
import * as THREE from "three";

export const HONEY = "#ffb81c";
export const VIOLET = "#7c4dff";
export const INK = "#18122b";
/** Warna latar halaman depan; sama dengan --lp-night di globals.css. */
export const NIGHT = "#0f0a1f";

/** Angka semu-acak yang tetap untuk urutan yang sama, agar susunan adegan tidak berubah antar-render. */
export const seeded = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const makeGlowTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,.4)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
};

/** Pendar lembut: pengganti efek bloom yang jauh lebih ringan. */
export function Glow({
  color,
  size,
  position = [0, 0, 0],
  opacity = 0.7,
}: {
  color: string;
  size: number;
  position?: [number, number, number];
  opacity?: number;
}) {
  const texture = useMemo(() => makeGlowTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[size, size, 1]}>
      <spriteMaterial map={texture} color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

/** Lembar dokumen kecil bergaris; `approved` menambahkan cap centang. */
export function DocumentSheet({ accent = VIOLET, approved = false }: { accent?: string; approved?: boolean }) {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[0.66, 0.86, 0.045]} />
        <meshStandardMaterial color="#d8d2ee" emissive="#8f7ad6" emissiveIntensity={0.16} roughness={0.45} />
      </mesh>
      <mesh position={[-0.09, 0.29, 0.03]}>
        <boxGeometry args={[0.34, 0.075, 0.012]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      {[0.12, -0.01, -0.14, -0.27].map((y, i) => (
        <mesh key={y} position={[i === 3 ? -0.1 : 0, y, 0.03]}>
          <boxGeometry args={[i === 3 ? 0.3 : 0.5, 0.04, 0.012]} />
          <meshBasicMaterial color="#c9bfe6" />
        </mesh>
      ))}
      {approved && (
        <group position={[0.22, -0.28, 0.07]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.04, 28]} />
            <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[-0.045, -0.015, 0.035]} rotation={[0, 0, -0.75]}>
            <boxGeometry args={[0.04, 0.1, 0.015]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0.035, 0.012, 0.035]} rotation={[0, 0, 0.65]}>
            <boxGeometry args={[0.04, 0.17, 0.015]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      )}
    </group>
  );
}
