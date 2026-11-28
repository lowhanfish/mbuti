/**
 * Data contoh pembentukan role (E1a): versi 1 untuk role yang sudah ada, dan satu role baru (Amir) yang
 * sedang dalam sesi tanya jawab. Isinya fiktif.
 */
import { advanceFormations, finalize, newRevision, seedRevisions, writeQaDocument } from "./formation";
import { approvedPoster } from "./media";
import type { MockDatabase } from "./seed";

const ORG = "org-nusantara";
const T0 = "2026-11-25T08:00:00Z";
const T1 = "2026-11-26T09:30:00Z";
const T2 = "2026-11-27T08:15:00Z";
const iso = (ms: number) => new Date(ms).toISOString();

const UraianDesainer = [
  {
    page_no: 1,
    heading: "Uraian Jabatan: Desainer Grafis",
    text: [
      "Unit kerja: Bidang Data & Informasi.",
      "Ikhtisar: merancang materi visual publikasi organisasi agar informasi mudah dipahami masyarakat.",
      "Tugas pokok:",
      "1. Merancang infografis bulanan dari data statistik yang sudah disetujui.",
      "2. Mendesain poster dan banner kegiatan sesuai panduan merek organisasi.",
      "3. Memeriksa desain dari pihak luar terhadap panduan merek sebelum dipublikasikan.",
      "4. Menyiapkan berkas siap cetak dan berkas untuk media sosial.",
    ].join("\n"),
  },
  {
    page_no: 2,
    heading: "Hasil kerja dan hubungan kerja",
    text: [
      "Hasil kerja: infografis, poster, banner, dan catatan pemeriksaan desain.",
      "Hubungan kerja: menerima data dari Analis Statistik, menyerahkan rancangan ke Kepala Bidang untuk disetujui.",
      "Alat kerja: aplikasi desain grafis, pengolah kata, dan spreadsheet untuk membaca data.",
    ].join("\n"),
  },
];

