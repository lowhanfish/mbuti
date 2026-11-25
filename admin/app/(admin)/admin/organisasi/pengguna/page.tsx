import type { Metadata } from "next";
import { ComingSoon } from "../../../_components/coming-soon";

export const metadata: Metadata = { title: "Pengguna" };

export default function OrganisasiPenggunaPage() {
  return (
    <ComingSoon
      title="Pengguna"
      stage="A1"
      icon="users"
      description="Manusia yang memakai MBUTI dan hak aksesnya."
      items={["Daftar pengguna", "Undang pengguna", "Atur hak akses: pemilik, admin, anggota, pemantau"]}
    />
  );
}
