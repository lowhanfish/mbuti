import type { Metadata } from "next";
import { ComingSoon } from "../../_components/coming-soon";

export const metadata: Metadata = { title: "Kantor" };

export default function KantorPage() {
  return (
    <ComingSoon
      title="Kantor"
      stage="A6"
      icon="office"
      description="Tampilan 3D kantor: setiap unit menjadi ruangan, setiap role menjadi karakter blok."
      items={["Ruangan per unit dengan papan nama", "Karakter blok buatan sendiri dengan animasi sesuai status kerja", "Panel unit dengan tombol Tugaskan divisi ini", "Tampilan daftar 2D untuk perangkat ringan"]}
    />
  );
}
