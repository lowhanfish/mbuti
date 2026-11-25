import type { Metadata } from "next";
import { ComingSoon } from "../../_components/coming-soon";

export const metadata: Metadata = { title: "Persetujuan" };

export default function PersetujuanPage() {
  return (
    <ComingSoon
      title="Persetujuan"
      stage="A5"
      icon="approval"
      description="Keputusan manusia pada titik yang ditentukan di peta relasi."
      items={["Kotak masuk persetujuan", "Setujui, minta revisi, atau tolak dengan catatan"]}
    />
  );
}
