import {
  ACCEPTED_TYPES,
  IMAGE_TYPES,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  type DetailInterface,
  type DocumentScope,
  type DocumentSection,
  type DocumentCategory,
  type DocumentType,
  type IngestionStatus,
  type PolicyFields,
  type PolicyKind,
  type ResponseInterface,
  type VersionDetailInterface,
} from "@/app/(admin)/admin/pengetahuan/types";
import { UNIT_COLORS } from "@/app/(admin)/admin/organisasi/unit/types";
import { isFailure, newId, nowIso, requireManager, requireMember, text } from "../context";
import { documentsForAgent, liveDocuments, policyInForce, searchDocuments, toVersion, versionStatus } from "../knowledge";
import { placeholderPage, readImage } from "../media";
import { fail, ok, paging, type MockRoute } from "../router";
import type { MockDatabase, MockDocVersion, MockDocument } from "../seed";

const TYPES: DocumentType[] = ["sop", "manual", "pedoman", "templat", "regulasi", "uraian_jabatan", "lainnya"];
const SCOPES: DocumentScope[] = ["organization", "unit", "agent"];

const activeVersion = (db: MockDatabase, docId: string) => db.doc_versions.find((v) => v.document_id === docId && v.is_active) ?? null;

const scopeInfo = (db: MockDatabase, d: MockDocument) => {
  if (d.scope === "unit") {
    const unit = db.units.find((u) => u.id === d.scope_id);
    return { name: unit?.name ?? null, color: unit ? UNIT_COLORS[unit.color].hex : null };
  }
  if (d.scope === "agent") {
    const agent = db.agents.find((a) => a.id === d.scope_id);
    return { name: agent ? `${agent.name} · ${agent.title}` : null, color: agent?.avatar.shirt ?? null };
  }
  return { name: null, color: null };
};

const toItem = (db: MockDatabase, d: MockDocument): ResponseInterface => {
  const active = activeVersion(db, d.id);
  const scope = scopeInfo(db, d);
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    doc_type: d.doc_type,
    scope: d.scope,
    scope_id: d.scope_id,
    scope_name: scope.name,
    scope_color: scope.color,
    active_version: active ? toVersion(db, active) : null,
    version_count: db.doc_versions.filter((v) => v.document_id === d.id).length,
    category: d.category ?? "knowledge",
    policy: d.category === "policy" && d.policy ? { ...d.policy, in_force: policyInForce(d.policy) } : null,
    source_url: d.source_url ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
};

const toDetail = (db: MockDatabase, d: MockDocument): DetailInterface => {
  const active = activeVersion(db, d.id);
  return {
    ...toItem(db, d),
    versions: db.doc_versions
      .filter((v) => v.document_id === d.id)
      .sort((a, b) => b.version_no - a.version_no)
      .map((v) => toVersion(db, v)),
    // Halaman baru bisa dibaca setelah versi aktif selesai diolah
    sections: active && versionStatus(active).status === "ready" ? active.sections : [],
    archived_at: d.deleted_at ?? null,
  };
};

const toVersionDetail = (db: MockDatabase, v: MockDocVersion): VersionDetailInterface => ({
  ...toVersion(db, v),
  sections: versionStatus(v).status === "ready" ? v.sections : [],
});

/** Pernah menjadi rujukan hasil sebuah tugas, sehingga isinya harus tetap bisa dibuka. */
const isCited = (db: MockDatabase, documentId: string) => db.task_steps.some((s) => s.citations.some((c) => c.document_id === documentId));

/** Dokumen yang masih bisa diubah (belum dihapus). */
const findLive = (db: MockDatabase, orgId: string, id: string) => liveDocuments(db, orgId).find((d) => d.id === id);

const validateScope = (db: MockDatabase, orgId: string, scope: unknown, scopeId: unknown): string | { scope: DocumentScope; scope_id: string | null } => {
  if (!SCOPES.includes(scope as DocumentScope)) return "Lingkup dokumen tidak valid.";
  const s = scope as DocumentScope;
  if (s === "organization") return { scope: s, scope_id: null };
  const id = typeof scopeId === "string" ? scopeId : "";
  if (s === "unit" && !db.units.some((u) => u.id === id && u.organization_id === orgId)) return "Pilih unit pemilik dokumen.";
  if (s === "agent" && !db.agents.some((a) => a.id === id && a.organization_id === orgId)) return "Pilih role pemilik dokumen.";
  return { scope: s, scope_id: id };
};

