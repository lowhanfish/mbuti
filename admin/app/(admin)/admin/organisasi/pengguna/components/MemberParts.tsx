import { ACCESS_ROLE_LABEL, initials } from "@/utilities/labels";
import type { AccessRole } from "@/types/global";
import { Badge } from "../../../../_components/ui";
import { Icon } from "../../../../_components/admin-icons";
import { STATUS_LABEL, type MemberStatus } from "../types";

const AVATAR_TONES = [
  "from-[#9b6bff] to-[#5b2ee0]",
  "from-[#ffd25c] to-[#f59e0b]",
  "from-pink-400 to-fuchsia-600",
  "from-teal-300 to-emerald-500",
  "from-sky-300 to-blue-600",
  "from-orange-300 to-rose-500",
];

/** Avatar inisial; warnanya tetap untuk nama yang sama. */
export function MemberAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const tone = AVATAR_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      className={`rounded-2xl bg-gradient-to-br ${tone} text-white font-bold flex items-center justify-center shrink-0 shadow-sm`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

const ROLE_STYLE: Record<AccessRole, { variant: "dark" | "info" | "neutral" | "accent"; icon: string }> = {
  owner: { variant: "dark", icon: "crown" },
  admin: { variant: "info", icon: "shield" },
  member: { variant: "accent", icon: "users" },
  viewer: { variant: "neutral", icon: "eye" },
};

export function RoleBadge({ role }: { role: AccessRole }) {
  const style = ROLE_STYLE[role];
  return (
    <Badge variant={style.variant} size="sm">
      <Icon name={style.icon} size={12} />
      {ACCESS_ROLE_LABEL[role]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: MemberStatus }) {
  const variant = status === "active" ? "success" : status === "invited" ? "warning" : "danger";
  return (
    <Badge variant={variant} size="sm" dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
