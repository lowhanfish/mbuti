import {
  ACCEPTED_TYPES,
  MAX_FILE_BYTES,
  type DetailInterface,
  type DocumentScope,
  type DocumentSection,
  type DocumentType,
  type IngestionStatus,
  type ResponseInterface,
} from "@/app/(admin)/admin/pengetahuan/types";
import { UNIT_COLORS } from "@/app/(admin)/admin/organisasi/unit/types";
import { isFailure, newId, nowIso, requireManager, requireMember, text } from "../context";
import { documentsForAgent, searchDocuments, toVersion, versionStatus } from "../knowledge";
import { fail, ok, type MockRoute } from "../router";
import type { MockDatabase, MockDocVersion, MockDocument } from "../seed";

const TYPES: DocumentType[] = ["sop", "manual", "pedoman", "templat", "regulasi", "lainnya"];
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
  };
};

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
  if (!ACCEPTED_TYPES[mime] && !/\.(pdf|docx|txt|md)$/i.test(file.name)) {
    return "Jenis berkas belum didukung. Gunakan PDF berteks, DOCX, TXT, atau MD.";
  }
  if (file.size > MAX_FILE_BYTES) return "Ukuran berkas melebihi 20 MB.";
  if (file.size === 0) return "Berkas kosong.";
  const buffer = await file.arrayBuffer();
  const sha = await sha256Hex(buffer);
  if (db.doc_versions.some((v) => v.document_id === documentId && v.sha256 === sha)) {
    return "Berkas ini sama persis dengan versi yang sudah ada.";
  }

  let sections: DocumentSection[];
  let failReason: string | null = null;
  if (/\.(txt|md)$/i.test(file.name) || mime.startsWith("text/")) {
    sections = textToSections(new TextDecoder().decode(buffer));
    if (!sections.length) failReason = "Berkas tidak berisi teks.";
  } else {
    // Data contoh tidak bisa membaca isi PDF/DOCX; backend (tahap B3) yang mengekstrak teksnya
    const pages = Math.min(40, Math.max(1, Math.round(file.size / 90_000)));
    sections = Array.from({ length: pages }, (_, i) => ({
      page_no: i + 1,
      heading: `Halaman ${i + 1}`,
      text: "Isi halaman ini akan dibaca oleh backend pada tahap B3. Di mode data contoh, hanya berkas TXT dan MD yang isinya bisa dibaca langsung di peramban.",
    }));
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
    fail_reason: failReason,
    uploaded_by_member_id: memberId,
    sections,
    created_at: nowIso(),
  };
};

const formValue = (body: unknown, key: string) => (body instanceof FormData ? body.get(key) : null);

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
      const skip = Number(ctx.query.get("skip") ?? 0);
      const limit = Number(ctx.query.get("limit") ?? 50);

      let docs = ctx.db.documents.filter((d) => d.organization_id === self.organization_id);
      if (agentId) {
        const agent = ctx.db.agents.find((a) => a.id === agentId && a.organization_id === self.organization_id);
        if (!agent) return fail(404, "Role tidak ditemukan.");
        docs = documentsForAgent(ctx.db, agent);
      }
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
      let docs = ctx.db.documents.filter((d) => d.organization_id === self.organization_id);
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
    method: "POST",
    path: `${BASE}/create`,
    handler: async (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const file = formValue(ctx.body, "file");
      if (!(file instanceof File)) return fail(422, "Pilih berkas yang akan diunggah.");
      const scope = validateScope(ctx.db, self.organization_id, formValue(ctx.body, "scope"), formValue(ctx.body, "scope_id"));
      if (typeof scope === "string") return fail(422, scope);
      const title = text(formValue(ctx.body, "title"), 200) || file.name.replace(/\.[^.]+$/, "");
      const docType = formValue(ctx.body, "doc_type");

      const docItem: MockDocument = {
        id: newId("doc"),
        organization_id: self.organization_id,
        title,
        description: text(formValue(ctx.body, "description"), 1000),
        doc_type: TYPES.includes(docType as DocumentType) ? (docType as DocumentType) : "lainnya",
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
      const d = ctx.db.documents.find((x) => x.id === ctx.params.id && x.organization_id === self.organization_id);
      if (!d) return fail(404, "Dokumen tidak ditemukan.");
      const b = (ctx.body ?? {}) as Record<string, unknown>;
      const title = text(b.title, 200);
      if (title.length < 3) return fail(422, "Judul minimal 3 karakter.");
      const scope = validateScope(ctx.db, self.organization_id, b.scope, b.scope_id);
      if (typeof scope === "string") return fail(422, scope);
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
      const d = ctx.db.documents.find((x) => x.id === ctx.params.id && x.organization_id === self.organization_id);
      if (!d) return fail(404, "Dokumen tidak ditemukan.");
      const file = formValue(ctx.body, "file");
      if (!(file instanceof File)) return fail(422, "Pilih berkas versi baru.");
      const versions = ctx.db.doc_versions.filter((v) => v.document_id === d.id);
      const ver = await readUpload(ctx.db, file, d.id, Math.max(0, ...versions.map((v) => v.version_no)) + 1, self.id);
      if (typeof ver === "string") return fail(422, ver);
      for (const v of versions) v.is_active = false;
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
      const d = ctx.db.documents.find((x) => x.id === ctx.params.id && x.organization_id === self.organization_id);
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
      const index = ctx.db.documents.findIndex((x) => x.id === ctx.params.id && x.organization_id === self.organization_id);
      if (index < 0) return fail(404, "Dokumen tidak ditemukan.");
      const [removed] = ctx.db.documents.splice(index, 1);
      ctx.db.doc_versions = ctx.db.doc_versions.filter((v) => v.document_id !== removed.id);
      return ok(null, "Dokumen dihapus.");
    },
  },
];