const sha256Hex = async (buffer: ArrayBuffer) => {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** Pecah teks polos menjadi "halaman": per judul Markdown, atau per ±1.800 karakter. */
const textToSections = (raw: string): DocumentSection[] => {
  const textBody = raw.replace(/\r\n/g, "\n").trim();
  if (!textBody) return [];
  const byHeading = textBody.split(/\n(?=#{1,3}\s)/);
  const chunks = byHeading.length > 1 ? byHeading : textBody.match(/[\s\S]{1,1800}(?=\s|$)/g) ?? [textBody];
  return chunks.map((chunk, i) => {
    const lines = chunk.trim().split("\n");
    const headingLine = lines[0].replace(/^#{1,3}\s*/, "").trim();
    const hasHeading = /^#{1,3}\s/.test(lines[0]);
    return {
      page_no: i + 1,
      heading: hasHeading ? headingLine.slice(0, 120) : `Bagian ${i + 1}`,
      text: (hasHeading ? lines.slice(1).join("\n") : chunk).trim(),
    };
  });
};

/** Baca berkas unggahan menjadi versi dokumen (simulasi olah). */
const readUpload = async (db: MockDatabase, file: File, documentId: string, versionNo: number, memberId: string): Promise<MockDocVersion | string> => {
  const mime = file.type || (file.name.endsWith(".md") ? "text/markdown" : "");
  if (!ACCEPTED_TYPES[mime] && !/\.(pdf|docx|txt|md|png|jpe?g|webp)$/i.test(file.name)) {
    return "Jenis berkas belum didukung. Gunakan PDF, DOCX, TXT, MD, atau gambar PNG, JPG, WEBP.";
  }
  const isImage = IMAGE_TYPES.includes(mime);
  if (isImage && file.size > MAX_IMAGE_BYTES) return "Ukuran gambar melebihi 10 MB.";
  if (file.size > MAX_FILE_BYTES) return "Ukuran berkas melebihi 20 MB.";
  if (file.size === 0) return "Berkas kosong.";
  const buffer = await file.arrayBuffer();
  const sha = await sha256Hex(buffer);
  if (db.doc_versions.some((v) => v.document_id === documentId && v.sha256 === sha)) {
    return "Berkas ini sama persis dengan versi yang sudah ada.";
  }

  let sections: DocumentSection[];
  let failReason: string | null = null;
  if (isImage) {
    // Satu gambar = satu bagian; backend memperkecil sampai 2048 px, membuat embedding multimodal, dan menyimpan EXIF
    try {
      const image = await readImage(file);
      sections = [
        {
          page_no: 1,
          heading: file.name.replace(/\.[^.]+$/, ""),
          text: `Gambar ${image.width}×${image.height} piksel. Isinya dibaca Gemini saat dipakai tugas.`,
          render: "visual",
          image_url: image.url,
        },
      ];
    } catch {
      sections = [];
      failReason = "Gambar tidak bisa dibaca.";
    }
  } else if (/\.(txt|md)$/i.test(file.name) || mime.startsWith("text/")) {
    sections = textToSections(new TextDecoder().decode(buffer));
    if (!sections.length) failReason = "Berkas tidak berisi teks.";
  } else {
    // Data contoh tidak bisa membaca isi PDF/DOCX; backend (tahap B3) yang mengekstrak teksnya
    const pages = Math.min(40, Math.max(1, Math.round(file.size / 90_000)));
    // Simulasi pemilahan halaman: sebagian halaman PDF dianggap bergambar (tabel, grafik, hasil scan)
    const isPdf = /\.pdf$/i.test(file.name) || mime === "application/pdf";
    sections = Array.from({ length: pages }, (_, i): DocumentSection => {
      const visual = isPdf && i % 3 === 1;
      return {
        page_no: i + 1,
        heading: `Halaman ${i + 1}`,
        text: visual
          ? "Halaman bergambar. Backend membuat embedding gambarnya dan membacanya dengan Gemini saat dipakai tugas."
          : "Isi halaman ini akan dibaca oleh backend pada tahap B3. Di mode data contoh, hanya berkas TXT dan MD yang isinya bisa dibaca langsung di peramban.",
        render: visual ? "visual" : "text",
        image_url: visual ? placeholderPage(file.name, i + 1) : null,
      };
    });
  }

  return {
    id: newId("ver"),
    document_id: documentId,
    version_no: versionNo,
    file_name: file.name.slice(0, 200),
    mime_type: mime || "application/octet-stream",
    size_bytes: file.size,
    sha256: sha,
    is_active: true,
    processing_started_at: nowIso(),
    media_kind: isImage ? "image" : mime === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : "text",
    fail_reason: failReason,
    uploaded_by_member_id: memberId,
    sections,
    created_at: nowIso(),
  };
};

const formValue = (body: unknown, key: string) => (body instanceof FormData ? body.get(key) : null);

const POLICY_KINDS: PolicyKind[] = ["peraturan", "kebijakan", "standar_mutu", "panduan_merek", "lainnya"];
const CATEGORIES: DocumentCategory[] = ["knowledge", "policy", "formation", "qa", "web"];
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Keterangan kebijakan dari isian; galat berupa teks. */
const cleanPolicy = (raw: Partial<Record<keyof PolicyFields, unknown>>): PolicyFields | string => {
  const from = isDate(raw.effective_from) ? (raw.effective_from as string) : null;
  const until = isDate(raw.effective_until) ? (raw.effective_until as string) : null;
  if (from && until && until < from) return "Tanggal akhir berlaku tidak boleh sebelum tanggal mulai.";
  return {
    kind: POLICY_KINDS.includes(raw.kind as PolicyKind) ? (raw.kind as PolicyKind) : "lainnya",
    reference_no: text(raw.reference_no, 100),
    issuer: text(raw.issuer, 150),
    effective_from: from,
    effective_until: until,
    status: raw.status === "dicabut" ? "dicabut" : "berlaku",
  };
};

const BASE = "/api/v1/admin/pengetahuan";

export const pengetahuanRoutes: MockRoute[] = [
  {
    method: "GET",
    path: `${BASE}/read`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const search = (ctx.query.get("search") ?? "").trim().toLowerCase();
      const scope = ctx.query.get("scope") ?? "";
      const scopeId = ctx.query.get("scope_id") ?? "";
      const docType = ctx.query.get("doc_type") ?? "";
      const status = ctx.query.get("status") ?? "";
      const agentId = ctx.query.get("agent_id") ?? "";
      // Satu atau beberapa kategori dipisah koma, mis. "policy" atau "knowledge,formation,qa,web"
      const categories = (ctx.query.get("category") ?? "").split(",").filter((c): c is DocumentCategory => CATEGORIES.includes(c as DocumentCategory));
      const { skip, limit } = paging(ctx.query, 50);

      let docs = liveDocuments(ctx.db, self.organization_id);
      if (agentId) {
        const agent = ctx.db.agents.find((a) => a.id === agentId && a.organization_id === self.organization_id);
        if (!agent) return fail(404, "Role tidak ditemukan.");
        docs = documentsForAgent(ctx.db, agent);
      }
      if (categories.length) docs = docs.filter((d) => categories.includes(d.category ?? "knowledge"));
      const all = docs.map((d) => toItem(ctx.db, d));
      const summary: Record<IngestionStatus, number> = { queued: 0, processing: 0, ready: 0, failed: 0 };
      for (const d of all) if (d.active_version) summary[d.active_version.status] += 1;

      const filtered = all
        .filter((d) => !search || `${d.title} ${d.description} ${d.active_version?.file_name ?? ""}`.toLowerCase().includes(search))
        .filter((d) => !scope || d.scope === scope)
        .filter((d) => !scopeId || d.scope_id === scopeId)
        .filter((d) => !docType || d.doc_type === docType)
        .filter((d) => !status || d.active_version?.status === status)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return {
        status: 200,
        body: { success: true, statusCode: 200, total: filtered.length, skip, limit, data: filtered.slice(skip, skip + limit), summary },
      };
    },
  },
  {
    method: "GET",
    path: `${BASE}/search`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const q = text(ctx.query.get("q"), 300);
      const agentId = ctx.query.get("agent_id") ?? "";
      let docs = liveDocuments(ctx.db, self.organization_id);
      if (agentId) {
        const agent = ctx.db.agents.find((a) => a.id === agentId && a.organization_id === self.organization_id);
        if (!agent) return fail(404, "Role tidak ditemukan.");
        docs = documentsForAgent(ctx.db, agent);
      }
      return ok(searchDocuments(ctx.db, docs, q, 8));
    },
  },
  {
    method: "GET",
    path: `${BASE}/:id`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const d = ctx.db.documents.find((x) => x.id === ctx.params.id && x.organization_id === self.organization_id);
      return d ? ok(toDetail(ctx.db, d)) : fail(404, "Dokumen tidak ditemukan.");
    },
  },
  {
    method: "GET",
    path: `${BASE}/:id/versions/:vid`,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      // Termasuk dokumen yang sudah dihapus, agar rujukan lama tetap bisa dibuka
      const d = ctx.db.documents.find((x) => x.id === ctx.params.id && x.organization_id === self.organization_id);
      const v = d && ctx.db.doc_versions.find((x) => x.id === ctx.params.vid && x.document_id === d.id);
      return v ? ok(toVersionDetail(ctx.db, v)) : fail(404, "Versi tidak ditemukan.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/create`,
    handler: async (ctx) => {
      // Penanggung jawab role boleh mengunggah uraian jabatan role itu sendiri (pembentukan role)
      const member = requireMember(ctx);
      if (isFailure(member)) return member;
      const formationUpload =
        formValue(ctx.body, "doc_type") === "uraian_jabatan" &&
        formValue(ctx.body, "scope") === "agent" &&
        ctx.db.agents.some((a) => a.id === formValue(ctx.body, "scope_id") && a.owner_member_id === member.id);
      const self = formationUpload && member.access_role !== "viewer" ? member : requireManager(ctx);
      if (isFailure(self)) return self;
      const file = formValue(ctx.body, "file");
      if (!(file instanceof File)) return fail(422, "Pilih berkas yang akan diunggah.");
      const scope = validateScope(ctx.db, self.organization_id, formValue(ctx.body, "scope"), formValue(ctx.body, "scope_id"));
      if (typeof scope === "string") return fail(422, scope);
      const title = text(formValue(ctx.body, "title"), 200) || file.name.replace(/\.[^.]+$/, "");
      const docType = formValue(ctx.body, "doc_type");
      const isPolicy = formValue(ctx.body, "category") === "policy";
      const policy = isPolicy
        ? cleanPolicy({
            kind: formValue(ctx.body, "policy_kind"),
            reference_no: formValue(ctx.body, "reference_no"),
            issuer: formValue(ctx.body, "issuer"),
            effective_from: formValue(ctx.body, "effective_from"),
            effective_until: formValue(ctx.body, "effective_until"),
            status: "berlaku",
          })
        : undefined;
      if (typeof policy === "string") return fail(422, policy);

      const docItem: MockDocument = {
        id: newId("doc"),
        organization_id: self.organization_id,
        title,
        description: text(formValue(ctx.body, "description"), 1000),
        doc_type: TYPES.includes(docType as DocumentType) ? (docType as DocumentType) : "lainnya",
        category: docType === "uraian_jabatan" ? "formation" : isPolicy ? "policy" : "knowledge",
        ...(policy ? { policy } : {}),
        ...scope,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      const ver = await readUpload(ctx.db, file, docItem.id, 1, self.id);
      if (typeof ver === "string") return fail(422, ver);
      ctx.db.documents.push(docItem);
      ctx.db.doc_versions.push(ver);
      return ok(toItem(ctx.db, docItem), "Dokumen diterima dan sedang diolah.", 201);
    },
  },
  {
    method: "PUT",
    path: `${BASE}/update/:id`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const d = findLive(ctx.db, self.organization_id, ctx.params.id);
      if (!d) return fail(404, "Dokumen tidak ditemukan.");
      if (d.category === "qa") return fail(409, "Hasil tanya jawab disusun sistem dan tidak bisa diubah. Ubah lewat pembentukan role.");
      const b = (ctx.body ?? {}) as Record<string, unknown>;
      const title = text(b.title, 200);
      if (title.length < 3) return fail(422, "Judul minimal 3 karakter.");
      const scope = validateScope(ctx.db, self.organization_id, b.scope, b.scope_id);
      if (typeof scope === "string") return fail(422, scope);
      if (d.category === "policy" && b.policy && typeof b.policy === "object") {
        const policy = cleanPolicy(b.policy as Record<string, unknown>);
        if (typeof policy === "string") return fail(422, policy);
        d.policy = policy;
      }
      Object.assign(d, {
        title,
        description: text(b.description, 1000),
        doc_type: TYPES.includes(b.doc_type as DocumentType) ? b.doc_type : d.doc_type,
        ...scope,
        updated_at: nowIso(),
      });
      return ok(toDetail(ctx.db, d), "Dokumen diperbarui.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/:id/versions`,
    handler: async (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const d = findLive(ctx.db, self.organization_id, ctx.params.id);
      if (!d) return fail(404, "Dokumen tidak ditemukan.");
      if (d.category === "qa") return fail(409, "Hasil tanya jawab disusun sistem dan tidak bisa diganti.");
      const file = formValue(ctx.body, "file");
      if (!(file instanceof File)) return fail(422, "Pilih berkas versi baru.");
      const versions = ctx.db.doc_versions.filter((v) => v.document_id === d.id);
      const ver = await readUpload(ctx.db, file, d.id, Math.max(0, ...versions.map((v) => v.version_no)) + 1, self.id);
      if (typeof ver === "string") return fail(422, ver);
      // Selama versi aktif masih bisa dipakai, versi baru menunggu sampai selesai diolah
      const current = versions.find((v) => v.is_active);
      if (current && versionStatus(current).status === "ready") {
        ver.is_active = false;
        ver.activate_when_ready = true;
      } else {
        for (const v of versions) v.is_active = false;
      }
      ctx.db.doc_versions.push(ver);
      d.updated_at = nowIso();
      return ok(toDetail(ctx.db, d), `Versi ${ver.version_no} diterima dan sedang diolah.`, 201);
    },
  },
  {
    method: "PUT",
    path: `${BASE}/:id/versions/:vid/activate`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const d = findLive(ctx.db, self.organization_id, ctx.params.id);
      if (!d) return fail(404, "Dokumen tidak ditemukan.");
      const target = ctx.db.doc_versions.find((v) => v.id === ctx.params.vid && v.document_id === d.id);
      if (!target) return fail(404, "Versi tidak ditemukan.");
      if (versionStatus(target).status !== "ready") return fail(409, "Hanya versi yang sudah siap yang bisa diaktifkan.");
      for (const v of ctx.db.doc_versions) if (v.document_id === d.id) v.is_active = v.id === target.id;
      d.updated_at = nowIso();
      return ok(toDetail(ctx.db, d), `Versi ${target.version_no} sekarang aktif.`);
    },
  },
  {
    method: "DELETE",
    path: `${BASE}/delete/:id`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const d = findLive(ctx.db, self.organization_id, ctx.params.id);
      if (!d) return fail(404, "Dokumen tidak ditemukan.");
      if (d.category === "qa") return fail(409, "Hasil tanya jawab disusun sistem dan tidak bisa dihapus. Ubah lewat pembentukan role.");
      if (isCited(ctx.db, d.id)) {
        d.deleted_at = nowIso();
        return ok(null, "Dokumen dihapus. Isinya tetap bisa dibuka dari rujukan tugas.");
      }
      ctx.db.documents = ctx.db.documents.filter((x) => x.id !== d.id);
      ctx.db.doc_versions = ctx.db.doc_versions.filter((v) => v.document_id !== d.id);
      return ok(null, "Dokumen dihapus.");
    },
  },
];
