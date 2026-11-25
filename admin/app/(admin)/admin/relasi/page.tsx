import type { Metadata } from "next";
import { ComingSoon } from "../../_components/coming-soon";

export const metadata: Metadata = { title: "Peta Relasi" };

export default function RelasiPage() {
  return (
    <ComingSoon
      title="Peta Relasi"
      stage="A4"
      icon="flow"
      description="Garis hubungan antar-role: serahkan, periksa, konsultasi, eskalasi."
      items={["Editor node dan garis", "Panel aturan relasi", "Validasi lingkaran serah-terima", "Simpan posisi node"]}
    />
  );
}
