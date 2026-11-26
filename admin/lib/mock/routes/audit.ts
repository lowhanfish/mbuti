import { isFailure, requireManager } from "../context";
import { fail, paging, type MockRoute } from "../router";

export const auditRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/v1/admin/audit/read",
    handler: (ctx) => {
      const self = requireManager(ctx);
      if (isFailure(self)) return self.status === 403 ? fail(403, "Jejak audit hanya untuk pemilik dan admin.") : self;
      const search = (ctx.query.get("search") ?? "").trim().toLowerCase();
      const group = ctx.query.get("group") ?? "";
      const { skip, limit } = paging(ctx.query, 50);
      const found = ctx.db.audit_logs
        .filter((e) => e.organization_id === self.organization_id)
        .filter((e) => !group || e.action.startsWith(`${group}.`))
        .filter((e) => !search || [e.target, e.actor_name, e.actor_email].some((v) => v.toLowerCase().includes(search)))
        .reverse();
      const data = found.slice(skip, skip + limit).map(({ organization_id: _org, ...rest }) => {
        void _org;
        return rest;
      });
      return { status: 200, body: { success: true, statusCode: 200, total: found.length, skip, limit, data } };
    },
  },
];
