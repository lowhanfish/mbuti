/**
 * Tugas contoh. Riwayatnya dihasilkan dengan menjalankan mesin simulasi pada waktu yang dimundurkan,
 * sehingga linimasa, biaya, dan persetujuan konsisten dengan aturan relasi.
 */
import { advanceTasks, cancelTask, createTask, decideApproval } from "./engine";
import { vendorPoster } from "./media";
import type { MockDatabase } from "./seed";

const ORG = "org-nusantara";
const MIN = 60_000;
const HOUR = 60 * MIN;

export const seedTasks = (db: MockDatabase) => {
  const now = Date.now();

  // 1. Menunggu persetujuan akhir Bayu setelah satu putaran revisi Rani ↔ Tegar
  createTask(
    db,
    {
      organization_id: ORG,
      title: "Undangan rapat koordinasi akhir tahun",
      brief: "Buatkan undangan rapat koordinasi akhir tahun untuk para kepala bidang.",
      inputs: {
        jenis_surat: "Undangan",
        tujuan: "Para Kepala Bidang",
        perihal: "Undangan Rapat Koordinasi Akhir Tahun",
        pokok_isi: "Rapat membahas evaluasi layanan 2026, Senin 1 Desember 2026 pukul 09.00 di ruang rapat utama.",
      },
      entry_agent_id: "agent-rani",
      priority: "high",
      due_at: new Date(now + 2 * 24 * HOUR).toISOString(),
      budget_limit: 15000,
      created_by_member_id: "member-rina",
    },
    now - 3 * HOUR
  );
  advanceTasks(db, now - 2 * HOUR);

  // 2. Laporan realisasi yang sudah disetujui Sari
  const laporan = createTask(
    db,
    {
      organization_id: ORG,
      title: "Ringkasan realisasi anggaran Oktober",
      brief: "Susun ringkasan realisasi anggaran bulan Oktober dan tandai penyerapan di bawah 50%.",
      inputs: { bulan: "Oktober 2026" },
      entry_agent_id: "agent-sekar",
      priority: "normal",
      due_at: null,
      budget_limit: 10000,
      created_by_member_id: "member-sari",
    },
    now - 26 * HOUR
  );
  advanceTasks(db, now - 25 * HOUR);
  const approval = db.approvals.find((a) => a.task_id === laporan.id && a.status === "pending");
  if (approval) decideApproval(db, approval, "approved", "Angka sudah sesuai, silakan dikirim.", "member-sari", now - 24 * HOUR);

  // 3. Pertanyaan warga yang dijawab langsung (eskalasi bersyarat tidak terpenuhi)
  createTask(
    db,
    {
      organization_id: ORG,
      title: "Syarat mengurus surat keterangan",
      brief: "Warga menanyakan syarat dan lama pengurusan surat keterangan.",
      inputs: { pertanyaan: "Apa saja syarat mengurus surat keterangan dan berapa lama selesainya?" },
      entry_agent_id: "agent-lumi",
      priority: "normal",
      due_at: null,
      budget_limit: 5000,
      created_by_member_id: "member-maya",
    },
    now - 5 * HOUR
  );
  advanceTasks(db, now - 4 * HOUR);

  // 4. Dihentikan oleh pembuatnya
  const edaran = createTask(
    db,
    {
      organization_id: ORG,
      title: "Edaran perubahan jam layanan",
      brief: "Buat edaran perubahan jam layanan selama libur akhir tahun.",
      inputs: { jenis_surat: "Edaran", tujuan: "Seluruh pegawai", perihal: "Perubahan Jam Layanan", pokok_isi: "Jam layanan 08.00–12.00 pada 29–31 Desember." },
      entry_agent_id: "agent-rani",
      priority: "low",
      due_at: null,
      budget_limit: 15000,
      created_by_member_id: "member-demo",
    },
    now - 8 * HOUR
  );
  advanceTasks(db, now - 8 * HOUR + 3000);
  cancelTask(db, edaran, "member-demo", now - 8 * HOUR + 4000);

  // 5. Berhenti karena batas biaya terlalu kecil
  createTask(
    db,
    {
      organization_id: ORG,
      title: "Rekap penyerapan triwulan III",
      brief: "Rekap penyerapan anggaran triwulan III per kegiatan.",
      inputs: { bulan: "Juli–September 2026" },
      entry_agent_id: "agent-sekar",
      priority: "normal",
      due_at: null,
      budget_limit: 300,
      created_by_member_id: "member-sari",
    },
    now - 30 * HOUR
  );
  advanceTasks(db, now - 29 * HOUR);

  // 7. Pemeriksaan poster vendor oleh Amir: membaca lampiran gambar dan menandai temuan (E1c)
  db.task_attachments.push({
    id: "att-poster-vendor",
    organization_id: ORG,
    task_id: null,
    file_name: "poster-hari-pelayanan.png",
    mime_type: "image/png",
    size_bytes: 684_000,
    width: 1080,
    height: 1350,
    pages: [vendorPoster],
    exif: null,
    uploaded_by_member_id: "member-demo",
    created_at: new Date(now - 5 * HOUR).toISOString(),
  });
  const poster = createTask(
    db,
    {
      organization_id: ORG,
      title: "Periksa poster Hari Pelayanan dari vendor",
      brief: "Amir, lihat poster ini. Apa yang kurang menurut panduan merek? Tandai bagiannya dan beri saran perbaikan.",
      inputs: { arahan_tugas: "Poster untuk media sosial dan cetak A3." },
      entry_agent_id: "agent-amir",
      priority: "normal",
      due_at: null,
      budget_limit: 10000,
      created_by_member_id: "member-demo",
      attachment_ids: ["att-poster-vendor"],
    },
    now - 5 * HOUR
  );
  db.task_attachments.find((a) => a.id === "att-poster-vendor")!.task_id = poster.id;
  advanceTasks(db, now - 4 * HOUR);

  // 8. Usulan temuan internet dari Lumi yang menunggu keputusan admin (E1d)
  db.knowledge_proposals.push({
    id: "usul-contoh-1",
    organization_id: ORG,
    url: "https://pustaka-terbuka.test/panduan/bahasa-pelayanan-yang-ramah",
    title: "Panduan umum: bahasa pelayanan yang ramah",
    excerpt: "Ringkasan praktik menjawab warga dengan kalimat pendek, salam pembuka, dan langkah lanjut yang jelas.",
    status: "pending",
    task_id: null,
    agent_id: "agent-lumi",
    proposed_by_member_id: "member-bayu",
    decided_by_member_id: null,
    decided_at: null,
    document_id: null,
    created_at: new Date(now - 6 * HOUR).toISOString(),
  });

  // 6. Baru dibuat: berjalan langsung saat aplikasi dibuka
  createTask(
    db,
    {
      organization_id: ORG,
      title: "Undangan sosialisasi layanan daring",
      brief: "Buatkan undangan sosialisasi layanan daring untuk para lurah.",
      inputs: {
        jenis_surat: "Undangan",
        tujuan: "Para Lurah",
        perihal: "Undangan Sosialisasi Layanan Daring",
        pokok_isi: "Sosialisasi tata cara layanan daring, Kamis 4 Desember 2026 pukul 13.00 di aula.",
      },
      entry_agent_id: "agent-rani",
      priority: "normal",
      due_at: null,
      budget_limit: 15000,
      created_by_member_id: "member-demo",
    },
    now
  );
};
