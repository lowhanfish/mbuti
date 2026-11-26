"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../admin-icons";

/** Kelas wadah saat diperbesar: menutupi seluruh jendela, di atas menu tetapi di bawah modal dan notifikasi. */
export const FULLSCREEN_CLASSES = "fixed inset-0 z-[65] bg-canvas";

/**
 * Layar penuh untuk wadah seperti peta dan kantor 3D.
 *
 * Wadahnya diperbesar dengan CSS, dan seluruh dokumen diminta masuk mode layar penuh peramban.
 * Yang diminta adalah dokumen (bukan wadahnya) agar modal dan SweetAlert di <body> tetap terlihat.
 * Bila peramban menolak atau tidak mendukung, perbesaran CSS tetap berlaku.
 */
export function useFullscreen() {
  const [expanded, setExpanded] = useState(false);
  // True hanya selama layar penuh peramban diminta oleh wadah ini
  const native = useRef(false);

  const leaveNative = useCallback(() => {
    if (!native.current) return;
    native.current = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    if (expanded) {
      leaveNative();
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen?.()
        .then(() => {
          native.current = true;
        })
        .catch(() => {});
    }
  }, [expanded, leaveNative]);

  useEffect(() => {
    if (!expanded) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Tombol Esc pada layar penuh peramban hanya terlihat lewat peristiwa ini
    const onChange = () => {
      if (!document.fullscreenElement && native.current) {
        native.current = false;
        setExpanded(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      // Esc milik modal atau notifikasi yang sedang terbuka tidak ikut mengecilkan wadah
      if (event.key === "Escape" && !document.querySelector('[aria-modal="true"]')) {
        leaveNative();
        setExpanded(false);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded, leaveNative]);

  // Pindah halaman saat layar penuh: kembalikan peramban ke ukuran biasa
  useEffect(() => leaveNative, [leaveNative]);

  return { expanded, toggle };
}

export function FullscreenButton({
  expanded,
  onToggle,
  withLabel = false,
  className = "",
}: {
  expanded: boolean;
  onToggle: () => void;
  withLabel?: boolean;
  className?: string;
}) {
  const label = expanded ? "Keluar layar penuh" : "Layar penuh";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={expanded}
      aria-label={label}
      title={expanded ? `${label} (Esc)` : label}
      className={`h-9 ${withLabel ? "px-3" : "w-9"} rounded-xl glass inline-flex items-center justify-center gap-1.5 text-xs font-bold text-ink hover:text-brand cursor-pointer transition-colors ${className}`}
    >
      <Icon name={expanded ? "shrink" : "expand"} size={16} />
      {withLabel && label}
    </button>
  );
}
