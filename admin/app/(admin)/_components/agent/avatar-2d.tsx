import type { AvatarConfig } from "./avatar-config";

/**
 * Karakter blok tampak depan dalam SVG. Ringan untuk kartu dan daftar
 * (pratinjau 3D hanya dipakai di editor agar tidak membuat banyak konteks WebGL).
 */
export function Avatar2D({
  avatar,
  size = 56,
  className = "",
  title,
}: {
  avatar: AvatarConfig;
  size?: number;
  className?: string;
  title?: string;
}) {
  const { skin, hair, hair_style, shirt, pants, accessory } = avatar;
  const shade = "rgba(0,0,0,.14)";
  return (
    <svg
      viewBox="0 0 40 56"
      width={(size * 40) / 56}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* bayangan */}
      <ellipse cx="20" cy="54.5" rx="11" ry="1.5" fill="rgba(24,18,43,.18)" />
      {/* kaki */}
      <rect x="12" y="40" width="7.5" height="14" rx="1.2" fill={pants} />
      <rect x="20.5" y="40" width="7.5" height="14" rx="1.2" fill={pants} />
      <rect x="20.5" y="40" width="7.5" height="14" rx="1.2" fill={shade} />
      {/* lengan */}
      <rect x="4.5" y="24" width="6" height="15" rx="1.2" fill={shirt} />
      <rect x="29.5" y="24" width="6" height="15" rx="1.2" fill={shirt} />
      <rect x="29.5" y="24" width="6" height="15" rx="1.2" fill={shade} />
      <rect x="4.5" y="36" width="6" height="4" rx="1" fill={skin} />
      <rect x="29.5" y="36" width="6" height="4" rx="1" fill={skin} />
      {/* badan */}
      <rect x="11" y="23" width="18" height="18" rx="1.6" fill={shirt} />
      <rect x="11" y="38" width="18" height="3" fill={shade} />
      {accessory === "tie" && <path d="M19 23h2l1 3-1.6 9h-0.8L18 26z" fill="#18122b" />}
      {/* kepala */}
      <rect x="10" y="5" width="20" height="18" rx="2.4" fill={skin} />
      <rect x="25" y="5" width="5" height="18" rx="2" fill={shade} />
      {/* rambut */}
      {hair_style === "short" && <path d="M10 11V7.4A2.4 2.4 0 0 1 12.4 5h15.2A2.4 2.4 0 0 1 30 7.4V11h-3V8.5H13V11z" fill={hair} />}
      {hair_style === "long" && (
        <>
          <path d="M8.5 24V7.4A3 3 0 0 1 11.5 4h17a3 3 0 0 1 3 3.4V24h-3V9H11.5v15z" fill={hair} />
        </>
      )}
      {hair_style === "bun" && (
        <>
          <rect x="15" y="0.5" width="10" height="6" rx="2.5" fill={hair} />
          <path d="M10 10V7.4A2.4 2.4 0 0 1 12.4 5h15.2A2.4 2.4 0 0 1 30 7.4V10h-2V8H12v2z" fill={hair} />
        </>
      )}
      {hair_style === "cap" && (
        <>
          <rect x="9.5" y="3.5" width="21" height="6.5" rx="2" fill={hair} />
          <rect x="20" y="8" width="13" height="2.6" rx="1" fill={hair} />
        </>
      )}
      {/* wajah */}
      <rect x="14" y="13" width="3" height="3.4" rx="0.8" fill="#18122b" />
      <rect x="23" y="13" width="3" height="3.4" rx="0.8" fill="#18122b" />
      <rect x="14.6" y="13.5" width="1" height="1" fill="#fff" />
      <rect x="23.6" y="13.5" width="1" height="1" fill="#fff" />
      <path d="M17 19h6" stroke="#18122b" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="11.5" y="17" width="2.5" height="1.4" rx="0.7" fill="#f472b6" opacity=".45" />
      <rect x="26" y="17" width="2.5" height="1.4" rx="0.7" fill="#f472b6" opacity=".45" />
      {/* aksesori */}
      {accessory === "glasses" && (
        <g fill="none" stroke="#18122b" strokeWidth="1">
          <rect x="12.6" y="12.2" width="5.8" height="5" rx="1" />
          <rect x="21.6" y="12.2" width="5.8" height="5" rx="1" />
          <path d="M18.4 14.2h3.2" />
        </g>
      )}
      {accessory === "headset" && (
        <>
          <path d="M9 13V9a11 6 0 0 1 22 0v4" fill="none" stroke="#18122b" strokeWidth="1.6" />
          <rect x="7.2" y="11.5" width="3.6" height="6" rx="1.2" fill="#18122b" />
          <rect x="29.2" y="11.5" width="3.6" height="6" rx="1.2" fill="#18122b" />
          <path d="M9 17.5c0 3 3 4 6 4" fill="none" stroke="#18122b" strokeWidth="1" />
        </>
      )}
      {accessory === "flower" && (
        <g transform="translate(27 5)">
          {[0, 72, 144, 216, 288].map((r) => (
            <ellipse key={r} cx="0" cy="-2.2" rx="1.5" ry="2.2" fill="#fff" transform={`rotate(${r})`} />
          ))}
          <circle r="1.4" fill="#ffb81c" />
        </g>
      )}
      {accessory === "antenna" && (
        <g stroke="#18122b" strokeWidth="1.2" fill="none">
          <path d="M15 5c-1-2.5-2-3.5-4-4" />
          <path d="M25 5c1-2.5 2-3.5 4-4" />
          <circle cx="10.6" cy="1.1" r="1.6" fill="#ffb81c" stroke="none" />
          <circle cx="29.4" cy="1.1" r="1.6" fill="#ffb81c" stroke="none" />
        </g>
      )}
    </svg>
  );
}
