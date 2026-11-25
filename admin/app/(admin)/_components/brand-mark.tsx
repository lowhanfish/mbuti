/** Logo sementara MBUTI: tumpukan blok, selaras dengan karakter kantor 3D. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--color-brand)" />
      <rect x="8" y="9" width="7" height="7" rx="1.5" fill="#fff" />
      <rect x="17" y="9" width="7" height="7" rx="1.5" fill="var(--color-accent)" />
      <rect x="8" y="18" width="16" height="6" rx="1.5" fill="#fff" opacity="0.85" />
    </svg>
  );
}
