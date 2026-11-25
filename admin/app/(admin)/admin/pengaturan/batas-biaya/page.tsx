import type { Metadata } from "next";
import { ComingSoon } from "../../../_components/coming-soon";

export const metadata: Metadata = { title: "Batas Biaya" };

export default function PengaturanBatasBiayaPage() {
  return (
    <ComingSoon
      title="Batas Biaya"
      stage="A7"
      icon="wallet"
      description="Pengaman biaya per tugas dan per bulan."
      items={["Batas biaya bulanan organisasi", "Batas bawaan per tugas", "Batas langkah dan revisi"]}
    />
  );
}
