import type { Metadata } from "next";
import { ComingSoon } from "../../_components/coming-soon";

export const metadata: Metadata = { title: "Tugas" };

export default function TugasPage() {
  return (
    <ComingSoon
      title="Tugas"
      stage="A5"
      icon="task"
      description="Pekerjaan yang diberikan ke role atau unit, beserta linimasa dan hasilnya."
      items={["Buat tugas dengan pratinjau rute role", "Daftar tugas dengan filter status", "Detail tugas: linimasa, hasil, rujukan dokumen, biaya", "Simulasi eksekusi dengan data contoh"]}
    />
  );
}
