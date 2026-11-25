import type { Metadata } from "next";
import { ComingSoon } from "../../../_components/coming-soon";

export const metadata: Metadata = { title: "Model AI" };

export default function PengaturanModelAiPage() {
  return (
    <ComingSoon
      title="Model AI"
      stage="A7"
      icon="cpu"
      description="Pilihan model Gemini untuk profil cepat, seimbang, dan teliti."
      items={["Profil model", "Status kunci API"]}
    />
  );
}
