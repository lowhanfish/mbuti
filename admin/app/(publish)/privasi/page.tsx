import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../_legal/LegalPage";

export const metadata: Metadata = { title: "Kebijakan privasi" };

const SECTIONS: LegalSection[] = [
  {
    heading: "Data yang kami simpan",
    body: (
      <ul>
        <li>Akun: nama, email, kata sandi dalam bentuk hash (bukan aslinya), dan waktu masuk.</li>
        <li>Organisasi: profil, unit, anggota, role, dan peta relasi yang Anda buat.</li>
        <li>Dokumen yang diunggah beserta potongan teks dan vektor pencariannya.</li>
        <li>Tugas, hasil kerja, persetujuan, catatan biaya model, dan jejak audit (termasuk alamat IP).</li>
      </ul>
    ),
  },
  {
    heading: "Untuk apa data dipakai",
    body: (
      <p>
        Hanya untuk menjalankan MBUTI: masuk, menjalankan tugas, menampilkan riwayat, menjaga keamanan, dan mengirim
        email layanan (verifikasi, undangan, atur ulang kata sandi). Data tidak dijual dan tidak dipakai untuk iklan.
      </p>
    ),
  },
  {
    heading: "Model AI pihak ketiga",
    body: (
      <>
        <p>
          Untuk menjalankan role, potongan dokumen dan isi tugas dikirim ke Google Gemini. Selama uji coba, MBUTI
          memakai tingkat gratis Gemini. Menurut ketentuan Google, isi permintaan pada tingkat ini dapat dipakai Google
          untuk mengembangkan produknya.
        </p>
        <p>
          <strong className="text-ink">Karena itu, jangan unggah dokumen rahasia atau data pribadi warga selama uji coba.</strong>{" "}
          Pakai dokumen contoh atau dokumen yang memang sudah terbuka untuk umum.
        </p>
      </>
    ),
  },
  {
    heading: "Pemisahan antarorganisasi",
    body: <p>Data tiap organisasi dipisahkan. Anggota satu organisasi tidak dapat melihat data organisasi lain.</p>,
  },
  {
    heading: "Cookie",
    body: (
      <p>
        MBUTI hanya memakai cookie yang diperlukan agar Anda tetap masuk dan terlindung dari pemalsuan permintaan. Tidak
        ada cookie pelacak atau iklan.
      </p>
    ),
  },
  {
    heading: "Penyimpanan dan penghapusan",
    body: (
      <p>
        Data disimpan selama akun atau organisasi aktif, ditambah cadangan harian yang diputar ulang. Pemilik
        organisasi dapat meminta salinan atau penghapusan data. Fitur ekspor dan hapus mandiri sedang disiapkan;
        sementara itu, permintaan diproses oleh pengelola.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Kebijakan privasi"
      updated="26 November 2026"
      intro={<p>Halaman ini menjelaskan data apa yang disimpan MBUTI, untuk apa, dan ke mana data itu dikirim.</p>}
      sections={SECTIONS}
    />
  );
}
