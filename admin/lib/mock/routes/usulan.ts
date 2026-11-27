import type { ProposalRequest, ProposalStatus } from "@/app/(admin)/admin/pengetahuan/types";
import { isFailure, newId, nowIso, requireManager, requireMember, text } from "../context";
import { fail, ok, type MockRoute } from "../router";
import { toProposal, type MockProposal } from "../web";

const BASE = "/api/v1/admin/pengetahuan/usulan";
const STATUSES: ProposalStatus[] = ["pending", "approved", "rejected"];

/** Didaftarkan sebelum route pengetahuan agar "usulan" tidak terbaca sebagai id dokumen. */
export const usulanRoutes: MockRoute[] = [
  {
    method: "GET",
    path: BASE,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      const status = ctx.query.get("status") ?? "";
      const all = ctx.db.knowledge_proposals.filter((p) => p.organization_id === self.organization_id);
      const summary: Record<ProposalStatus, number> = { pending: 0, approved: 0, rejected: 0 };
      for (const p of all) summary[p.status] += 1;
      const data = all
        .filter((p) => !STATUSES.includes(status as ProposalStatus) || p.status === status)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((p) => toProposal(ctx.db, p));
      return { status: 200, body: { success: true, statusCode: 200, total: data.length, skip: 0, limit: data.length, data, summary } };
    },
  },
  {
    method: "POST",
    path: BASE,
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      if (self.access_role === "viewer") return fail(403, "Pemantau tidak dapat mengusulkan pengetahuan.");
      const b = (ctx.body ?? {}) as Partial<ProposalRequest>;
      const url = text(b.url, 500);
      if (!/^https?:\/\/[^\s]+$/i.test(url)) return fail(422, "Alamat sumber tidak valid.");
      if (ctx.db.knowledge_proposals.some((p) => p.organization_id === self.organization_id && p.url === url && p.status === "pending")) {
        return fail(409, "Sumber ini sudah diusulkan dan menunggu keputusan admin.");
      }
      const proposal: MockProposal = {
        id: newId("usul"),
        organization_id: self.organization_id,
        url,
        title: text(b.title, 200) || url,
        excerpt: text(b.excerpt, 2000),
        status: "pending",
        task_id: typeof b.task_id === "string" && ctx.db.tasks.some((t) => t.id === b.task_id && t.organization_id === self.organization_id) ? b.task_id : null,
        agent_id: typeof b.agent_id === "string" && ctx.db.agents.some((a) => a.id === b.agent_id && a.organization_id === self.organization_id) ? b.agent_id : null,
        proposed_by_member_id: self.id,
        decided_by_member_id: null,
        decided_at: null,
        document_id: null,
        created_at: nowIso(),
      };
      ctx.db.knowledge_proposals.push(proposal);
      return ok(toProposal(ctx.db, proposal), "Usulan dikirim ke admin.", 201);
    },
  },
  {
    method: "POST",
    path: `${BASE}/:id/setujui`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const p = ctx.db.knowledge_proposals.find((x) => x.id === ctx.params.id && x.organization_id === self.organization_id);
      if (!p) return fail(404, "Usulan tidak ditemukan.");
      if (p.status !== "pending") return fail(409, "Usulan ini sudah diputuskan.");
      const at = nowIso();
      const docId = newId("doc");
      // Isi yang disimpan: judul, kutipan, dan alamat sumber. Backend mengambil ulang isi halaman saat disetujui.
      ctx.db.documents.push({
        id: docId,
        organization_id: self.organization_id,
        title: p.title,
        description: `Temuan internet dari ${new URL(p.url).hostname}.`,
        doc_type: "lainnya",
        category: "web",
        source_url: p.url,
        scope: "organization",
        scope_id: null,
        created_at: at,
        updated_at: at,
      });
      ctx.db.doc_versions.push({
        id: `${docId}-v1`,
        document_id: docId,
        version_no: 1,
        file_name: `${new URL(p.url).hostname}.md`,
        mime_type: "text/markdown",
        size_bytes: p.excerpt.length + p.url.length,
        sha256: `web-${p.id}`,
        is_active: true,
        processing_started_at: at,
        fail_reason: null,
        uploaded_by_member_id: self.id,
        sections: [{ page_no: 1, heading: p.title, text: `${p.excerpt}\n\nSumber: ${p.url}` }],
        created_at: at,
      });
      Object.assign(p, { status: "approved", decided_by_member_id: self.id, decided_at: at, document_id: docId });
      return ok(toProposal(ctx.db, p), "Usulan disetujui dan disimpan sebagai pengetahuan organisasi.");
    },
  },
  {
    method: "POST",
    path: `${BASE}/:id/tolak`,
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self;
      const p = ctx.db.knowledge_proposals.find((x) => x.id === ctx.params.id && x.organization_id === self.organization_id);
      if (!p) return fail(404, "Usulan tidak ditemukan.");
      if (p.status !== "pending") return fail(409, "Usulan ini sudah diputuskan.");
      Object.assign(p, { status: "rejected", decided_by_member_id: self.id, decided_at: nowIso() });
      return ok(toProposal(ctx.db, p), "Usulan ditolak.");
    },
  },
];