export const seedFormation = (db: MockDatabase) => {
  // Versi 1 untuk role lama dibuat sebelum Amir ditambahkan: Amir belum pernah Final
  seedRevisions(db, T0);
  db.agents.push({
    id: "agent-amir",
    organization_id: ORG,
    name: "Amir",
    title: "Desainer Grafis",
    unit_id: "unit-data",
    goal: "",
    status: "draft",
    instructions: "",
    input_spec: [],
    output_format: "text",
    output_template: "",
    acceptance_criteria: [],
    knowledge_scope: "unit",
    model_profile: "balanced",
    owner_member_id: "member-demo",
    avatar: { skin: "#c68863", hair: "#3b2a1f", hair_style: "cap", shirt: "#f59e0b", pants: "#1e293b", accessory: "glasses" },
    web_search: false,
    compose_mode: "data",
    active_revision_id: null,
    created_at: T1,
    updated_at: T1,
  });

  db.documents.push({
    id: "doc-uraian-amir",
    organization_id: ORG,
    title: "Uraian Jabatan Desainer Grafis",
    description: "Bahan pembentukan role Amir.",
    doc_type: "uraian_jabatan",
    category: "formation",
    scope: "agent",
    scope_id: "agent-amir",
    created_at: T1,
    updated_at: T1,
  });
  db.doc_versions.push({
    id: "doc-uraian-amir-v1",
    document_id: "doc-uraian-amir",
    version_no: 1,
    file_name: "uraian-jabatan-desainer-grafis.docx",
    mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: 48_200,
    sha256: "contoh-doc-uraian-amir-1",
    is_active: true,
    processing_started_at: T1,
    fail_reason: null,
    uploaded_by_member_id: "member-demo",
    sections: UraianDesainer,
    created_at: T1,
  });

  const amir = db.agents.find((a) => a.id === "agent-amir")!;

  // Versi 1: pembentukan lengkap sampai Final
  const v1 = newRevision(db, amir, { source: "formation", status: "analyzing", memberId: "member-demo", at: T1 });
  v1.id = "rev-agent-amir-1";
  v1.materials = {
    description:
      "Amir mewakili Pak Dimas di bagian publikasi. Ia merancang infografis dan poster, serta memeriksa desain kiriman vendor terhadap panduan merek. Hasil desain langsung kirim ke admin media sosial.",
    tools: ["Canva", "Ms Word", "Excel"],
    represented: "Dimas Saputra, Pranata Humas",
    owner_member_id: "member-demo",
  };
  const start = Date.parse(T1) + 60_000;
  v1.pending = { kind: "analysis", until: start };
  advanceFormations(db, start);
  const answers: Record<string, string> = {
    "Mana yang dipakai": "Tetap disetujui Kepala Bidang dulu, sesuai kebijakan persetujuan naskah keluar.",
    "dikirim ke siapa": "Ke admin media sosial: PNG 1080×1350 untuk unggahan dan PDF siap cetak.",
    "Seberapa sering": "Infografis sebulan sekali, paling lambat tanggal 5. Poster sesuai jadwal kegiatan.",
  };
  for (const q of v1.messages.filter((m) => m.kind === "question")) {
    const key = Object.keys(answers).find((k) => q.text.includes(k));
    if (!key) continue;
    v1.messages.push({ id: `${q.id}-a`, round_no: 1, author: "member", kind: "answer", question_id: q.id, required: q.required, text: answers[key], skipped: false, author_name: "Pengguna Demo", created_at: iso(start + 10 * 60_000) });
  }
  v1.pending = { kind: "round", until: start + 11 * 60_000, finish: true };
  advanceFormations(db, start + 11 * 60_000);
  const finalAt = iso(start + 15 * 60_000);
  v1.snapshot.acceptance_criteria = [
    "Logo, warna, dan huruf sesuai panduan merek",
    "Teks isi minimal 24 pt dengan kontras cukup",
    "Angka mencantumkan sumber dan periode data",
    "Memuat alamat situs resmi",
  ];
  finalize(db, amir, v1, "member-demo", "Versi pertama dari uraian jabatan dan tanya jawab.", finalAt);
  amir.status = "active";
  writeQaDocument(db, amir, v1, finalAt);

  // Versi 2: revisi yang sedang disusun (menambah Figma); versi 1 tetap bekerja
  const v2 = newRevision(db, amir, { source: "formation", status: "analyzing", base: v1, memberId: "member-demo", at: T2 });
  v2.id = "rev-agent-amir-2";
  v2.materials = { ...v1.materials, tools: [...v1.materials.tools, "Figma"], description: `${v1.materials.description.replace(" Hasil desain langsung kirim ke admin media sosial.", "")} Mulai bulan depan juga menyiapkan rancangan antarmuka situs di Figma.` };
  v2.pending = { kind: "analysis", until: Date.parse(T2) };
  advanceFormations(db, Date.parse(T2));

  // Contoh poster yang sudah disetujui, sebagai pengetahuan bergambar Amir
  db.documents.push({
    id: "doc-poster-contoh",
    organization_id: ORG,
    title: "Contoh poster yang disetujui",
    description: "Poster Layanan Data Terbuka yang lolos pemeriksaan panduan merek.",
    doc_type: "templat",
    category: "knowledge",
    scope: "agent",
    scope_id: "agent-amir",
    created_at: T1,
    updated_at: T1,
  });
  db.doc_versions.push({
    id: "doc-poster-contoh-v1",
    document_id: "doc-poster-contoh",
    version_no: 1,
    file_name: "poster-data-terbuka.png",
    mime_type: "image/png",
    size_bytes: 412_000,
    sha256: "contoh-doc-poster-contoh-1",
    is_active: true,
    media_kind: "image",
    processing_started_at: T1,
    fail_reason: null,
    uploaded_by_member_id: "member-demo",
    sections: [
      {
        page_no: 1,
        heading: "Poster Layanan Data Terbuka",
        text: "Poster contoh: logo dan nama organisasi di kiri atas, judul besar, sumber data, dan alamat situs resmi di bagian bawah.",
        render: "visual",
        image_url: approvedPoster,
      },
    ],
    created_at: T1,
  });
};
