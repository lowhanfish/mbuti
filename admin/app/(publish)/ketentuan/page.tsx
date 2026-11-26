import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../_legal/LegalPage";

export const metadata: Metadata = { title: "Ketentuan layanan" };

const SECTIONS: LegalSection[] = [
  {
    heading: "Status layanan",
    body: (
      <p>
        MBUTI masih dalam masa uji coba. Fitur, batas pemakaian, dan ketentuan ini dapat berubah, dan layanan bisa
        terhenti sementara tanpa pemberitahuan. Belum ada jaminan ketersediaan atau ganti rugi. Jangan menjadikan MBUTI
        satu-satunya tempat menyimpan dokumen penting.
      </p>
    ),
  },
  {
    heading: "Akun dan organisasi",
    body: (
      <ul>
        <li>Pendaftar menjadi pemilik organisasi dan bertanggung jawab atas anggota yang ia undang.</li>
        <li>Isi data dengan benar dan jaga kerahasiaan kata sandi. Satu akun untuk satu orang.</li>
        <li>Selama uji coba, organisasi baru ditinjau dulu sebelum bisa dipakai, dan permintaan bisa ditolak.</li>
      </ul>
    ),
  },
  {
    heading: "Dokumen dan hasil kerja",
    body: (
      <>
        <p>
          Dokumen yang Anda unggah tetap milik organisasi Anda. MBUTI hanya memprosesnya untuk menjalankan layanan:
          membaca, memotong, mencari, dan mengirim potongan yang relevan ke model AI.
        </p>
        <p>
          Hasil role AI bisa keliru. Periksa hasilnya sebelum dipakai, terutama untuk keputusan resmi. Titik
          persetujuan manusia ada untuk itu.
        </p>
      </>
    ),
  },
  {
    heading: "Pemakaian yang wajar",
    body: (
      <ul>
        <li>Jangan memakai MBUTI untuk hal yang melanggar hukum atau hak orang lain.</li>
        <li>Jangan mencoba membobol, membebani, atau mengakses data organisasi lain.</li>
        <li>Selama uji coba, model AI memakai kuota bersama. Kuota per organisasi dapat dibatasi.</li>
      </ul>
    ),
  },
  {
    heading: "Penangguhan dan penghentian",
    body: (
      <p>
        Pengelola dapat menangguhkan organisasi yang melanggar ketentuan ini atau membahayakan layanan. Anda dapat
        meminta akun dan data organisasi dihapus kapan saja.
      </p>
    ),
  },
  {
    heading: "Harga",
    body: (
      <p>
        Selama uji coba MBUTI tidak berbayar. Harga di halaman depan masih rencana. Bila nanti berlaku, harga
        diumumkan lebih dulu dan tidak ditagihkan tanpa persetujuan Anda.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Ketentuan layanan"
      updated="26 November 2026"
      intro={
        <p>
          Dengan mendaftar atau memakai MBUTI, Anda menyetujui ketentuan berikut. Ini versi sementara untuk masa uji
          coba; versi final menyusul sebelum pendaftaran dibuka untuk umum.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
