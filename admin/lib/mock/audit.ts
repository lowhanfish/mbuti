/** Jejak audit data contoh, meniru `server/app/services/audit.py`. */
import type { MockDatabase } from "./seed";

export interface MockAuditLog {
  id: string;
  organization_id: string;
  action: string;
  label: string;
  target: string;
  actor_name: string;
  actor_email: string;
  ip: string;
  request_id: string;
  created_at: string;
}

const ACTIONS: Array<[string, RegExp, string, string]> = [
  ["PUT", /organisasi\/profil\/update$/, "organisasi.ubah", "Mengubah profil organisasi"],
  ["POST", /unit\/create$/, "unit.buat", "Membuat unit"],
  ["PUT", /unit\/update\//, "unit.ubah", "Mengubah unit"],
  ["DELETE", /unit\/delete\//, "unit.hapus", "Menghapus unit"],
  ["POST", /pengguna\/invite$/, "anggota.undang", "Mengundang anggota"],
  ["PUT", /pengguna\/update\//, "anggota.ubah", "Mengubah anggota"],
  ["DELETE", /pengguna\/delete\//, "anggota.keluarkan", "Mengeluarkan anggota"],
  ["POST", /role\/create$/, "role.buat", "Membuat role"],
  ["PUT", /role\/update\//, "role.ubah", "Mengubah role"],
  ["DELETE", /role\/delete\//, "role.hapus", "Menghapus role"],
  ["POST", /role\/[^/]+\/trial$/, "role.ujicoba", "Menguji coba role"],
  ["POST", /relasi\/create$/, "relasi.buat", "Membuat relasi"],
  ["PUT", /relasi\/update\//, "relasi.ubah", "Mengubah relasi"],
  ["DELETE", /relasi\/delete\//, "relasi.hapus", "Menghapus relasi"],
  ["POST", /relasi\/humans$/, "relasi.manusia", "Menaruh manusia di peta"],
  ["DELETE", /relasi\/humans\//, "relasi.manusia", "Mengeluarkan manusia dari peta"],
  ["POST", /pengetahuan\/create$/, "dokumen.unggah", "Mengunggah dokumen"],
  ["PUT", /pengetahuan\/update\//, "dokumen.ubah", "Mengubah dokumen"],
  ["DELETE", /pengetahuan\/delete\//, "dokumen.hapus", "Menghapus dokumen"],
  ["POST", /pengetahuan\/[^/]+\/versions$/, "dokumen.versi", "Mengunggah versi dokumen"],
  ["PUT", /versions\/[^/]+\/activate$/, "dokumen.versi", "Mengganti versi aktif dokumen"],
  ["PUT", /pengaturan\/model-ai\/update$/, "pengaturan.model", "Mengubah model AI"],
  ["PUT", /pengaturan\/batas-biaya\/update$/, "pengaturan.biaya", "Mengubah batas biaya"],
  ["POST", /tugas\/create$/, "tugas.buat", "Membuat tugas"],
  ["POST", /tugas\/[^/]+\/cancel$/, "tugas.hentikan", "Menghentikan tugas"],
  ["POST", /persetujuan\/[^/]+\/decide$/, "persetujuan.putuskan", "Memutuskan persetujuan"],
  ["POST", /pengguna\/resend-invite\//, "anggota.undang", "Mengirim ulang undangan"],
  ["POST", /auth\/login$/, "auth.masuk", "Masuk"],
  ["POST", /auth\/verify-email$/, "auth.verifikasi", "Memverifikasi email"],
  ["POST", /auth\/accept-invite$/, "anggota.terima", "Menerima undangan"],
  ["POST", /auth\/logout$/, "auth.keluar", "Keluar"],
];

const DECISIONS: Record<string, string> = { approved: "disetujui", rejected: "ditolak", revise: "minta revisi" };

const memberName = (db: MockDatabase, memberId: string) =>
  db.users.find((u) => u.id === db.memberships.find((m) => m.id === memberId)?.user_id)?.full_name;

/** Nama benda yang disebut di alamat atau kiriman; dibaca sebelum tindakan agar yang dihapus tetap bernama. */
export const auditTarget = (db: MockDatabase, pathname: string, body: unknown) => {
  const parts = pathname.split("/");
  for (const part of [...parts].reverse()) {
    const approval = db.approvals.find((a) => a.id === part);
    const found =
      db.agents.find((a) => a.id === part)?.name ??
      db.units.find((u) => u.id === part)?.name ??
      db.documents.find((d) => d.id === part)?.title ??
      db.tasks.find((t) => t.id === (approval?.task_id ?? part))?.title ??
      memberName(db, part);
    if (found) {
      const decision = approval && DECISIONS[String((body as { decision?: unknown } | null)?.decision)];
      return decision ? `${found} (${decision})` : found;
    }
  }
  const fields = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const named = fields.name ?? fields.title ?? fields.full_name;
  return typeof named === "string" ? named : "";
};

/** Catat tindakan yang berhasil. `userId` adalah pengguna yang masuk saat tindakan dilakukan. */
export const recordAudit = (db: MockDatabase, method: string, pathname: string, target: string, userId: string) => {
  const action = ACTIONS.find(([m, pattern]) => m === method && pattern.test(pathname));
  const user = db.users.find((u) => u.id === userId);
  const membership = db.memberships.find((m) => m.user_id === userId && m.status === "active");
  if (!action || !user || !membership) return;
  db.audit_logs.push({
    id: `audit-${Date.now().toString(36)}-${db.audit_logs.length}`,
    organization_id: membership.organization_id,
    action: action[2],
    label: action[3],
    target,
    actor_name: user.full_name,
    actor_email: user.email,
    ip: "127.0.0.1",
    request_id: "",
    created_at: new Date().toISOString(),
  });
};
