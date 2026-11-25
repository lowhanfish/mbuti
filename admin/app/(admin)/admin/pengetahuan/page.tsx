import type { Metadata } from "next";
import { ComingSoon } from "../../_components/coming-soon";

export const metadata: Metadata = { title: "Pengetahuan" };

export default function PengetahuanPage() {
  return (
    <ComingSoon
      title="Pengetahuan"
      stage="A3"
      icon="book"
      description="SOP, manual book, dan panduan kerja yang menjadi dasar kerja role."
      items={["Unggah dokumen dengan status olah", "Lingkup dokumen: role, unit, atau organisasi", "Versi dokumen", "Pratinjau rujukan halaman"]}
    />
  );
}
