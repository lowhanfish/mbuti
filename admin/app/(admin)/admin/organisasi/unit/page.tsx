import type { Metadata } from "next";
import { ComingSoon } from "../../../_components/coming-soon";

export const metadata: Metadata = { title: "Unit / Divisi" };

export default function OrganisasiUnitPage() {
  return (
    <ComingSoon
      title="Unit / Divisi"
      stage="A1"
      icon="building"
      description="Kelompok role, bisa bertingkat, tampil sebagai ruangan di kantor 3D."
      items={["Daftar unit bertingkat", "Tambah, ubah, hapus unit", "Warna ruangan"]}
    />
  );
}
