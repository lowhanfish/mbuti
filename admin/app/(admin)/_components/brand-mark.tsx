import Image from "next/image";

/** Kepala maskot lebah MBUTI dalam bingkai bulat. */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] bg-gradient-to-br from-[#2a1f4a] to-ink shadow-[0_6px_16px_-4px_rgba(124,77,255,.55)] ${className}`}
      style={{ width: size, height: size }}
    >
      <Image src="/brand/mbuti-head.webp" alt="MBUTI" width={size} height={size} className="object-cover scale-110" />
    </span>
  );
}

/** Maskot lebah utuh, melayang pelan. */
export function BrandMascot({ width = 360, className = "" }: { width?: number; className?: string }) {
  return (
    <Image
      src="/brand/mbuti-bee.webp"
      alt="Maskot lebah MBUTI"
      width={width}
      height={Math.round((width * 575) / 760)}
      priority
      className={`animate-float drop-shadow-[0_30px_40px_rgba(124,77,255,.35)] select-none ${className}`}
    />
  );
}

/** Lapisan gumpalan warna di belakang halaman. */
export function BackgroundOrbs() {
  return (
    <div className="bg-orbs" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
