import type { Metadata } from "next";
import { ComingSoon } from "../../../_components/coming-soon";

export const metadata: Metadata = { title: "Profil Organisasi" };

export default function OrganisasiProfilPage() {
  return (
    <ComingSoon
      title="Profil Organisasi"
      stage="A1"
      icon="building"
      description="Identitas organisasi yang memakai MBUTI."
      items={["Nama, deskripsi, logo, zona waktu"]}
    />
  );
}
