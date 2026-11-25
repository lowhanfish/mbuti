import type { AgentActivity, OfficeAgent, OfficeState, OfficeTransfer, OfficeUnit } from "@/app/(admin)/admin/kantor/types";
import { UNIT_COLORS } from "@/app/(admin)/admin/organisasi/unit/types";
import { isFailure, requireMember } from "../context";
import { ok, type MockRoute } from "../router";
import type { MockDatabase } from "../seed";

const ACTIVE = ["queued", "running", "waiting_approval"];

const buildState = (db: MockDatabase, orgId: string): OfficeState => {
  const tasks = db.tasks.filter((t) => t.organization_id === orgId);
  const activeTasks = tasks.filter((t) => ACTIVE.includes(t.status));
  const dayAgo = Date.now() - 24 * 3600 * 1000;

  const agents: OfficeAgent[] = db.agents
    .filter((a) => a.organization_id === orgId)
    .map((a) => {
      let activity: AgentActivity = a.status === "paused" ? "paused" : a.status === "draft" ? "draft" : "idle";
      let taskId: string | null = null;
      for (const t of activeTasks) {
        const head = db.task_steps.find((s) => s.id === t.queue[0]);
        const waitingHere = db.approvals.some(
          (ap) => ap.task_id === t.id && ap.status === "pending" && db.task_steps.find((s) => s.id === ap.step_id)?.agent_id === a.id
        );
        if (head?.agent_id === a.id && head.status === "running") {
          activity = head.kind === "review" ? "reviewing" : head.kind === "consult" ? "consulting" : "working";
          taskId = t.id;
          break;
        }
        if (head?.agent_id === a.id && head.status === "queued") {
          activity = "incoming";
          taskId = t.id;
        } else if (waitingHere && activity !== "incoming") {
          activity = "waiting";
          taskId = t.id;
        }
      }
      const touched = new Set(
        db.task_steps.filter((s) => s.agent_id === a.id && s.started_at && new Date(s.started_at).getTime() > dayAgo).map((s) => s.task_id)
      );
      return {
        id: a.id,
        name: a.name,
        title: a.title,
        unit_id: a.unit_id,
        status: a.status,
        avatar: a.avatar,
        activity,
        task_id: taskId,
        task_title: taskId ? tasks.find((t) => t.id === taskId)?.title ?? null : null,
        tasks_today: touched.size,
      };
    });

  const units: OfficeUnit[] = db.units
    .filter((u) => u.organization_id === orgId)
    .map((u) => {
      const lead = db.memberships.find((m) => m.id === u.lead_member_id);
      const unitAgentIds = new Set(agents.filter((a) => a.unit_id === u.id).map((a) => a.id));
      return {
        id: u.id,
        name: u.name,
        code: u.code,
        color: UNIT_COLORS[u.color].hex,
        parent_id: u.parent_id,
        lead_name: lead ? db.users.find((x) => x.id === lead.user_id)?.full_name ?? null : null,
        member_count: db.memberships.filter((m) => m.unit_id === u.id && m.status === "active").length,
        document_count: db.documents.filter((d) => d.scope === "unit" && d.scope_id === u.id).length,
        active_task_count: activeTasks.filter((t) => db.task_steps.some((s) => s.task_id === t.id && unitAgentIds.has(s.agent_id))).length,
      };
    });

  const transfers: OfficeTransfer[] = activeTasks.flatMap((t) => {
    const head = db.task_steps.find((s) => s.id === t.queue[0]);
    if (!head || head.status !== "queued" || !head.parent_step_id) return [];
    const parent = db.task_steps.find((s) => s.id === head.parent_step_id);
    if (!parent || parent.agent_id === head.agent_id) return [];
    return [
      {
        task_id: t.id,
        from_agent_id: parent.agent_id,
        to_agent_id: head.agent_id,
        relation_type: db.relations.find((r) => r.id === head.via_relation_id)?.relation_type ?? null,
      },
    ];
  });

  return { units, agents, transfers, generated_at: new Date().toISOString() };
};

export const kantorRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/v1/admin/kantor/state",
    handler: (ctx) => {
      const self = requireMember(ctx);
      if (isFailure(self)) return self;
      return ok(buildState(ctx.db, self.organization_id));
    },
  },
];
