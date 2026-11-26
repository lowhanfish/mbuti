/**
 * Route khusus mode data contoh; tidak ada di backend.
 * Kotak keluar menggantikan email sungguhan, dan persetujuan organisasi menggantikan
 * skrip `scripts.setujui_organisasi` milik pengelola platform.
 */
import { currentUser } from "./auth";
import { sendApproved } from "../accounts";
import { fail, ok, type MockRoute } from "../router";

export const mockOnlyRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/v1/mock/outbox",
    handler: ({ db }) => ok(db.outbox),
  },
  {
    method: "DELETE",
    path: "/api/v1/mock/outbox",
    handler: ({ db }) => {
      db.outbox = [];
      return ok(null, "Kotak keluar dikosongkan.");
    },
  },
  {
    method: "POST",
    path: "/api/v1/mock/approve-organization",
    handler: ({ db }) => {
      const user = currentUser(db);
      const membership = user && db.memberships.find((m) => m.user_id === user.id && m.status === "active");
      const organization = membership && db.organizations.find((o) => o.id === membership.organization_id);
      if (!organization) return fail(401, "Silakan masuk terlebih dahulu.");
      organization.status = "active";
      if (user) sendApproved(db, user, organization.name);
      return ok(null, "Organisasi disetujui.");
    },
  },
];
