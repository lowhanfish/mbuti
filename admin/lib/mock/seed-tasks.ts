/**
 * Tugas contoh. Riwayatnya dihasilkan dengan menjalankan mesin simulasi pada waktu yang dimundurkan,
 * sehingga linimasa, biaya, dan persetujuan konsisten dengan aturan relasi.
 */
import { advanceTasks, cancelTask, createTask, decideApproval } from "./engine";
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
