import type { Metadata } from "next";
import { ComingSoon } from "../../_components/coming-soon";

export const metadata: Metadata = { title: "Role" };

export default function RolePage() {
  return (
    <ComingSoon
      title="Role"
      stage="A2"
      icon="agent"
      description="Karyawan AI: tujuan, instruksi, dokumen, dan format hasil kerja."
      items={["Daftar role per unit", "Form tambah dan ubah role", "Detail role dengan enam tab", "Editor avatar dengan pratinjau karakter"]}
    />
  );
}
